import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { cn } from '@talad/ui/lib/utils'
import { ChevronLeft, ChevronRight, Download, FileText, ImageOff, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/context'
import { fill } from '@/lib/format'
import { usePrivateFile, type PrivateFile } from '@/lib/private-file'

const isImage = (type: string) => type.startsWith('image/')
const isPdf = (type: string) => type === 'application/pdf'

/** The file at full size: an image, a PDF in a frame, or a download for anything else. */
function FileBody({ file, title }: { file: PrivateFile; title: string }) {
  const { t } = useI18n()
  if (isImage(file.type)) return <img src={file.url} alt={title} className="max-h-[75vh] w-full rounded-lg bg-white object-contain" />
  if (isPdf(file.type)) return <iframe src={file.url} title={title} className="h-[75vh] w-full rounded-lg border bg-white" />
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
      <FileText className="size-10" />
      <Button asChild variant="outline">
        <a href={file.url} download>
          <Download />
          {t.common.downloadFile}
        </a>
      </Button>
    </div>
  )
}

/** Title row actions: save the file without leaving the page. */
function DownloadButton({ url, name }: { url: string; name: string }) {
  const { t } = useI18n()
  return (
    <Button asChild variant="outline" size="sm" className="self-start">
      <a href={url} download={name}>
        <Download />
        {t.common.downloadFile}
      </a>
    </Button>
  )
}

/**
 * A private file (KYC document, payment slip) as a thumbnail; clicking it opens it in a
 * modal. Fetched with the admin's session, since these files aren't public.
 */
export function PrivateFileThumb({
  path,
  title,
  caption,
  className,
}: {
  path: string
  title: string
  /** Under the thumbnail (e.g. the upload date). */
  caption?: string
  className?: string
}) {
  const { t } = useI18n()
  const file = usePrivateFile(path)
  const [open, setOpen] = useState(false)
  const ext = file.data?.type.split('/').pop()?.toUpperCase()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!file.data}
        title={title}
        className={cn('group flex w-32 flex-col gap-1.5 text-left disabled:cursor-default', className)}
      >
        <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-muted text-muted-foreground transition-colors group-enabled:group-hover:border-primary/60">
          {file.isPending ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : !file.data ? (
            <ImageOff className="size-6" />
          ) : isImage(file.data.type) ? (
            <img src={file.data.url} alt="" className="size-full bg-white object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1">
              <FileText className="size-8" />
              <span className="text-xs font-semibold">{ext}</span>
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          {caption && <span className="block truncate text-xs text-muted-foreground">{caption}</span>}
          {file.isError && <span className="block text-xs text-destructive">{t.common.fileFailed}</span>}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={cn(!caption && 'sr-only')}>{caption ?? title}</DialogDescription>
          </DialogHeader>
          {file.data && (
            <>
              <FileBody file={file.data} title={title} />
              <DownloadButton url={file.data.url} name={`${title}.${ext?.toLowerCase() ?? 'file'}`} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Public images (product photos) as thumbnails; clicking one opens a modal to page through them. */
export function ImageGallery({ urls, title, thumbClassName }: { urls: string[]; title: string; thumbClassName?: string }) {
  const { t } = useI18n()
  const [index, setIndex] = useState<number | null>(null)
  const go = (step: number) => setIndex((i) => (i === null ? i : (i + step + urls.length) % urls.length))

  // ← / → page through the photos while the modal is open.
  useEffect(() => {
    if (index === null || urls.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      {urls.map((u, i) => (
        <button
          key={u}
          type="button"
          onClick={() => setIndex(i)}
          aria-label={fill(t.common.imageOf, { n: i + 1, total: urls.length })}
          className={cn('block size-40 overflow-hidden rounded-xl border bg-muted transition-colors hover:border-primary/60', thumbClassName)}
        >
          <img src={u} alt="" className="size-full object-cover" />
        </button>
      ))}
      <Dialog open={index !== null} onOpenChange={(open) => !open && setIndex(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{index !== null && fill(t.common.imageOf, { n: index + 1, total: urls.length })}</DialogDescription>
          </DialogHeader>
          {index !== null && (
            <div className="relative">
              <img src={urls[index]} alt="" className="max-h-[75vh] w-full rounded-lg bg-muted object-contain" />
              {urls.length > 1 && (
                <>
                  <Button type="button" variant="secondary" size="icon" aria-label={t.common.prev} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full shadow" onClick={() => go(-1)}>
                    <ChevronLeft />
                  </Button>
                  <Button type="button" variant="secondary" size="icon" aria-label={t.common.next} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full shadow" onClick={() => go(1)}>
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
          )}
          {index !== null && urls.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {urls.map((u, i) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn('size-14 shrink-0 overflow-hidden rounded-lg border-2', i === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100')}
                >
                  <img src={u} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
