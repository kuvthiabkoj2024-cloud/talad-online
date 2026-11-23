import { Button } from '@talad/ui/components/button'
import { MessageCircle, Phone } from 'lucide-react'

/**
 * Reach a shop or customer straight away: the phone's dialer, or a WhatsApp chat with their
 * number (the app if installed, WhatsApp Web otherwise). `phone` is stored as +856…
 */
export function ContactButtons({ phone, callLabel, chatLabel }: { phone: string; callLabel: string; chatLabel: string }) {
  return (
    <>
      <Button asChild variant="outline">
        <a href={`tel:${phone}`}>
          <Phone />
          {callLabel}
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
          <MessageCircle />
          {chatLabel}
        </a>
      </Button>
    </>
  )
}
