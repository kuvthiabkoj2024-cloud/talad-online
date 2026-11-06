import { MEDIA_LIMITS, RETURN_FILE_TYPES, RETURN_RULES } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Label } from '@talad/ui/components/label'
import { Textarea } from '@talad/ui/components/textarea'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, LoaderCircle, PackageX, Video, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { ApiError, send, upload } from '@/lib/api'
import { compressImage } from '@/lib/compress-image'
import { fitVideo } from '@/lib/compress-video'
import { fill } from '@/lib/format'

interface Picked {
  id: string
  file: File
  preview: string
  /** Set once uploaded, so sending again after an error doesn't upload it twice. */
  key?: string
}

const isVideo = (file: File) => file.type.startsWith('video/')

/**
 * A COD order the customer never took: the shop sends proof to MC Mart. Once an admin
 * approves, the order is cancelled and counts for no commission.
 */
export function NotCollectedReport({ number }: { number: string }) {
  const { t } = useI18n()
  const c = t.orders.notCollected
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState('')
  const [files, setFiles] = useState<Picked[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Making a big photo or video smaller before it's added: 0–100. */
  const [shrinking, setShrinking] = useState<number | null>(null)
  const busy = progress !== null || shrinking !== null
  const message = (code: string | undefined) => (code && code in c.errors ? c.errors[code as keyof typeof c.errors] : t.common.saveError)

  // Big photos and videos are made smaller here rather than refused (evidence is never cut short).
  async function pick(list: FileList | null) {
    setError(null)
    const next = [...files]
    const stop = (code: string) => (setFiles(next), setError(message(code)))
    for (const picked of Array.from(list ?? [])) {
      const tooMany = next.length >= RETURN_RULES.maxFiles || (isVideo(picked) && next.some((f) => isVideo(f.file)))
      if (tooMany) return stop('TOO_MANY_FILES')
      let file = picked
      if (isVideo(file)) {
        setShrinking(0)
        const fit = await fitVideo(file, {
          maxBytes: RETURN_RULES.videoMaxBytes,
          targetBytes: MEDIA_LIMITS.videoTargetBytes,
          onProgress: (p) => setShrinking(Math.round(p * 100)),
        })
        setShrinking(null)
        if (!fit.ok) return stop('FILE_TOO_LARGE')
        file = fit.file
      } else if (file.size > RETURN_RULES.imageMaxBytes) {
        file = await compressImage(file, { maxSide: 2560, maxBytes: RETURN_RULES.imageMaxBytes * 0.9 })
        if (file.size > RETURN_RULES.imageMaxBytes) return stop('FILE_TOO_LARGE')
      }
      next.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) })
    }
    setFiles(next)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!files.length) return setError(message('EVIDENCE_REQUIRED'))
    setError(null)
    setProgress(0)
    const path = `/me/shop/orders/${encodeURIComponent(number)}/return`
    try {
      const keys: string[] = []
      for (const [i, picked] of files.entries()) {
        picked.key ??= (await upload<{ key: string }>(`${path}/evidence`, picked.file, (f) => setProgress(Math.round(((i + f) / files.length) * 100)))).key
        keys.push(picked.key)
      }
      await send('POST', path, { details: details.trim() || undefined, evidenceKeys: keys })
      await queryClient.invalidateQueries({ queryKey: queryKeys.order(number) })
      toast.success(c.sent)
      setOpen(false)
    } catch (err) {
      setError(message(err instanceof ApiError ? err.code : undefined))
    } finally {
      setProgress(null)
    }
  }

  return (
    <>
      <Card className="py-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4">
          <div className="min-w-0 flex-1 basis-64">
            <p className="font-medium">{c.title}</p>
            <p className="text-sm text-muted-foreground">{c.body}</p>
          </div>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <PackageX />
            {c.action}
          </Button>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-lg">
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{c.action}</DialogTitle>
              <DialogDescription>{c.body}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label required>{c.files}</Label>
              <p className="text-xs text-muted-foreground">{fill(c.filesHint, { files: RETURN_RULES.maxFiles, mb: Math.round(RETURN_RULES.videoMaxBytes / (1024 * 1024)) })}</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {files.map((f) => (
                  <li key={f.id} className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
                    {isVideo(f.file) ? (
                      <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-muted-foreground">
                        <Video className="size-6" />
                        <span className="line-clamp-1 max-w-full text-xs">{f.file.name}</span>
                      </span>
                    ) : (
                      <img src={f.preview} alt="" className="size-full object-cover" />
                    )}
                    <button
                      type="button"
                      aria-label={c.remove}
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
                      className="flex size-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-1 text-center text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      <ImagePlus className="size-6" />
                      {c.add}
                    </button>
                  </li>
                )}
              </ul>
              {shrinking !== null && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  {fill(t.editor.compressing, { pct: shrinking })}
                </p>
              )}
              <input
                ref={input}
                type="file"
                multiple
                accept={RETURN_FILE_TYPES}
                className="sr-only"
                onChange={(e) => {
                  void pick(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="not-collected-details">
                {c.details} <span className="font-normal text-muted-foreground">({t.common.optional})</span>
              </Label>
              <Textarea id="not-collected-details" rows={3} maxLength={RETURN_RULES.detailsMax} disabled={busy} value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <LoaderCircle className="animate-spin" />}
                {busy ? fill(c.uploading, { percent: progress ?? 0 }) : c.send}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
