"use client";

import type { Locale } from "@talad/shared";
import { LoaderCircle, Mic } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { transcribeVoice, voiceSearchAvailable } from "@/lib/search-actions";
import { recordVoice, type VoiceRecording } from "@/lib/voice-recorder";

type Dict = Pick<Dictionary["header"], "voice" | "listening" | "voiceUnsupported" | "voiceDenied" | "voiceNoSpeech" | "voiceEnglishOnly" | "voiceLanguage" | "voiceAuto" | "voiceWorking" | "voiceFailed">;

// The Web Speech API isn't in TypeScript's DOM types: just the parts used here.
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};
/** Once words have been heard, this long without new ones ends listening (iPhones never stop by themselves). */
const PAUSE_MS = 1_400;
/** Give up when nothing at all is heard for this long. */
const WAIT_MS = 8_000;

/**
 * The words heard so far. Desktop Chrome splits a phrase into pieces (join them), while
 * Android Chrome repeats everything said so far in each piece (keep only the longest).
 */
function transcriptOf(results: ArrayLike<ArrayLike<{ transcript: string }>>): string {
  let text = "";
  for (const res of Array.from(results)) {
    const piece = res[0]?.transcript ?? "";
    const t = piece.trim();
    if (!t) continue;
    const have = text.trim().toLowerCase();
    if (t.toLowerCase().startsWith(have)) text = t; // the same phrase, grown (Android)
    else if (!have.includes(t.toLowerCase())) text += piece; // the next piece (desktop)
  }
  return text.trim();
}

const canRecord = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined";
/** Asked once per page load: does the API understand Lao and English itself? */
let serverVoice: Promise<boolean> | null = null;
const serverAvailable = () => (serverVoice ??= voiceSearchAvailable().catch(() => false));
type VoiceLang = "lo" | "en";
const LANGS: Record<VoiceLang, string> = { lo: "lo-LA", en: "en-US" };
const LANG_NAMES: Record<VoiceLang, string> = { lo: "ລາວ", en: "English" };
/** The language the shopper last chose to speak in (this browser). */
const LANG_KEY = "talad_voice_lang";

function savedLang(): VoiceLang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "lo" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

/**
 * The microphone in the header search box: speak, and when the speaker stops the words are
 * searched (the form is submitted).
 *
 * - With the API's speech service set up (`GOOGLE_SPEECH_API_KEY`), it understands Lao and
 *   English by itself: the recording goes to the API, which hears either language. Works in
 *   every browser with a microphone.
 * - Otherwise the browser listens itself, in one language at a time: a ລາວ | English switch
 *   picks which (remembered). Where the browser can't listen in Lao (Safari) it uses English.
 */
