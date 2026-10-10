import type { AdminRole, KycDocumentType, Locale, OrderStatus, PaymentMethod, ProductStatus, ShopOrderTab } from '@talad/shared'

export type LocalizedText = Partial<Record<Locale, string>>
export type ShopStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED'
export type DisputeStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED_REFUND' | 'RESOLVED_REJECTED'
export type PayoutStatus = 'SCHEDULED' | 'PROCESSING' | 'PAID' | 'FAILED'

export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** Mirrors `AdminProfile`. */
export interface Admin {
  id: string
  email: string
  name: string
  role: AdminRole
  isActive: boolean
  /** Authenticator app (TOTP) is on. */
  twoFactor: boolean
  createdAt: string
}

export interface Alerts {
  pendingShops: number
  pendingProducts: number
  openDisputes: number
  lowStock: number
  payoutsDue: { count: number; net: number }
  unsettledOrders: number
}

export interface TopRow {
  id: string
  name: string
  orders: number
  units: number
  revenue: number
  commission: number
}

export interface Dashboard {
  days: 7 | 30 | 90
  kpis: { gmv: number; orders: number; commission: number; activeShops: number; activeCustomers: number; newSignups: number; refundRate: number }
  previous: { gmv: number; orders: number }
  series: { date: string; orders: number; gmv: number }[]
  top: { shops: TopRow[]; categories: TopRow[]; products: TopRow[] }
  alerts: Alerts
}

export interface ShopRow {
  id: string
  slug: string
  name: string
  ownerName: string
  status: ShopStatus
  logoUrl: string | null
  commissionRate: number | null
  ratingAvg: number
  createdAt: string
  updatedAt: string
  _count: { products: number; orders: number; kycDocuments: number }
}

export interface ShopDetail {
  id: string
  slug: string
  name: string
  status: ShopStatus
  rejectionReason: string | null
  description: string | null
  ownerName: string
  email: string
  phone: string
  address: string | null
  logoUrl: string | null
  coverUrl: string | null
  commissionRate: number | null
  /** Platform default, used when `commissionRate` is null. */
  platformCommissionRate: number
  payment: { bankCode: string | null; accountName: string | null; accountNumber: string | null; hasQr: boolean }
  ratingAvg: number
  ratingCount: number
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
  owner: { id: string; name: string; phone: string | null; email: string | null; createdAt: string; isActive: boolean } | null
  documents: { id: string; type: KycDocumentType; createdAt: string; reviewedAt: string | null; ext?: string }[]
  productCounts: Partial<Record<ProductStatus, number>>
  orderCounts: Partial<Record<OrderStatus, number>>
  completedRevenue: number
  commissionEarned: number
}

export interface ProductRow {
  id: string
  name: string
  sku: string
  slug: string
  status: ProductStatus
  price: number
  stock: number
  hasVideo: boolean
  rejectionReason: string | null
  updatedAt: string
  imageUrl: string | null
  shop: { id: string; name: string; slug: string; status: ShopStatus }
  category: { name: LocalizedText }
}

export interface ProductDetail {
  id: string
  name: string
  slug: string
  sku: string
  description: string | null
  status: ProductStatus
  rejectionReason: string | null
  price: number
  compareAtPrice: number | null
  stock: number
  soldCount: number
  viewCount: number
  imageUrls: string[]
  videoUrl: string | null
  variants: { sku: string; label: string; price: number | null; stock: number }[]
  category: { name: LocalizedText; parent: { name: LocalizedText } | null }
  unit: { code: string; name: LocalizedText }
  shop: { id: string; name: string; slug: string; status: ShopStatus }
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  isActive: boolean
  pointsBalance: number
  createdAt: string
  shop: { id: string; name: string; status: ShopStatus } | null
  orderCount: number
  totalSpent: number
}

export interface CustomerDetail extends Omit<CustomerRow, 'shop'> {
  locale: string
  phoneVerifiedAt: string | null
  shop: { id: string; name: string; slug: string; status: ShopStatus } | null
  linked: { google: boolean; apple: boolean }
  points: { id: string; type: string; points: number; note: string | null; expiresAt: string | null; createdAt: string }[]
  addressCount: number
  reviewCount: number
  activeSessions: number
  disputeCount: number
}

