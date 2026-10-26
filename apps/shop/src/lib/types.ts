import type {
  BusinessHours,
  Locale,
  OrderStatus,
  PaymentMethod,
  ProductStatus,
  ShopOrderAction,
  ShopOrderTab,
  SocialLink,
  UrgentDelivery,
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
  email: string | null
  phone: string
  verifiedAt: string | null
  /** Customers following the shop. */
  followerCount: number
  createdAt: string
}

/** Customers following the shop, newest first (Seller Center). */
export interface FollowerPage {
  items: { customer: { id: string; name: string; avatarUrl: string | null }; followedAt: string }[]
  nextCursor: string | null
  total: number
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

/** Mirrors `ShopVideoView` / `ShopVideoList` (API `me/shop/videos`). */
export interface ShopVideo {
  productId: string
  name: string
  slug: string
  status: ProductStatus
  videoUrl: string
  imageUrl: string | null
  price: number
  views: number
  likes: number
  comments: number
  shares: number
}

export interface ShopVideoList {
  items: ShopVideo[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  totals: { views: number; likes: number; comments: number; shares: number }
}

export interface VideoComment {
  id: string
  parentId: string | null
  /** Null once deleted (kept while it still has replies). */
  body: string | null
  createdAt: string
  replyCount: number
  author: { id: string; name: string; avatarUrl: string | null; isShop: boolean }
}

export interface VideoCommentPage {
  items: VideoComment[]
  nextCursor: string | null
}

export interface VideoLikePage {
  items: { customer: { id: string; name: string; avatarUrl: string | null }; createdAt: string }[]
  nextCursor: string | null
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
  /** What the variants differ by (e.g. Colour, Size), values in order. */
  options: { name: string; values: string[] }[]
  /** Option names joined ("Colour / Size"). */
  variantOption: string | null
  variants: { id: string; attributes: Record<string, string>; value: string; sku: string; price: number | null; stock: number }[]
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
  /** Set on codes generated together (one per customer). */
  batchId: string | null
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
  /** Urgent delivery by the shop itself: handle these first. */
  urgent: boolean
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
  /** Part of the discount Taladonline funds (platform coupon), paid back to the shop. */
  platformDiscount: number
  commissionAmount: number
  note: string | null
  customer: { id: string; name: string; phone: string | null }
  shippingAddress: ShippingAddress | null
  deliveryProvider: { id: string; name: string } | null
  trackingNumber: string | null
  /** A courier bill photo was uploaded when shipping. */
  hasShippingBill: boolean
  /** Delivered by the shop itself as urgent delivery (fee in `shippingFee`). */
  urgentDelivery: boolean
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
  /** `gross` = customers paid + platform coupons paid back; `discounts` = what prices were lowered by. */
  earned: {
    orders: number
    gross: number
    commission: number
    net: number
    discounts: { flashSale: number; shopCoupons: number; platformCoupons: number }
  }
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
  /** The period before, day by day (same length), for the comparison line. */
  previousSeries: { date: string; orders: number; revenue: number }[]
  totals: { orders: number; revenue: number; customers: number; averageOrder: number; units: number }
  previous: { orders: number; revenue: number; customers: number; averageOrder: number; units: number }
  payments: { method: string; orders: number; revenue: number }[]
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
  email: string | null
  phone: string
  address: string | null
  logoUrl: string | null
  coverUrl: string | null
  businessHours: BusinessHours
  socialLinks: Partial<Record<SocialLink, string>>
  payment: { bankCode: string | null; accountName: string | null; accountNumber: string | null; hasQr: boolean }
  paymentWindowHrs: number
  autoConfirmHrs: number
  /** Cash on delivery offered, and when the owner last accepted its terms. */
  cod: { enabled: boolean; termsAcceptedAt: string | null }
  /** The shop's own urgent delivery: areas, a price per area, how fast. */
  urgentDelivery: UrgentDelivery
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

/** Private customer ↔ shop chat (API `me/shop/conversations`). */
export interface ConversationSummary {
  id: string
  customer: { name: string }
  lastMessage: { text: string; photo: boolean; product: boolean; order: boolean; location?: boolean; mine: boolean; bot: boolean; system?: boolean; createdAt: string } | null
  lastMessageAt: string
  unread: number
}

export interface ChatProductRef {
  id: string
  name: string
  slug: string
  shopSlug: string
  price: number
  imageUrl: string | null
}

export interface ChatMessage {
  id: string
  /** Sent by the shop (or its chat bot). */
  mine: boolean
  /** The shop's chat bot replied automatically. */
  bot: boolean
  /** A Taladonline notice to both sides (e.g. an order out of stock). */
  system?: boolean
  /** A shared location (e.g. where the customer wants delivery). */
  location?: { lat: number; lng: number } | null
  text: string
  hasPhoto: boolean
  product: ChatProductRef | null
  /** Products the bot showed under its reply. */
  products: ChatProductRef[]
  /** An order card (buy by chat). */
  order: ChatOrderSummary | null
  createdAt: string
}

export interface ChatThread {
  id: string
  customer: { name: string }
  hasMore: boolean
  /** When the customer last opened the chat: the shop's messages up to then are read. */
  otherReadAt: string | null
  messages: ChatMessage[]
}

/** Seller Center → Chat Bot (API `me/shop/chatbot`). */
export interface ShopFaq {
  id: string
  question: string
  answer: string
  updatedAt: string
}

export interface ChatbotOverview {
  engine: 'ai' | 'basic'
  knows: { products: number; hours: boolean; address: boolean; transfer: boolean; description: boolean }
  faqs: ShopFaq[]
}

export type BotTopic =
  | 'faq' | 'greeting' | 'thanks' | 'order' | 'hours' | 'location' | 'payment' | 'delivery' | 'discount'
  | 'color' | 'size' | 'price' | 'stock' | 'cheaper' | 'search' | 'buy' | 'unknown' | 'photo' | 'ai'

export interface BotPreview {
  text: string
  products: ChatProductRef[]
  topic: BotTopic
  handoff: boolean
  engine: 'ai' | 'basic'
  /** An order card for the shown product would go with the reply. */
  order: boolean
}

/** Buy by chat: an order card in a chat, as both sides see it. */
export interface ChatOrderSummary {
  id: string
  status: 'DRAFT' | 'PLACED' | 'CANCELLED'
  orderNumber: string | null
  createdBy: 'CUSTOMER' | 'SHOP' | 'BOT' | 'ASSISTANT'
  items: { name: string; variantLabel: string | null; quantity: number; imageUrl: string | null }[]
  total: number
}

/** A Seller Center / admin notification (API `me/shop/notifications`). */
export interface InboxNotification {
  id: string
  type: string
  title: string
  body: string
  data: { link?: string; imageUrl?: string; i18n?: Partial<Record<'lo' | 'en', { title: string; body: string }>> }
  readAt: string | null
  createdAt: string
}

export interface InboxPage {
  items: InboxNotification[]
  unread: number
  nextCursor: string | null
}