export function VoiceSearchButton({ locale, dict }: { locale: Locale; dict: Dict }) {
  const supported = useSyncExternalStore(noSubscribe, () => recognitionClass() !== null || canRecord(), () => false);
  const button = useRef<HTMLButtonElement>(null);
  const active = useRef<Recognition | null>(null);
  const recorder = useRef<VoiceRecording | null>(null);
  /** A language switch waiting for the previous session to let go of the microphone. */
  const nextLang = useRef<VoiceLang | null>(null);
  // "auto": recording for the API (either language); "lo" / "en": the browser listening in one.
  const [listening, setListening] = useState<VoiceLang | "auto" | null>(null);
  const [working, setWorking] = useState(false);
  const [level, setLevel] = useState(0);
  const [auto, setAuto] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Find out early (not on the tap) so recording starts within the tap itself (iPhones need that).
  useEffect(() => {
    let live = true;
    void serverAvailable().then((ok) => live && setAuto(ok && canRecord()));
    return () => {
      live = false;
    };
  }, []);

  // A note fades after a few seconds; leaving the page stops listening.
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 4500);
    return () => clearTimeout(id);
  }, [note]);
  useEffect(
    () => () => {
      active.current?.abort();
      recorder.current?.cancel();
    },
    [],
  );

  if (!supported) return null;

  function listen(lang: VoiceLang) {
    const Class = recognitionClass();
    const form = button.current?.form;
    const input = form?.elements.namedItem("q");
    if (!Class || !form || !(input instanceof HTMLInputElement)) return;
    const placeholder = input.dataset.placeholder ?? input.placeholder;
    input.dataset.placeholder = placeholder;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Remembering is only a convenience.
    }

    const r = new Class();
    r.lang = LANGS[lang];
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let heard = "";
    let submitted = false;
    let retryInEnglish = false;
    let failed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Events from a session being replaced (language switched) are ignored.
    const current = () => active.current === r && nextLang.current === null;
    /** Stop listening after `ms` unless more words arrive (phones may never stop on their own). */
    const stopAfter = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (active.current === r) r.stop();
      }, ms);
    };
    const submit = () => {
      if (submitted || !heard) return;
      submitted = true;
      input.value = heard;
      form.requestSubmit();
    };

    r.onresult = (e) => {
      if (!current()) return;
      heard = transcriptOf(e.results);
      input.value = heard;
      const last = e.results[e.results.length - 1];
      if (last?.isFinal && heard) {
        clearTimeout(timer);
        r.stop();
        submit();
      } else if (heard) stopAfter(PAUSE_MS);
    };
    r.onerror = (e) => {
      if (!current()) return;
      failed = e.error !== "no-speech";
      if (e.error === "language-not-supported" && lang !== "en") {
        retryInEnglish = true;
        setNote(dict.voiceEnglishOnly);
      } else if (e.error === "not-allowed" || e.error === "service-not-allowed") setNote(dict.voiceDenied);
      else if (e.error === "no-speech") setNote(dict.voiceNoSpeech);
      else if (e.error !== "aborted") setNote(dict.voiceUnsupported);
    };
    r.onend = () => {
      clearTimeout(timer);
      if (active.current !== r) return;
      active.current = null;
      // A language switch: the microphone is free now, start again in the other language.
      const next = nextLang.current;
      if (next) {
        nextLang.current = null;
        return listen(next);
      }
      input.placeholder = placeholder;
      // Phones often end without a final result: search what was heard.
      submit();
      if (!heard && !failed && !retryInEnglish) setNote(dict.voiceNoSpeech);
      if (retryInEnglish) listen("en");
      else setListening(null);
    };

    active.current = r;
    input.value = "";
    input.placeholder = dict.listening;
    setListening(lang);
    try {
      r.start();
      stopAfter(WAIT_MS);
    } catch {
      active.current = null;
      input.placeholder = placeholder;
      setListening(null);
      setNote(dict.voiceUnsupported);
    }
  }

  /** Records until the speaker stops, then the API works out the words (Lao or English). */
  function recordForServer() {
    const form = button.current?.form;
    const input = form?.elements.namedItem("q");
    if (!form || !(input instanceof HTMLInputElement)) return;
    const placeholder = input.dataset.placeholder ?? input.placeholder;
    input.dataset.placeholder = placeholder;
    input.value = "";
    input.placeholder = dict.listening;
    setListening("auto");
    setLevel(0);

    const reset = () => {
      recorder.current = null;
      input.placeholder = placeholder;
      setListening(null);
      setWorking(false);
    };
    recordVoice(
      async (end) => {
        recorder.current = null;
        if (end.kind === "cancelled") return reset();
        if (end.kind === "silent") {
          reset();
          return setNote(dict.voiceNoSpeech);
        }
        setListening(null);
        setWorking(true);
        input.placeholder = dict.voiceWorking;
        const body = new FormData();
        body.set("audio", end.wav, "voice.wav");
        body.set("locale", locale);
        const res = await transcribeVoice(body).catch(() => null);
        reset();
        if (res?.ok && res.text) {
          input.value = res.text;
          form.requestSubmit();
        } else if (res?.ok) setNote(dict.voiceNoSpeech);
        else setNote(dict.voiceFailed);
      },
      { onLevel: setLevel },
    )
      .then((r) => {
        recorder.current = r;
      })
      .catch((e: unknown) => {
        reset();
        setNote(e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError") ? dict.voiceDenied : dict.voiceUnsupported);
      });
  }

  function toggle() {
    if (working) return;
    if (recorder.current) return recorder.current.stop();
    if (active.current) return active.current.stop();
    setNote(null);
    if (auto) recordForServer();
    else if (recognitionClass()) listen(savedLang() ?? locale);
    else setNote(dict.voiceUnsupported);
  }

  /** Start over in the other language (the current session is dropped). */
  function switchTo(lang: VoiceLang) {
    if (lang === listening || nextLang.current) return;
    setNote(null);
    setListening(lang);
    const old = active.current;
    if (!old) return listen(lang);
    // Phones keep the microphone until the old session has ended: start again from its `end`.
    nextLang.current = lang;
    old.abort();
    // In case a browser never reports the old session ending.
    setTimeout(() => {
      if (nextLang.current !== lang || active.current !== old) return;
      nextLang.current = null;
      active.current = null;
      listen(lang);
    }, 1_200);
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-label={listening ? dict.listening : dict.voice}
        aria-pressed={!!listening}
        title={dict.voice}
        className={`relative rounded-full p-2 transition-colors ${
          listening ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {listening && <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" aria-hidden />}
        {working ? <LoaderCircle className="relative size-5 animate-spin" /> : <Mic className="relative size-5" />}
      </button>
      {listening === "auto" && (
        <div className="absolute left-3 right-3 top-full z-50 mt-2 flex items-center justify-between gap-3 rounded-2xl bg-card px-3 py-2 text-foreground shadow-lg ring-1 ring-border">
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
            <span className="truncate">{dict.voiceAuto}</span>
          </span>
          {/* How loud it hears you: shows the microphone is working. */}
          <span className="flex h-4 shrink-0 items-center gap-0.5" aria-hidden>
            {[0.5, 0.8, 1, 0.8, 0.5].map((k, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-primary transition-[height] duration-100"
                style={{ height: `${Math.max(15, Math.min(100, level * k * 140))}%` }}
              />
            ))}
          </span>
        </div>
      )}
      {(listening === "lo" || listening === "en") && (
        <div className="absolute left-3 right-3 top-full z-50 mt-2 flex items-center justify-between gap-3 rounded-2xl bg-card px-3 py-2 text-foreground shadow-lg ring-1 ring-border">
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
            <span className="truncate">{dict.voiceLanguage}</span>
          </span>
          <div role="radiogroup" aria-label={dict.voiceLanguage} className="flex shrink-0 rounded-full bg-muted p-0.5">
            {(["lo", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={listening === l}
                onClick={() => switchTo(l)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  listening === l ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
      )}
      {note && !listening && (
        <p
          role="status"
          className="absolute left-3 right-3 top-full z-50 mt-2 rounded-xl bg-foreground/90 px-3 py-2 text-xs leading-relaxed text-background shadow-lg"
        >
          {note}
        </p>
      )}
    </>
  );
}
