import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { ImagePlus, LoaderCircle, ReceiptText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/i18n/context'
import { ApiError, send, upload } from '@/lib/api'

const ACCEPT = 'image/jpeg,image/png,image/webp'

/**
 * Marks a payout paid with a photo of the transfer slip (required) and, optionally, the bank
 * reference. The shop is notified and can see the slip in its Finance page.
 */
export function PayoutPaidDialog({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; shop: string } | null
  onClose: () => void
  onDone: () => void
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{target && <PaidForm key={target.id} target={target} onClose={onClose} onDone={onDone} />}</DialogContent>
    </Dialog>
  )
}

function PaidForm({ target, onClose, onDone }: { target: { id: string; shop: string }; onClose: () => void; onDone: () => void }) {
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
      await upload(`/admin/payouts/${target.id}/slip`, slip)
      await send('POST', `/admin/payouts/${target.id}/paid`, { reference: reference.trim() || undefined })
      onDone()
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
        <DialogTitle>
          {t.payouts.actions.paid} · {target.shop}
        </DialogTitle>
        <DialogDescription>{t.payouts.confirm.paid}</DialogDescription>
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
        <Label htmlFor="payout-ref">
          {t.payouts.reference} <span className="font-normal text-muted-foreground">({t.common.optional})</span>
        </Label>
        <Input id="payout-ref" maxLength={100} value={reference} onChange={(e) => (setReference(e.target.value), setError(null))} />
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
          {t.payouts.actions.paid}
        </Button>
      </DialogFooter>
    </form>
  )
}
