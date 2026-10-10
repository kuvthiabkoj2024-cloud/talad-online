import type { OrderStatus, ProductStatus } from '@talad/shared'
import { cn } from '@talad/ui/lib/utils'
import { useI18n } from '@/i18n/context'
import type { CouponState, FlashSaleState } from '@/lib/types'

const PRODUCT_TONE: Record<ProductStatus, string> = {
  PUBLISHED: 'bg-brand-soft text-primary ring-primary/25',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800',
  DRAFT: 'bg-muted text-muted-foreground ring-border',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
}

const COUPON_TONE: Record<CouponState, string> = {
  ACTIVE: PRODUCT_TONE.PUBLISHED,
  SCHEDULED: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900',
  EXPIRED: PRODUCT_TONE.DRAFT,
  USED_UP: PRODUCT_TONE.DRAFT,
  INACTIVE: PRODUCT_TONE.DRAFT,
}

const pill = 'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset'

export function ProductStatusBadge({ status, className }: { status: ProductStatus; className?: string }) {
  const { t } = useI18n()
  return <span className={cn(pill, PRODUCT_TONE[status], className)}>{t.productStatus[status]}</span>
}

export function CouponStateBadge({ state }: { state: CouponState }) {
  const { t } = useI18n()
  return <span className={cn(pill, COUPON_TONE[state])}>{t.coupons.states[state]}</span>
}

const ORDER_TONE: Record<OrderStatus, string> = {
  PENDING: PRODUCT_TONE.PENDING,
  CONFIRMED: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-900',
  PACKED: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-900',
  SHIPPED: COUPON_TONE.SCHEDULED,
  DELIVERED: COUPON_TONE.SCHEDULED,
  COMPLETED: PRODUCT_TONE.PUBLISHED,
  CANCELLED: PRODUCT_TONE.DRAFT,
  RETURN_REQUESTED: PRODUCT_TONE.REJECTED,
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n()
  return <span className={cn(pill, ORDER_TONE[status])}>{t.orders.status[status]}</span>
}

const SALE_TONE: Record<FlashSaleState, string> = {
  ACTIVE: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
  SCHEDULED: COUPON_TONE.SCHEDULED,
  ENDED: PRODUCT_TONE.DRAFT,
  INACTIVE: PRODUCT_TONE.DRAFT,
}

export function FlashSaleStateBadge({ state }: { state: FlashSaleState }) {
  const { t } = useI18n()
  return <span className={cn(pill, SALE_TONE[state])}>{t.marketing.states[state]}</span>
}
