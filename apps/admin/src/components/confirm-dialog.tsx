import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { Textarea } from '@talad/ui/components/textarea'
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/i18n/context'
import { ApiError } from '@/lib/api'

export interface ConfirmOptions {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  /** Ask for a reason/resolution; `required` blocks empty submits. */
  reason?: { label?: string; required?: boolean }
  /** A one-line text field (e.g. a bank transfer reference). */
  field?: { label: string; required?: boolean }
  /** Runs the action; throwing shows `errorText(error)` and keeps the dialog open. */
  onConfirm: (input: { reason?: string; field?: string }) => Promise<unknown>
  errorText?: (e: unknown) => string
}

/** One confirm dialog for every moderation decision. `options` null = closed. */
export function ConfirmDialog({ options, onClose }: { options: ConfirmOptions | null; onClose: () => void }) {
  return (
    <Dialog open={options !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{options && <ConfirmBody key={options.title} options={options} onClose={onClose} />}</DialogContent>
    </Dialog>
  )
}

function ConfirmBody({ options: o, onClose }: { options: ConfirmOptions; onClose: () => void }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [field, setField] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    if (o.reason?.required && !reason.trim()) return setError(t.common.reasonRequired)
    if (o.field?.required && !field.trim()) return setError(o.field.label)
    setPending(true)
    setError(null)
    try {
      await o.onConfirm({ reason: reason.trim() || undefined, field: field.trim() || undefined })
      onClose()
    } catch (e) {
      setError(o.errorText?.(e) ?? (e instanceof ApiError ? e.message : t.common.saveError))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{o.title}</DialogTitle>
        <DialogDescription>{o.description}</DialogDescription>
      </DialogHeader>
      {o.field && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-field" required={o.field.required}>
            {o.field.label}
          </Label>
          <Input id="confirm-field" value={field} maxLength={100} onChange={(e) => setField(e.target.value)} />
        </div>
      )}
      {o.reason && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-reason" required={o.reason.required}>
            {o.reason.label ?? t.common.reason}
            {!o.reason.required && <span className="font-normal text-muted-foreground"> ({t.common.optional})</span>}
          </Label>
          <Textarea id="confirm-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t.common.reasonHint}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant={o.destructive ? 'destructive' : 'default'} disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          {o.confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
