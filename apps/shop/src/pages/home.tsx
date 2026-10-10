import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Skeleton } from '@talad/ui/components/skeleton'
import { cn } from '@talad/ui/lib/utils'
import {
  ChevronRight,
  Clock3,
  ExternalLink,
  Landmark,
  MapPinned,
  PackagePlus,
  Store,
  TicketPercent,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/context'
import { PageBody, TopBar } from '@/components/page-header'
import { useMyShop, useShopSummary } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { formatNumber, storefrontUrl } from '@/lib/format'
import type { MyShop, ShopStatus } from '@/lib/types'
import { TOOLS } from '@/nav'

const STATUS_DOT: Record<ShopStatus, string> = {
  APPROVED: 'bg-emerald-400',
  PENDING: 'bg-amber-400',
  REJECTED: 'bg-red-400',
  SUSPENDED: 'bg-red-400',
}

/**
 * Seller Center home (like a native seller app on phones): shop card, things to fix,
 * quick actions, order and product counts, and the tool grid.
 */
export function HomePage() {
  const { t, locale } = useI18n()
  const { account } = useAuth()
  const shop = useMyShop()
  const summary = useShopSummary()
  const s = summary.data
  // The public shop page exists only once Taladonline approves the shop.
  const storeLink =
    account?.shop?.status === 'APPROVED' ? storefrontUrl.shop(locale, account.shop.slug) : undefined

  const quick: { to: string; external?: boolean; label: string; icon: LucideIcon }[] = [
    { to: '/products/new', label: t.home.addProduct, icon: PackagePlus },
    ...(storeLink ? [{ to: storeLink, external: true, label: t.home.viewShop, icon: Store }] : []),
    { to: '/coupons', label: t.nav.coupons, icon: TicketPercent },
  ]

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

        <Card className="py-2">
          <CardContent className={cn('grid px-2', quick.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {quick.map(({ to, external, label, icon: Icon }) => {
              const body = (
                <>
                  <Icon className="size-7 text-primary" strokeWidth={1.75} />
                  <span className="text-sm">{label}</span>
                </>
              )
              const cls = 'flex flex-col items-center gap-2 rounded-xl px-2 py-4 text-center transition-colors hover:bg-muted'
              return external ? (
                <a key={label} href={to} target="_blank" rel="noreferrer" className={cls}>
                  {body}
                </a>
              ) : (
                <Link key={label} to={to} className={cls}>
                  {body}
                </Link>
              )
            })}
          </CardContent>
        </Card>

        <div className="grid gap-3 md:gap-5 lg:grid-cols-2">
          <CountsCard
            title={t.home.orders}
            to="/orders"
            loading={summary.isPending}
            items={[
              { label: t.home.toShip, value: s?.orders.toShip, tone: 'text-orange-600 dark:text-orange-400', to: '/orders?tab=to-ship' },
              { label: t.home.cancelled, value: s?.orders.cancelled, tone: 'text-red-600 dark:text-red-400', to: '/orders?tab=cancelled' },
              { label: t.home.returns, value: s?.orders.returns, tone: 'text-amber-600 dark:text-amber-400', to: '/orders?tab=returns' },
              { label: t.home.completed, value: s?.orders.completed, tone: 'text-primary', to: '/orders?tab=completed' },
            ]}
          />
          <CountsCard
            title={t.home.products}
            to="/products"
            loading={summary.isPending}
            items={[
              { label: t.home.published, value: s?.products.published, tone: 'text-primary', to: '/products?status=PUBLISHED' },
              { label: t.home.pending, value: s?.products.pending, tone: 'text-amber-600 dark:text-amber-400', to: '/products?status=PENDING' },
              { label: t.home.drafts, value: s?.products.draft, tone: 'text-muted-foreground', to: '/products?status=DRAFT' },
              { label: t.home.lowStock, value: s?.products.lowStock, tone: 'text-red-600 dark:text-red-400', to: '/products' },
            ]}
          />
        </div>

        {/* Phones: the tool grid is the navigation (desktop has the sidebar). */}
        <Card className="py-3 md:hidden">
          <CardContent className="grid grid-cols-4 gap-y-2 px-2">
            {TOOLS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center gap-2 rounded-xl px-1 py-3 text-center transition-colors hover:bg-muted"
              >
                <Icon className="size-7 text-primary" strokeWidth={1.75} />
                <span className="text-xs leading-tight">{t.nav[label]}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}

function ShopIdentity({ shop, storeLink, desktop }: { shop?: MyShop; storeLink?: string; desktop?: boolean }) {
  const { t } = useI18n()
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

function CountsCard({
  title,
  to,
  loading,
  items,
}: {
  title: string
  to: string
  loading: boolean
  items: { label: string; value?: number; tone: string; to: string }[]
}) {
  const { t, locale } = useI18n()
  return (
    <Card className="gap-2">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Link to={to} className="flex items-center text-sm text-primary hover:underline">
          {t.common.viewAll}
          <ChevronRight className="size-4" />
        </Link>
      </CardHeader>
      <CardContent className="grid grid-cols-4 divide-x px-2">
        {items.map((item) => (
          <Link key={item.label} to={item.to} className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center hover:bg-muted">
            {loading ? (
              <Skeleton className="h-7 w-8" />
            ) : (
              <span className={cn('text-2xl font-semibold tabular-nums', item.tone)}>{formatNumber(item.value ?? 0, locale)}</span>
            )}
            <span className="text-xs leading-tight text-muted-foreground">{item.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
