import type {
  BusinessHours,
  Locale,
  OrderStatus,
  PaymentMethod,
  ProductStatus,
  ShopOrderAction,
  ShopOrderTab,
  SocialLink,
} from '@talad/shared'

export type LocalizedText = Partial<Record<Locale, string>>

/** Mirrors `CustomerProfile` (services/api auth): the account signed in to Seller Center. */
export interface Account {
  id: string
  name: string
  phone: string | null
  email: string | null
  avatarUrl: string | null
  avatarVersion: string | null
  shop: { id: string; slug: string; name: string; status: ShopStatus } | null
}

export type ShopStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

/** Mirrors `ShopsService.ownedBy`. */
export interface MyShop {
  id: string
  slug: string
  name: string
  status: ShopStatus
  rejectionReason: string | null
  description: string | null
  logoUrl: string | null
  email: string
  phone: string
  verifiedAt: string | null
  createdAt: string
}

/** Mirrors `ShopSummary`. */
export interface ShopSummary {
  orders: { toPay: number; toShip: number; shipping: number; cancelled: number; returns: number; completed: number }
  products: { published: number; pending: number; draft: number; rejected: number; lowStock: number }
  activeCoupons: number
  setup: { pickupAddress: boolean; payment: boolean; logo: boolean }
}

export interface CategoryNode {
  id: string
  slug: string
  name: LocalizedText
  children: CategoryNode[]
}

export interface Unit {
  id: string
  code: string
  name: LocalizedText
}

/** Mirrors `ShopProductRow`. */
export interface ShopProductRow {
  id: string
  slug: string
  name: string
  sku: string
  status: ProductStatus
  rejectionReason: string | null
  price: number
  priceMax: number | null
  stock: number
  lowStock: boolean
  imageUrl: string | null
  hasVideo: boolean
  videoUrl: string | null
  variantCount: number
  soldCount: number
  updatedAt: string
}

export interface ShopProductList {
  items: ShopProductRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  counts: Record<ProductStatus | 'all', number>
}

export interface MediaFile {
  key: string
  url: string
}

/** Mirrors `ShopProductDetail`. */
export interface ShopProductDetail {
  id: string
  slug: string
  status: ProductStatus
  rejectionReason: string | null
  name: string
  description: string | null
  categoryId: string
  unitId: string
  sku: string
  price: number
  compareAtPrice: number | null
  stock: number
  lowStockThreshold: number
  images: MediaFile[]
  video: MediaFile | null
  variantOption: string | null
  variants: { id: string; value: string; sku: string; price: number | null; stock: number }[]
}

export type CouponState = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'USED_UP' | 'INACTIVE'

/** Mirrors `ShopCoupon`. */
export interface ShopCoupon {
  id: string
  code: string
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: number
  minOrderAmount: number | null
  maxDiscount: number | null
  usageLimit: number | null
  perCustomer: number | null
  usedCount: number
  startsAt: string
  endsAt: string
  isActive: boolean
  state: CouponState
  createdAt: string
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED'

export interface OrderLine {
  name: string
  sku: string
  variant: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  imageUrl: string | null
  productSlug: string
}

/** Mirrors `ShopOrderSummary` (services/api orders). */
export interface ShopOrderSummary {
  number: string
  status: OrderStatus
  createdAt: string
  total: number
  itemCount: number
  items: OrderLine[]
  customer: { name: string }
  payment: { method: PaymentMethod; status: PaymentStatus; hasSlip: boolean } | null
  awaitingConfirmation: boolean
  paymentDueAt: string | null
}

export interface ShopOrderList {
  items: ShopOrderSummary[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  counts: Record<ShopOrderTab | 'all', number>
}

export interface ShippingAddress {
  recipientName: string
  phone: string
  province: string
  district: string
  village: string
  line: string
}

/** Mirrors `ShopOrderDetail`. */
export interface ShopOrderDetail extends Omit<ShopOrderSummary, 'customer' | 'payment'> {
  subtotal: number
  discountTotal: number
  shippingFee: number
  commissionAmount: number
  note: string | null
  customer: { id: string; name: string; phone: string | null }
  shippingAddress: ShippingAddress | null
  deliveryProvider: { id: string; name: string } | null
  trackingNumber: string | null
  autoConfirmAt: string | null
  cancelReason: string | null
  payment:
    | ({ method: PaymentMethod; status: PaymentStatus; hasSlip: boolean } & {
        amount: number
        paidAt: string | null
        slipUploadedAt: string | null
      })
    | null
  history: { status: OrderStatus; note: string | null; actor: 'SHOP' | 'CUSTOMER' | 'ADMIN' | null; at: string }[]
  dispute: { status: string; reason: string; createdAt: string } | null
  actions: ShopOrderAction[]
}

export interface DeliveryProvider {
  id: string
  name: string
  mode: string
}

export type FlashSaleState = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'INACTIVE'

/** Mirrors `ShopFlashSale`. */
export interface ShopFlashSale {
  id: string
  name: string
  startsAt: string
  endsAt: string
  isActive: boolean
  state: FlashSaleState
  items: {
    productId: string
    name: string
    imageUrl: string | null
    status: string
    discountPercent: number
    price: number
    salePrice: number
  }[]
}

/** Mirrors `ShopCustomer`. */
export interface ShopCustomer {
  id: string
  name: string
  phone: string | null
  orderCount: number
  totalSpent: number
  lastOrderAt: string
  note: string | null
  blacklisted: boolean
}

export interface ShopCustomerList {
  items: ShopCustomer[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** Mirrors `ShopFinance`. */
export interface ShopFinance {
  from: string
  to: string
  earned: { orders: number; gross: number; commission: number; net: number }
  inProgress: { orders: number; amount: number }
  refunded: { orders: number; amount: number }
  balance: number
  payouts: {
    id: string
    periodStart: string
    periodEnd: string
    gross: number
    commission: number
    refunds: number
    net: number
    status: 'SCHEDULED' | 'PROCESSING' | 'PAID' | 'FAILED'
    paidAt: string | null
    reference: string | null
  }[]
}

/** Mirrors `ShopStats`. */
export interface ShopStats {
  days: 7 | 30 | 90
  series: { date: string; orders: number; revenue: number }[]
  totals: { orders: number; revenue: number; customers: number; averageOrder: number; units: number }
  previous: { orders: number; revenue: number }
  topProducts: { productId: string; name: string; imageUrl: string | null; units: number; revenue: number }[]
  statusCounts: Record<string, number>
  productViews: number
}

/** Mirrors `ShopReview`. */
export interface ShopReview {
  id: string
  rating: number
  comment: string | null
  mediaUrls: string[]
  reply: string | null
  repliedAt: string | null
  isHidden: boolean
  createdAt: string
  customer: { name: string }
  product: { id: string; name: string; slug: string; imageUrl: string | null } | null
}

export interface ShopReviewList {
  items: ShopReview[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  summary: { average: number; count: number; unreplied: number; byRating: Record<'1' | '2' | '3' | '4' | '5', number> }
}

/** Mirrors `ShopProfile`. */
export interface ShopProfile {
  id: string
  slug: string
  status: ShopStatus
  name: string
  description: string | null
  ownerName: string
  email: string
  phone: string
  address: string | null
  logoUrl: string | null
  coverUrl: string | null
  businessHours: BusinessHours
  socialLinks: Partial<Record<SocialLink, string>>
  payment: { bankCode: string | null; accountName: string | null; accountNumber: string | null; hasQr: boolean }
  paymentWindowHrs: number
  autoConfirmHrs: number
  verifiedAt: string | null
}

export interface AccountSession {
  id: string
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  active: boolean
  current: boolean
}
