import { Button } from '@talad/ui/components/button'
import { Label } from '@talad/ui/components/label'
import { Camera, Images, ReceiptText } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useI18n } from '@/i18n/context'

/** The courier's bill: take the photo now on a phone, or pick one already in the gallery. */
export function BillPhotoField({ file, onChange, required = true }: { file: File | null; onChange: (file: File | null) => void; required?: boolean }) {
  const { t } = useI18n()
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.files?.[0] ?? null)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>
        {t.orders.bill}
        {!required && <span className="font-normal text-muted-foreground"> ({t.common.optional})</span>}
      </Label>
      {preview ? (
        <div className="h-48 overflow-hidden rounded-xl border bg-muted/40 p-1">
          <img src={preview} alt={t.orders.bill} className="size-full rounded-lg object-contain" />
        </div>
      ) : (
        <div className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-muted/40 text-sm text-muted-foreground">
          <ReceiptText className="size-7" />
          {t.orders.addBill}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => cameraInput.current?.click()}>
          <Camera />
          {t.orders.takePhoto}
        </Button>
        <Button type="button" variant="outline" onClick={() => galleryInput.current?.click()}>
          <Images />
          {t.orders.fromGallery}
        </Button>
      </div>
      <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={pick} />
      <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} />
      <p className="text-xs text-muted-foreground">{preview ? t.orders.changeBill : t.orders.billHint}</p>
    </div>
  )
}
