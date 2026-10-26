import { Button } from '@talad/ui/components/button'
import { Separator } from '@talad/ui/components/separator'
import { SidebarTrigger } from '@talad/ui/components/sidebar'
import { cn } from '@talad/ui/lib/utils'
import { ArrowLeft, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/context'
import { useI18n } from '@/i18n/context'
import { storefrontUrl } from '@/lib/format'
import { AccountAvatar, AccountMenu } from './account-menu'
import { NotificationBell } from './notification-bell'
import { ShareDialog } from './share-dialog'

/** Opens the share dialog for the shop's storefront page; only once the shop is live. */
function ShareShopButton() {
  const { t, locale } = useI18n()
  const { account } = useAuth()
  const [open, setOpen] = useState(false)
  const shop = account?.shop
  if (!shop || shop.status !== 'APPROVED') return null
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="gap-1.5 px-2 hover:bg-white/15 hover:text-current md:px-3 md:hover:bg-accent"
        aria-label={t.share.shareShop}
        onClick={() => setOpen(true)}
      >
        <Share2 className="size-5 md:size-4" />
        <span className="hidden md:inline">{t.share.shareShop}</span>
      </Button>
      <ShareDialog open={open} onOpenChange={setOpen} url={storefrontUrl.shop(locale, shop.slug)} title={shop.name} heading={t.share.shopHeading} />
    </>
  )
}

/**
 * Sticky top bar. Phones: brand-coloured, with a back arrow (like a native app) and the
 * account avatar. Desktop: light, with the sidebar toggle and the page title.
 */
export function TopBar({
  title,
  backTo,
  className,
}: {
  title: string
  /** Where the phone back arrow goes; omitted on top-level screens. */
  backTo?: string
  className?: string
}) {
  const { t } = useI18n()
  const { account } = useAuth()

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-primary px-2 text-primary-foreground md:border-b md:bg-background/95 md:px-4 md:text-foreground md:backdrop-blur',
        className,
      )}
    >
      <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
      <Separator orientation="vertical" className="mr-1 hidden h-4! self-center! md:block" />
      {backTo ? (
        <Button asChild variant="ghost" size="icon" className="hover:bg-white/15 hover:text-current md:hidden">
          <Link to={backTo} aria-label={t.common.back}>
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      ) : (
        <span className="w-2 md:hidden" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold md:text-base">{title}</h1>
      <ShareShopButton />
      <NotificationBell className="hover:bg-white/15 hover:text-current md:hover:bg-accent" />
      {account && (
        <AccountMenu
          trigger={
            <button type="button" className="rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <AccountAvatar account={account} className="size-8 ring-2 ring-white/40 md:ring-0" />
            </button>
          }
        />
      )}
    </header>
  )
}

/** Page title block under the top bar: description and actions (the title shows in the bar on phones). */
export function PageIntro({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="hidden text-2xl font-semibold tracking-tight md:block">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Standard page body width and spacing. */
export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6', className)}>{children}</div>
}
