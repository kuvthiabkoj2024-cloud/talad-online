import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Skeleton } from '@talad/ui/components/skeleton'
import { cn } from '@talad/ui/lib/utils'
import {
  Clock3,
  ExternalLink,
  Landmark,
  LayoutDashboard,
  MapPinned,
  Store,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/context'
import { PageBody, TopBar } from '@/components/page-header'
import { useMyShop, useShopBadges, useShopSummary, useUnreadMessages } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { fill, formatNumber, storefrontUrl } from '@/lib/format'
import type { MyShop, ShopStatus } from '@/lib/types'
import { NAV_GROUPS, type NavItem } from '@/nav'
import { StatsPage } from '@/pages/stats'

const DASHBOARD_TILE: NavItem = { to: '/stats', label: 'home', icon: LayoutDashboard }

const STATUS_DOT: Record<ShopStatus, string> = {
  APPROVED: 'bg-emerald-400',
  PENDING: 'bg-amber-400',
  REJECTED: 'bg-red-400',
  SUSPENDED: 'bg-red-400',
}

/** Phones (below `md`), read on the first render so the wrong page never flashes. */
const PHONE = '(max-width: 767px)'
const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(PHONE)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}
const isPhone = () => window.matchMedia(PHONE).matches

/** The home route: the statistics on desktop, the app-like hub (tool grid) on phones. */
export function HomeRoute() {
  return useSyncExternalStore(subscribe, isPhone) ? <HomePage /> : <StatsPage asHome />
}

/**
 * Seller Center home (like a native seller app on phones): shop card, things to fix,
 * and the sidebar's menu as a tool grid.
 */
export function HomePage() {
  const { t, locale } = useI18n()
  const { account } = useAuth()
  const shop = useMyShop()
  const summary = useShopSummary()
  const { data: unread = 0 } = useUnreadMessages()
  const { data: badges } = useShopBadges()
  /** New things per tile: orders and video activity (unread notifications), unread chats. */
  const badge: Record<string, number | undefined> = { '/orders': badges?.orders, '/messages': unread, '/videos': badges?.videos }
  const s = summary.data
  // The public shop page exists only once Taladonline approves the shop.
  const storeLink =
    account?.shop?.status === 'APPROVED' ? storefrontUrl.shop(locale, account.shop.slug) : undefined

  return (
    <>
      <TopBar title={t.home.title} />

      {/* Phones: shop identity on the brand colour, continuing the top bar. */}
      <section className="bg-primary px-4 pt-2 pb-6 text-primary-foreground md:hidden">
        <ShopIdentity shop={shop.data} storeLink={storeLink} />
      </section>

      <PageBody className="max-md:gap-3 max-md:px-3 max-md:pt-3">
        <Card className="hidden md:block">
          <CardContent>
            <ShopIdentity shop={shop.data} storeLink={storeLink} desktop />
          </CardContent>
        </Card>

        <Alerts shop={shop.data} setup={s?.setup} />

        {/* Phones: the sidebar's menu, in its order, 4 per row (desktop has the sidebar). */}
        <ul className="grid grid-cols-4 gap-x-2 gap-y-3 md:hidden">
          {NAV_GROUPS.flatMap((g) => g.items).map((item) => {
            // This screen is home on phones; its tile opens the statistics (what desktop shows as home).
            const { to, label, icon: Icon } = item.to === '/' ? DASHBOARD_TILE : item
            return (
              <li key={to}>
                <Link
                  to={to}
                  className="relative flex h-full flex-col items-center gap-1.5 rounded-2xl border border-primary/30 bg-card px-1 py-3 text-center transition-colors active:bg-brand-soft"
                >
                  <span className="relative flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
                    <Icon className="size-5" />
                    {(badge[to] ?? 0) > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] leading-5 font-bold text-white ring-2 ring-card">
                        {badge[to]! > 99 ? '99+' : badge[to]}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] leading-tight">{t.nav[label]}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </PageBody>
    </>
  )
}

function ShopIdentity({ shop, storeLink, desktop }: { shop?: MyShop; storeLink?: string; desktop?: boolean }) {
  const { t, locale } = useI18n()
  return (
    <div className="flex items-center gap-4">
      <span
        className={cn(
          'flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-primary shadow-sm md:size-14',
          desktop && 'bg-brand-soft',
        )}
      >
        {shop?.logoUrl ? <img src={shop.logoUrl} alt="" className="size-full object-cover" /> : <Store className="size-7" />}
      </span>
      <div className="min-w-0 flex-1">
        {shop ? (
          <>
            <p className="truncate text-xl font-semibold">{shop.name}</p>
            <p className={cn('mt-0.5 flex items-center gap-1.5 text-sm', desktop ? 'text-muted-foreground' : 'opacity-90')}>
              <span className={cn('size-2 rounded-full', STATUS_DOT[shop.status])} />
              {t.shopStatus[shop.status]}
              <span aria-hidden>·</span>
              {fill(t.followers.count, { n: formatNumber(shop.followerCount ?? 0, locale) })}
            </p>
          </>
        ) : (
          <>
            <Skeleton className={cn('h-6 w-40', !desktop && 'bg-white/30')} />
            <Skeleton className={cn('mt-2 h-4 w-28', !desktop && 'bg-white/30')} />
          </>
        )}
      </div>
      {storeLink && (
        <Button
          asChild
          variant="outline"
          className={cn(!desktop && 'border-white/80 bg-transparent text-primary-foreground hover:bg-white/15 hover:text-primary-foreground')}
        >
          <a href={storeLink} target="_blank" rel="noreferrer">
            {t.home.viewShop}
            {desktop && <ExternalLink />}
          </a>
        </Button>
      )}
    </div>
  )
}

/** Shop review status and setup gaps, most important first. */
function Alerts({ shop, setup }: { shop?: MyShop; setup?: { pickupAddress: boolean; payment: boolean } }) {
  const { t } = useI18n()
  const alerts: { icon: LucideIcon; title: string; body: string; tone: 'warn' | 'danger'; to?: string; action?: string }[] = []
  if (shop?.status === 'PENDING') {
    alerts.push({ icon: Clock3, title: t.home.pendingTitle, body: t.home.pendingBody, tone: 'warn', to: '/register', action: t.home.viewApplication })
  }
  if (shop?.status === 'REJECTED') {
    alerts.push({
      icon: TriangleAlert,
      title: t.home.rejectedTitle,
      body: shop.rejectionReason ?? '',
      tone: 'danger',
      to: '/register',
      action: t.home.updateApplication,
    })
  }
  // Until approved, the application holds the address; afterwards it's edited in the shop profile.
  const approved = shop?.status === 'APPROVED'
  if (approved && setup && !setup.pickupAddress) {
    alerts.push({ icon: MapPinned, title: t.home.pickupTitle, body: t.home.pickupBody, tone: 'warn', to: '/profile' })
  }
  if (setup && !setup.payment) {
    alerts.push({ icon: Landmark, title: t.home.paymentTitle, body: t.home.paymentBody, tone: 'warn', to: '/profile' })
  }
  if (alerts.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {alerts.map(({ icon: Icon, title, body, tone, to, action }) => (
        <div
          key={title}
          className={cn(
            'flex items-center gap-3 rounded-xl border p-4',
            tone === 'warn'
              ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'
              : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
          )}
        >
          <Icon className="size-6 shrink-0 opacity-80" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{title}</p>
            {body && <p className="text-sm opacity-80">{body}</p>}
          </div>
          {to && (
            <Button asChild size="sm" className="shrink-0 bg-orange-600 text-white hover:bg-orange-700">
              <Link to={to}>{action ?? t.home.setUp}</Link>
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
