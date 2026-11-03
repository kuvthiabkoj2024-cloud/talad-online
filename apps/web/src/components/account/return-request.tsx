"use client";

import { RETURN_FILE_TYPES, RETURN_REASONS, RETURN_RULES, type ReturnReason } from "@talad/shared";
import { ImagePlus, LoaderCircle, RotateCcw, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { requestReturn } from "@/lib/cart-actions";
import { interpolate } from "@/lib/format";

export interface ReturnLabels {
  title: string;
  body: string;
  until: string;
  open: string;
  reason: string;
  reasons: Record<ReturnReason, string>;
  details: string;
  files: string;
  filesHint: string;
  addFiles: string;
  remove: string;
  send: string;
  uploading: string;
  cancel: string;
  errors: Record<string, string>;
}

interface Picked {
  id: string;
  file: File;
  preview: string;
  /** Set once uploaded, so sending again after an error doesn't upload it twice. */
  key?: string;
}

const isVideo = (file: File) => file.type.startsWith("video/");

/** Sends one file through the storefront (/api/orders/…/return-evidence), reporting progress. */
function uploadFile(number: string, file: File, onProgress: (fraction: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("file", file);
    // XMLHttpRequest, not fetch: it reports upload progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/orders/${encodeURIComponent(number)}/return-evidence`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { key?: string; code?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText) as { key?: string; code?: string };
      } catch {
        // not JSON (e.g. a proxy error page)
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.key) resolve(body.key);
      else reject(new Error(xhr.status === 413 ? "FILE_TOO_LARGE" : (body?.code ?? "generic")));
    };
    xhr.onerror = () => reject(new Error("generic"));
    xhr.send(form);
  });
}

/** Asking for a return: a reason and photos or a clip, sent directly to MC Mart. */
export function ReturnRequest({ orderNumber, deadline, pointsNote, labels }: { orderNumber: string; deadline: string | null; pointsNote: string | null; labels: ReturnLabels }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;
  const message = (code: string) => labels.errors[code] ?? labels.errors.generic;

  function pick(list: FileList | null) {
    setError(null);
    const next = [...files];
    for (const file of Array.from(list ?? [])) {
      if (next.length >= RETURN_RULES.maxFiles) return setFiles(next), setError(message("TOO_MANY_FILES"));
      if (isVideo(file) && next.some((f) => isVideo(f.file))) return setFiles(next), setError(message("TOO_MANY_FILES"));
      if (file.size > (isVideo(file) ? RETURN_RULES.videoMaxBytes : RETURN_RULES.imageMaxBytes)) return setFiles(next), setError(message("FILE_TOO_LARGE"));
      next.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
    }
    setFiles(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return setError(message("REASON_REQUIRED"));
    if (!files.length) return setError(message("EVIDENCE_REQUIRED"));
    setError(null);
    setProgress(0);
    try {
      const keys: string[] = [];
      for (const [i, picked] of files.entries()) {
        const onProgress = (f: number) => setProgress(Math.round(((i + f) / files.length) * 100));
        picked.key ??= await uploadFile(orderNumber, picked.file, onProgress);
        keys.push(picked.key);
      }
      const res = await requestReturn(orderNumber, { reason, details: details.trim() || undefined, evidenceKeys: keys });
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(message(err instanceof Error ? err.message : "generic"));
      setProgress(null);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-semibold">{labels.title}</p>
          <p className="text-sm text-muted-foreground">{deadline ? interpolate(labels.until, { date: deadline }) : labels.body}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          <RotateCcw className="size-4" />
          {labels.open}
        </button>
      </div>
    );
  }

  const inputClass = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div>
        <p className="font-semibold">{labels.open}</p>
        <p className="text-sm text-muted-foreground">{labels.body}</p>
        {pointsNote && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">{pointsNote}</p>}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>
          {labels.reason} <span className="text-sale">*</span>
        </span>
        <select value={reason} disabled={busy} onChange={(e) => (setReason(e.target.value as ReturnReason), setError(null))} className={inputClass}>
          <option value="" disabled />
          {RETURN_REASONS.map((r) => (
            <option key={r} value={r}>
              {labels.reasons[r]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">
          {labels.files} <span className="text-sale">*</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {interpolate(labels.filesHint, { files: RETURN_RULES.maxFiles, mb: Math.round(RETURN_RULES.videoMaxBytes / (1024 * 1024)) })}
        </p>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {files.map((f) => (
            <li key={f.id} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
              {isVideo(f.file) ? (
                <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-muted-foreground">
                  <Video className="size-6" />
                  <span className="line-clamp-1 max-w-full text-xs">{f.file.name}</span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked file
                <img src={f.preview} alt="" className="size-full object-cover" />
              )}
              <button
                type="button"
                aria-label={labels.remove}
                disabled={busy}
                onClick={() => (URL.revokeObjectURL(f.preview), setFiles(files.filter((x) => x.id !== f.id)))}
                className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
          {files.length < RETURN_RULES.maxFiles && (
            <li className="aspect-square">
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                className="flex size-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border p-1 text-center text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <ImagePlus className="size-6" />
                {labels.addFiles}
              </button>
            </li>
          )}
        </ul>
        <input
          ref={input}
          type="file"
          multiple
          accept={RETURN_FILE_TYPES}
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {labels.details}
        <textarea rows={3} value={details} disabled={busy} maxLength={RETURN_RULES.detailsMax} onChange={(e) => setDetails(e.target.value)} className={inputClass} />
      </label>

      {error && (
        <p role="alert" className="text-sm text-sale">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted">
          {labels.cancel}
        </button>
        <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70">
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {busy ? interpolate(labels.uploading, { percent: progress ?? 0 }) : labels.send}
        </button>
      </div>
    </form>
  );
}