export interface OrderLine {
  name: string
  sku: string
  variant: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  imageUrl: string | null
}

export interface OrderRow {
  number: string
  status: OrderStatus
  createdAt: string
  total: number
  itemCount: number
  items: OrderLine[]
  customer: { name: string }
  shop: { id: string; name: string; slug: string }
  payment: { method: PaymentMethod; status: PaymentStatus; hasSlip: boolean } | null
  awaitingConfirmation: boolean
}

export interface OrderList extends Paged<OrderRow> {
  counts: Record<ShopOrderTab | 'all', number>
}

export interface OrderDetail extends Omit<OrderRow, 'customer' | 'payment'> {
  subtotal: number
  discountTotal: number
  commissionAmount: number
  note: string | null
  customer: { id: string; name: string; phone: string | null }
  shippingAddress: { recipientName: string; phone: string; province: string; district: string; village: string; line: string } | null
  deliveryProvider: { id: string; name: string } | null
  trackingNumber: string | null
  autoConfirmAt: string | null
  cancelReason: string | null
  payment: { method: PaymentMethod; status: PaymentStatus; hasSlip: boolean; amount: number; paidAt: string | null } | null
  history: { status: OrderStatus; note: string | null; actor: 'SHOP' | 'CUSTOMER' | 'ADMIN' | null; at: string }[]
  dispute: { status: string; reason: string; createdAt: string } | null
}

export interface DisputeRow {
  id: string
  status: DisputeStatus
  raisedBy: 'SHOP' | 'CUSTOMER' | 'ADMIN'
  reason: string
  details: string | null
  refundAmount: number | null
  resolution: string | null
  resolvedAt: string | null
  createdAt: string
  order: { number: string; status: OrderStatus; total: number; shop: { id: string; name: string }; customer: { id: string; name: string; phone: string | null } }
}

export interface PayoutRow {
  id: string
  shop: { id: string; name: string; paymentBankCode: string | null; paymentAccountName: string | null; paymentAccountNumber: string | null }
  periodStart: string
  periodEnd: string
  gross: number
  commission: number
  refunds: number
  net: number
  status: PayoutStatus
  paidAt: string | null
  reference: string | null
  orderCount: number
  createdAt: string
}

export interface PayoutList extends Paged<PayoutRow> {
  totals: Partial<Record<PayoutStatus, { count: number; net: number }>>
  unsettled: { orders: number; net: number }
}

export interface Category {
  id: string
  parentId: string | null
  slug: string
  name: LocalizedText
  iconUrl: string | null
  imageUrl: string | null
  sortOrder: number
  isActive: boolean
  commissionRate: number | null
  productCount: number
  childCount: number
}

export interface Unit {
  id: string
  code: string
  name: LocalizedText
  productCount: number
}

export interface Courier {
  id: string
  code: string
  name: string
  logoUrl: string | null
  mode: 'manual' | 'api'
  isActive: boolean
  orderCount: number
  zones: { id: string; name: string; provinces: string[]; baseFee: number; perKgFee: number }[]
}

export interface Banner {
  id: string
  title: LocalizedText
  imageUrl: string
  linkTarget: string | null
  sortOrder: number
  startsAt: string
  endsAt: string
  isActive: boolean
  live: boolean
}

export type CouponState = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'USED_UP' | 'INACTIVE'

export interface Coupon {
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
}

export interface CmsPage {
  slug: string
  content: Partial<Record<Locale, { title: string; body: string }>>
  updatedAt: string
}

export interface Settings {
  productModeration: 'pre' | 'post'
  defaultCommissionRate: number
  paymentMethods: string[]
  points: { earnPer: number; redeemValue: number; expiryDays: number }
  readOnly: { currency: string; timezone: string; locales: string[]; taxRate: number }
}

export interface Announcement {
  id: string
  audience: 'customers' | 'sellers'
  type: 'PROMOTION' | 'SYSTEM'
  title: string
  titleLo?: string
  link?: string
  recipients: number
  sentAt: string
  by: string | null
}

export interface AuditEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  changes: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  admin: { id: string; name: string; email: string } | null
}
