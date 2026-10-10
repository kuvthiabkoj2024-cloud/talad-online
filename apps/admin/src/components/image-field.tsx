import { Button } from '@talad/ui/components/button'
import { Input } from '@talad/ui/components/input'
import { cn } from '@talad/ui/lib/utils'
import { ImagePlus, LoaderCircle, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/context'
import { upload } from '@/lib/api'

/** Image picker for platform media: upload (→ public URL) or paste a URL. */
export function ImageField({
  value,
  onChange,
  className,
  previewClassName = 'aspect-[3/1] w-full',
}: {
  value: string
  onChange: (url: string) => void
  className?: string
  previewClassName?: string
}) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file?: File) {
    if (!file) return
    setBusy(true)
    try {
      const res = await upload<{ url: string }>('/admin/uploads', file)
      onChange(res.url)
    } catch {
      toast.error(t.common.saveError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted text-muted-foreground hover:border-primary hover:text-primary',
          value && 'border-solid',
          previewClassName,
        )}
      >
        {value ? <img src={value} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6" />}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <LoaderCircle className="size-5 animate-spin" />
          </span>
        )}
      </button>
      <div className="flex gap-2">
        <Input value={value} placeholder="https://…" onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {t.common.upload}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t.common.delete} onClick={() => onChange('')}>
            <X />
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
