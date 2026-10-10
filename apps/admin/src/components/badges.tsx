import type { OrderStatus, ProductStatus } from '@talad/shared'
import { cn } from '@talad/ui/lib/utils'
import { useI18n } from '@/i18n/context'
import type { CouponState, DisputeStatus, PayoutStatus, ShopStatus } from '@/lib/types'

const TONE = {
  good: 'bg-brand-soft text-primary ring-primary/25',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800',
  info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900',
  bad: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
  muted: 'bg-muted text-muted-foreground ring-border',
} as const
type Tone = keyof typeof TONE

function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE[tone], className)}>{children}</span>
}

const SHOP: Record<ShopStatus, Tone> = { PENDING: 'warn', APPROVED: 'good', REJECTED: 'bad', SUSPENDED: 'bad' }
const PRODUCT: Record<ProductStatus, Tone> = { PENDING: 'warn', PUBLISHED: 'good', DRAFT: 'muted', REJECTED: 'bad' }
const ORDER: Record<OrderStatus, Tone> = {
  PENDING: 'warn',
  CONFIRMED: 'info',
  PACKED: 'info',
  SHIPPED: 'info',
  DELIVERED: 'info',
  COMPLETED: 'good',
  CANCELLED: 'muted',
  RETURN_REQUESTED: 'bad',
}
const DISPUTE: Record<DisputeStatus, Tone> = { OPEN: 'bad', IN_REVIEW: 'warn', RESOLVED_REFUND: 'muted', RESOLVED_REJECTED: 'muted' }
const PAYOUT: Record<PayoutStatus, Tone> = { SCHEDULED: 'warn', PROCESSING: 'info', PAID: 'good', FAILED: 'bad' }
const COUPON: Record<CouponState, Tone> = { ACTIVE: 'good', SCHEDULED: 'info', EXPIRED: 'muted', USED_UP: 'muted', INACTIVE: 'muted' }

export function ShopStatusBadge({ status }: { status: ShopStatus }) {
  const { t } = useI18n()
  return <Pill tone={SHOP[status]}>{t.shopStatus[status]}</Pill>
}
export function ProductStatusBadge({ status, className }: { status: ProductStatus; className?: string }) {
  const { t } = useI18n()
  return (
    <Pill tone={PRODUCT[status]} className={className}>
      {t.productStatus[status]}
    </Pill>
  )
}
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n()
  return <Pill tone={ORDER[status]}>{t.orderStatus[status]}</Pill>
}
export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const { t } = useI18n()
  return <Pill tone={DISPUTE[status]}>{t.disputeStatus[status]}</Pill>
}
export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const { t } = useI18n()
  return <Pill tone={PAYOUT[status]}>{t.payoutStatus[status]}</Pill>
}
export function CouponStateBadge({ state }: { state: CouponState }) {
  const { t } = useI18n()
  return <Pill tone={COUPON[state]}>{t.coupons.states[state]}</Pill>
}
export function FlagBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <Pill tone={tone}>{children}</Pill>
}
