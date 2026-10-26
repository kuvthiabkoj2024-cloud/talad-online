import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Check, Copy, Download, ExternalLink, MessageCircle, Phone, Send, Share2 } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/context'

const e = encodeURIComponent

/** One-tap share links that need no app id (the apps people use in Laos). */
const TARGETS: { name: string; bg: string; icon: React.ReactNode; href: (url: string, text: string) => string }[] = [
  { name: 'Facebook', bg: 'bg-[#1877F2]', icon: <span className="text-2xl leading-none font-black">f</span>, href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${e(url)}` },
  { name: 'Messenger', bg: 'bg-linear-to-br from-[#00B2FF] to-[#A033FF]', icon: <MessageCircle className="size-6 fill-current" />, href: (url) => `fb-messenger://share/?link=${e(url)}` },
  { name: 'WhatsApp', bg: 'bg-[#25D366]', icon: <Phone className="size-6 fill-current" />, href: (url, text) => `https://wa.me/?text=${e(`${text} ${url}`)}` },
  { name: 'LINE', bg: 'bg-[#06C755]', icon: <span className="text-xs font-black tracking-tight">LINE</span>, href: (url) => `https://social-plugins.line.me/lineit/share?url=${e(url)}` },
  { name: 'Telegram', bg: 'bg-[#229ED9]', icon: <Send className="-ml-0.5 size-6 fill-current" />, href: (url, text) => `https://t.me/share/url?url=${e(url)}&text=${e(text)}` },
]

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Older browsers / non-secure contexts.
    const t = document.createElement('textarea')
    t.value = text
    document.body.append(t)
    t.select()
    document.execCommand('copy')
    t.remove()
  }
}

/**
 * Share a storefront page (the shop or one product): QR code to print or post, the link
 * with a copy button, one-tap buttons for chat and social apps, and the phone's share sheet.
 */
export function ShareDialog({
  open,
  onOpenChange,
  url,
  title,
  heading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string
  /** What's shared (shop or product name), sent along with the link. */
  title: string
  heading: string
}) {
  const { t } = useI18n()
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    if (!open) return
    let live = true
    QRCode.toDataURL(url, { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#14532d', light: '#ffffff' } })
      .then((data) => live && setQr(data))
      .catch(() => live && setQr(null))
    return () => {
      live = false
    }
  }, [open, url])

  async function copy() {
    await copyText(url)
    setCopied(true)
    toast.success(t.share.copied)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2">
          <div className="flex size-44 items-center justify-center rounded-2xl border bg-white p-2 shadow-sm">
            {qr ? <img src={qr} alt={`QR: ${url}`} className="size-full" /> : <span className="size-full animate-pulse rounded-xl bg-muted" />}
          </div>
          <p className="text-xs text-muted-foreground">{t.share.scanQr}</p>
          {qr && (
            <a href={qr} download={`taladonline-qr.png`} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <Download className="size-4" />
              {t.share.saveQr}
            </a>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2 rounded-full border bg-muted/50 p-1 pl-4">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={url}>
            {url.replace(/^https?:\/\//, '')}
          </span>
          <Button type="button" size="sm" className="shrink-0 rounded-full" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? t.share.copiedShort : t.share.copy}
          </Button>
        </div>

        <ul className="grid grid-cols-5 gap-2">
          {TARGETS.map((target) => (
            <li key={target.name}>
              <a href={target.href(url, title)} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1.5 text-[11px] font-medium">
                <span className={`flex size-11 items-center justify-center rounded-full text-white shadow-sm ${target.bg}`}>{target.icon}</span>
                {target.name}
              </a>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink />
              {t.share.open}
            </a>
          </Button>
          {canNativeShare ? (
            <Button type="button" variant="outline" onClick={() => void navigator.share({ title, text: title, url }).catch(() => {})}>
              <Share2 />
              {t.share.more}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => void copy()}>
              <Copy />
              {t.share.copy}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
