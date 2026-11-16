import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { ImagePlus, LoaderCircle, ReceiptText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/i18n/context'
import { ApiError } from '@/lib/api'

const ACCEPT = 'image/jpeg,image/png,image/webp'

export interface SlipConfirmOptions {
  title: string
  description: string
  confirmLabel: string
  /** Label for the optional bank reference. */
  referenceLabel: string
  onSubmit: (slip: File, reference: string) => Promise<void>
}

/** A money action that needs proof: a photo of the transfer slip (required) and an optional reference. */
export function SlipConfirmDialog({ options, onClose }: { options: SlipConfirmOptions | null; onClose: () => void }) {
  return (
    <Dialog open={options !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{options && <SlipForm key={options.title} options={options} onClose={onClose} />}</DialogContent>
    </Dialog>
  )
}

function SlipForm({ options, onClose }: { options: SlipConfirmOptions; onClose: () => void }) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [reference, setReference] = useState('')
  const [slip, setSlip] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const preview = useMemo(() => (slip ? URL.createObjectURL(slip) : null), [slip])
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!slip) return setError(t.payouts.proofRequired)
    setPending(true)
    setError(null)
    try {
      await options.onSubmit(slip, reference.trim())
      onClose()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      setError(code === 'SLIP_REQUIRED' ? t.payouts.proofRequired : code === 'INVALID_IMAGE' || code === 'FILE_TOO_LARGE' ? t.payouts.slipInvalid : t.common.saveError)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{options.title}</DialogTitle>
        <DialogDescription>{options.description}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label required>{t.payouts.slip}</Label>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex min-h-28 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 text-sm text-muted-foreground transition-colors hover:border-primary/50"
        >
          {preview ? (
            <img src={preview} alt={t.payouts.slip} className="max-h-64 w-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-1.5 py-6">
              <ReceiptText className="size-7" />
              {t.payouts.addSlip}
            </span>
          )}
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            setSlip(e.target.files?.[0] ?? null)
            setError(null)
            e.target.value = ''
          }}
        />
        {slip && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => input.current?.click()}>
            <ImagePlus />
            {t.payouts.changeSlip}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="slip-ref">
          {options.referenceLabel}
        </Label>
        <Input id="slip-ref" maxLength={100} value={reference} onChange={(e) => (setReference(e.target.value), setError(null))} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          {options.confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
