"use client";

import { FEED_POST_RULES, MEDIA_LIMITS, type Locale } from "@talad/shared";
import { CircleAlert, Clapperboard, LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { interpolate } from "@/lib/format";

type Dict = Dictionary["feedPost"];
type ErrorKey = keyof Dict["errors"];

/** How long a picked video is (null if the browser can't tell). */
function videoSeconds(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => resolve(null);
    v.src = url;
  });
}

/**
 * Pick (or film) a short video, add a caption, post it. Uploads with a progress bar through
 * the storefront (/api/feed-posts), then opens the feed on the new post.
 */
export function NewPostForm({ locale, dict }: { locale: Locale; dict: Dict }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!f.type.startsWith("video/")) return setError("INVALID_VIDEO");
    if (f.size > MEDIA_LIMITS.maxVideoBytes) return setError("FILE_TOO_LARGE");
    const url = URL.createObjectURL(f);
    const seconds = await videoSeconds(url);
    if (seconds !== null && seconds > MEDIA_LIMITS.maxVideoSeconds + 1) {
      URL.revokeObjectURL(url);
      return setError("TOO_LONG");
    }
    setFile(f);
    setPreview(url);
  }

  function post() {
    if (!file || progress !== null) return;
    setError(null);
    const form = new FormData();
    form.set("file", file, file.name || "video.mp4");
    if (caption.trim()) form.set("caption", caption.trim());
    // XMLHttpRequest, not fetch: it reports upload progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/feed-posts");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { id?: string; code?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText) as { id?: string; code?: string };
      } catch {
        // not JSON (e.g. a proxy error page)
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.id) {
        router.push(`/${locale}/feed?post=${body.id}`);
        return;
      }
      setProgress(null);
      if (xhr.status === 401) return router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/feed/new`)}`);
      if (xhr.status === 413) return setError("FILE_TOO_LARGE");
      const code = body?.code as ErrorKey | undefined;
      setError(code && code in dict.errors ? code : "generic");
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("generic");
    };
    setProgress(0);
    xhr.send(form);
  }

  const busy = progress !== null;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{dict.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {interpolate(dict.hint, { seconds: MEDIA_LIMITS.maxVideoSeconds, mb: Math.round(MEDIA_LIMITS.maxVideoBytes / 1024 / 1024) })}
        </p>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-70 ${
          preview ? "aspect-[9/16] max-h-[60dvh] border-solid bg-black" : "h-56 bg-card"
        }`}
      >
        {preview ? (
          <video src={preview} className="size-full object-contain" muted autoPlay loop playsInline />
        ) : (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Clapperboard className="size-7" />
            </span>
            {dict.chooseVideo}
          </>
        )}
      </button>
      {preview && !busy && (
        <button type="button" onClick={() => input.current?.click()} className="-mt-3 self-center text-sm font-semibold text-primary hover:underline">
          {dict.changeVideo}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
        capture="environment"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{dict.caption}</span>
        <textarea
          value={caption}
          maxLength={FEED_POST_RULES.captionMax}
          rows={3}
          disabled={busy}
          placeholder={dict.captionPlaceholder}
          onChange={(e) => setCaption(e.target.value)}
          className="resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        <span className="self-end text-xs text-muted-foreground tabular-nums">
          {caption.length}/{FEED_POST_RULES.captionMax}
        </span>
      </label>

      <p className="rounded-xl bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">{dict.rules}</p>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-sale">
          <CircleAlert className="size-4 shrink-0" />
          {interpolate(dict.errors[error], { seconds: MEDIA_LIMITS.maxVideoSeconds, mb: Math.round(MEDIA_LIMITS.maxVideoBytes / 1024 / 1024) })}
        </p>
      )}

      {busy && (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-center text-xs text-muted-foreground">{interpolate(dict.uploading, { n: progress ?? 0 })}</p>
        </div>
      )}

      <button
        type="button"
        onClick={post}
        disabled={!file || busy}
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-primary-foreground shadow-md transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
      >
        {busy ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}
        {dict.post}
      </button>
    </div>
  );
}
