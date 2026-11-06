import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality, canEncodeVideo } from "mediabunny";

/**
 * Makes a picked video fit the upload limits in the browser, so nobody has to edit and pick it
 * again: videos over `maxBytes` (or longer than `maxSeconds`, which are cut to that length)
 * are re-encoded to MP4 (H.264, at most 720p) with a bitrate sized to land under `maxBytes`.
 * Uses the phone's own video encoder (WebCodecs), so a minute of video takes seconds, not
 * minutes. Videos already within the limits are returned unchanged.
 */

export type VideoCompressError = "UNSUPPORTED" | "TOO_LONG";
export class VideoCompressFailure extends Error {
  readonly code: VideoCompressError;
  constructor(code: VideoCompressError) {
    super(code);
    this.code = code;
  }
}

interface Options {
  maxBytes: number;
  /** Longer videos are cut to this length. */
  maxSeconds?: number;
  /** 0–1 while re-encoding. */
  onProgress?: (progress: number) => void;
}

export interface CompressedVideo {
  file: File;
  /** Whether it was re-encoded (or returned as is). */
  compressed: boolean;
  /** Whether the end was cut off to fit `maxSeconds`. */
  trimmed: boolean;
}

/** Longest side of the output (720p); smaller still when the bitrate is low. */
const MAX_SIDE = 1280;
const LOW_SIDE = 854;
/** No point spending more than this on a phone-sized video. */
const MAX_VIDEO_BPS = 3_500_000;
/** Below this, video turns to mush: better to fail than upload that. */
const MIN_VIDEO_BPS = 350_000;
/** Allowance for the (copied) sound track and the container. */
const AUDIO_BPS = 160_000;

export async function compressVideo(file: File, { maxBytes, maxSeconds, onProgress }: Options): Promise<CompressedVideo> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const duration = await input.computeDuration().catch(() => 0);
    const tooLong = !!maxSeconds && duration > maxSeconds + 0.5;
    if (file.size <= maxBytes && !tooLong) return { file, compressed: false, trimmed: false };
    if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") throw new VideoCompressFailure("UNSUPPORTED");

    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new VideoCompressFailure("UNSUPPORTED");
    const seconds = Math.max(1, tooLong ? maxSeconds! : duration);

    // Aim a little under the limit (bitrates are targets, not promises); try once more, smaller, if it lands over.
    for (const budget of [0.85, 0.6]) {
      const videoBps = Math.min(MAX_VIDEO_BPS, (maxBytes * 8 * budget) / seconds - AUDIO_BPS);
      if (videoBps < MIN_VIDEO_BPS) throw new VideoCompressFailure("TOO_LONG");
      const side = videoBps < 1_200_000 ? LOW_SIDE : MAX_SIDE;
      const longest = Math.max(track.displayWidth, track.displayHeight);
      const scale = Math.min(1, side / longest);
      const width = Math.max(2, Math.round((track.displayWidth * scale) / 2) * 2);
      const height = Math.max(2, Math.round((track.displayHeight * scale) / 2) * 2);
      if (!(await canEncodeVideo("avc", { width, height, bitrate: videoBps }))) throw new VideoCompressFailure("UNSUPPORTED");

      const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
      const conversion = await Conversion.init({
        input,
        output,
        // The sound is copied as it is where possible (phone videos are AAC already).
        video: { codec: "avc", width, quality: new Quality({ bitrate: Math.round(videoBps) }), frameRate: 30, forceTranscode: true },
        trim: tooLong ? { start: 0, end: maxSeconds } : undefined,
      });
      if (!conversion.isValid) throw new VideoCompressFailure("UNSUPPORTED");
      conversion.onProgress = (p) => onProgress?.(Math.min(1, p));
      await conversion.execute();

      const buffer = output.target.buffer;
      if (!buffer) throw new VideoCompressFailure("UNSUPPORTED");
      if (buffer.byteLength <= maxBytes) {
        const name = (file.name || "video").replace(/\.\w+$/, "") + ".mp4";
        return { file: new File([buffer], name, { type: "video/mp4" }), compressed: true, trimmed: tooLong };
      }
    }
    throw new VideoCompressFailure("TOO_LONG");
  } catch (e) {
    if (e instanceof VideoCompressFailure) throw e;
    throw new VideoCompressFailure("UNSUPPORTED");
  } finally {
    input.dispose?.();
  }
}

/** How long a video is, by the browser's own player (null if it can't tell). */
export function videoSeconds(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (s: number | null) => {
      URL.revokeObjectURL(url);
      resolve(s);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

export type FitVideoResult = ({ ok: true } & CompressedVideo) | { ok: false; error: "FILE_TOO_LARGE" | "TOO_LONG" };

/**
 * A picked video, ready to upload: re-encoded to under `targetBytes` (and cut to `maxSeconds`)
 * when it's bigger. Where this browser can't re-encode, the original still goes if it's within
 * `maxBytes` and `maxSeconds`; otherwise the reason it can't.
 */
export async function fitVideo(
  file: File,
  { maxBytes, targetBytes, maxSeconds, onProgress }: { maxBytes: number; targetBytes: number; maxSeconds?: number; onProgress?: (p: number) => void },
): Promise<FitVideoResult> {
  try {
    return { ok: true, ...(await compressVideo(file, { maxBytes: Math.min(maxBytes, targetBytes), maxSeconds, onProgress })) };
  } catch (e) {
    if (e instanceof VideoCompressFailure && e.code === "TOO_LONG") return { ok: false, error: "TOO_LONG" };
    if (file.size > maxBytes) return { ok: false, error: "FILE_TOO_LARGE" };
    const seconds = maxSeconds ? await videoSeconds(file) : null;
    if (maxSeconds && seconds !== null && seconds > maxSeconds + 1) return { ok: false, error: "TOO_LONG" };
    return { ok: true, file, compressed: false, trimmed: false };
  }
}
