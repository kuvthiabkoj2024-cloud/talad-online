import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { LoaderCircle, Play } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/i18n/context'
import { usePrivateImage } from '@/lib/private-file'
import type { DisputeRow } from '@/lib/types'

type Evidence = DisputeRow['evidence'][number]

/** A photo's thumbnail; a video is only fetched when opened, since clips can be large. */
function Thumb({ path, item, onOpen }: { path: string; item: Evidence; onOpen: () => void }) {
  const { t } = useI18n()
  const image = usePrivateImage(item.kind === 'IMAGE' ? path : null)
  return (
    <button type="button" onClick={onOpen} aria-label={t.disputes.openEvidence} className="flex size-20 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground transition-colors hover:border-primary/50">
      {item.kind === 'VIDEO' ? <Play className="size-6" /> : image.data ? <img src={image.data} alt="" className="size-full object-cover" /> : <LoaderCircle className="size-4 animate-spin" />}
    </button>
  )
}

function Viewer({ path, item }: { path: string; item: Evidence }) {
  const file = usePrivateImage(path)
  if (!file.data) return <LoaderCircle className="mx-auto my-10 size-6 animate-spin text-muted-foreground" />
  return item.kind === 'VIDEO' ? <video src={file.data} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-lg bg-black" /> : <img src={file.data} alt="" className="max-h-[70vh] w-full rounded-lg object-contain" />
}

/** The photos and clips sent with a return (private: fetched with the admin's session). */
export function DisputeEvidence({ id, evidence }: { id: string; evidence: DisputeRow['evidence'] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState<Evidence | null>(null)
  const pathOf = (item: Evidence) => `/admin/disputes/${id}/evidence/${item.index}`
  if (!evidence.length) return null
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {evidence.map((item) => (
          <li key={item.index}>
            <Thumb path={pathOf(item)} item={item} onOpen={() => setOpen(item)} />
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.disputes.evidence}</DialogTitle>
            <DialogDescription className="sr-only">{t.disputes.evidence}</DialogDescription>
          </DialogHeader>
          {open && <Viewer path={pathOf(open)} item={open} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
