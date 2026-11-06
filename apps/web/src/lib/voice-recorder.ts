/**
 * Records a short spoken search as 16 kHz mono 16-bit WAV (what the API's speech service
 * takes), and stops by itself: shortly after the speaker stops, after `maxMs`, or when no one
 * speaks at all. Works in every browser with a microphone (no speech recognition needed).
 */

const RATE = 16_000;

export interface VoiceRecording {
  /** Stop now and keep what was recorded. */
  stop(): void;
  /** Stop and throw it away. */
  cancel(): void;
}

export type RecordEnd =
  | { kind: "audio"; wav: Blob; ms: number }
  | { kind: "silent" } // nobody spoke
  | { kind: "cancelled" };

interface Options {
  maxMs?: number;
  /** How long a pause ends the recording once speech has started. */
  pauseMs?: number;
  /** Give up when nothing is said within this long. */
  waitMs?: number;
  /** 0–1 loudness, for a level meter. */
  onLevel?: (level: number) => void;
}

/** Starts recording; rejects when the microphone can't be used (`NotAllowedError` when denied). */
export async function recordVoice(done: (end: RecordEnd) => void, opts: Options = {}): Promise<VoiceRecording> {
  const { maxMs = 10_000, pauseMs = 1_300, waitMs = 6_000, onLevel } = opts;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  await ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is old but works everywhere (an AudioWorklet would need its own script file).
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;

  const chunks: Float32Array[] = [];
  const started = performance.now();
  let noise = 0.01; // the room's background level, learned while waiting
  let spoke = false;
  let lastVoice = 0;
  let finished = false;

  const finish = (how: "keep" | "cancel") => {
    if (finished) return;
    finished = true;
    node.onaudioprocess = null;
    source.disconnect();
    node.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
    if (how === "cancel") return done({ kind: "cancelled" });
    if (!spoke) return done({ kind: "silent" });
    const pcm = resample(chunks, ctx.sampleRate);
    done({ kind: "audio", wav: toWav(pcm), ms: Math.round((pcm.length / RATE) * 1000) });
  };

  node.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const now = performance.now();
    const elapsed = now - started;
    onLevel?.(Math.min(1, rms * 12));

    const threshold = Math.max(0.02, noise * 3);
    if (rms > threshold) {
      spoke = true;
      lastVoice = now;
    } else if (!spoke) {
      noise = noise * 0.9 + rms * 0.1;
    }
    if (elapsed > maxMs) finish("keep");
    else if (spoke && now - lastVoice > pauseMs) finish("keep");
    else if (!spoke && elapsed > waitMs) finish("keep");
  };
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);

  return { stop: () => finish("keep"), cancel: () => finish("cancel") };
}

/** Joins the recorded blocks and resamples them to 16 kHz (averaging, so no aliasing hiss). */
function resample(chunks: Float32Array[], from: number): Int16Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  const ratio = from / RATE;
  const out = new Int16Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(total, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += all[j];
    const s = Math.max(-1, Math.min(1, sum / (end - start)));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function toWav(pcm: Int16Array): Blob {
  const header = new DataView(new ArrayBuffer(44));
  const text = (at: number, s: string) => [...s].forEach((ch, i) => header.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  header.setUint32(4, 36 + pcm.byteLength, true);
  text(8, "WAVE");
  text(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, RATE, true);
  header.setUint32(28, RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  text(36, "data");
  header.setUint32(40, pcm.byteLength, true);
  return new Blob([header.buffer, pcm.buffer as ArrayBuffer], { type: "audio/wav" });
}
