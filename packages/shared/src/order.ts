import { DEPOSIT_NOTES } from './guarantee-deposit.js';
/** Order lifecycle (scope §3.6). */
export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'RETURN_REQUESTED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed forward transitions; anything not listed is rejected. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // A shop can ship straight from a new order (packing + bill in one step).
  PENDING: ['CONFIRMED', 'SHIPPED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'SHIPPED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  // The customer confirms receipt (or it completes on its own) straight from "sent".
  SHIPPED: ['DELIVERED', 'COMPLETED', 'RETURN_REQUESTED'],
  DELIVERED: ['COMPLETED', 'RETURN_REQUESTED'],
  // A return can still be asked for during RETURN_RULES.windowDays after completing.
  COMPLETED: ['RETURN_REQUESTED'],
  CANCELLED: [],
  RETURN_REQUESTED: ['COMPLETED', 'CANCELLED'],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Customer-facing order-history tabs and the order statuses each one covers. */
export const ORDER_TABS = {
  'to-pay': ['PENDING'],
  'to-ship': ['CONFIRMED', 'PACKED'],
  'to-receive': ['SHIPPED', 'DELIVERED'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED'],
  refund: ['RETURN_REQUESTED'],
} as const satisfies Record<string, readonly OrderStatus[]>;
export type OrderTab = keyof typeof ORDER_TABS;

export function isOrderTab(value: unknown): value is OrderTab {
  return typeof value === 'string' && Object.hasOwn(ORDER_TABS, value);
}

export const PAYMENT_METHODS = [
  'COD',
  'BANK_TRANSFER',
  'BCEL_ONE',
  'LAPNET',
  'U_MONEY',
  'CARD',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Methods offered at checkout today. Payments are manual: BANK_TRANSFER means the
 * customer scans the shop's LAO QR with any bank app and uploads the slip.
 * BCEL One / LAPNet / U-Money return once direct gateway integrations exist.
 */
export const CHECKOUT_PAYMENT_METHODS = ['BANK_TRANSFER', 'COD'] as const satisfies readonly PaymentMethod[];

/** Methods where the customer uploads transfer slips for MC Mart to check. */
export const SLIP_PAYMENT_METHODS: readonly PaymentMethod[] = ['BANK_TRANSFER', 'BCEL_ONE', 'LAPNET', 'U_MONEY'];
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

/**
 * Transfer payments go to MC Mart's account; an admin checks the slips before the shop
 * sees the order. A customer sends at most this many slips at a time (one transfer can be
 * split over several).
 */
export const MAX_PAYMENT_SLIPS = 3;

/** A sent order completes on its own this many days after shipping, unless the customer confirms it sooner. */
export const AUTO_COMPLETE_DAYS = 7;

/** Loyalty points an order earns, by its total. `upTo` is inclusive; null means any amount above the other ranges. */
export interface PointTier {
  upTo: number | null;
  points: number;
}

export const POINT_TIER_RULES = { maxTiers: 20, amountMax: 1_000_000_000_000, pointsMax: 1_000_000 } as const;

export const sortPointTiers = (tiers: readonly PointTier[]): PointTier[] => [...tiers].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));

/** Each range ends at a different amount, so only one can be open-ended. */
export const pointTiersValid = (tiers: readonly PointTier[]): boolean =>
  tiers.length <= POINT_TIER_RULES.maxTiers &&
  new Set(tiers.map((t) => t.upTo)).size === tiers.length &&
  tiers.every((t) => t.upTo === null || (t.upTo >= 1 && t.upTo <= POINT_TIER_RULES.amountMax));

/** Points for an order of `total` kip: its range's points, or none above the last range. */
export const pointsForTotal = (tiers: readonly PointTier[], total: number): number =>
  total > 0 ? (sortPointTiers(tiers).find((t) => t.upTo === null || total <= t.upTo)?.points ?? 0) : 0;

/** The ranges in order, each with the amount it starts above, for showing them. */
export const pointTierRanges = (tiers: readonly PointTier[]): (PointTier & { over: number })[] =>
  sortPointTiers(tiers).map((t, i, sorted) => ({ ...t, over: i > 0 ? (sorted[i - 1].upTo ?? 0) : 0 }));

/** Order history notes for a courier bill corrected while the parcel is on its way. */
export const BILL_REPORTED_NOTE = 'Customer reported the wrong bill';
export const BILL_REPLACED_NOTE = 'Shop uploaded a new bill';

/** History notes that record something on the order, not the moment it reached that status. */
export const ORDER_SIDE_NOTES: readonly string[] = [BILL_REPORTED_NOTE, BILL_REPLACED_NOTE, ...Object.values(DEPOSIT_NOTES)];

/** A wrong bill only matters until the parcel arrives: the customer can report it and the shop replace it. */
export const billCorrectable = (status: OrderStatus): boolean => status === 'SHIPPED' || status === 'DELIVERED';

/**
 * Returns (Terms §13–16): the customer, or the shop for a COD order nobody took, sends the reason
 * and photos or a video clip directly to MC Mart, who decides. Open from when the order is
 * sent until `windowDays` after it completes; payouts wait out the same days (see
 * `settleableOrders` in the API). `videoMaxBytes` stays under Cloudflare's 100 MB request limit.
 */
export const RETURN_RULES = {
  windowDays: 3,
  maxFiles: 5,
  maxVideos: 1,
  imageMaxBytes: 10 * 1024 * 1024,
  videoMaxBytes: 90 * 1024 * 1024,
  detailsMax: 1000,
} as const;

export const RETURN_FILE_TYPES = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

/** Why a customer returns an order (Terms §13). */
export const RETURN_REASONS = ['WRONG_ITEM', 'DAMAGED', 'NOT_AS_DESCRIBED', 'MISSING_ITEMS', 'NOT_WORKING', 'OTHER'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

/** A shop's reason for returning a cash-on-delivery order: the customer never took it. */
export const NOT_COLLECTED_REASON = 'NOT_COLLECTED';

const RETURN_WINDOW_MS = RETURN_RULES.windowDays * 86_400_000;

/** The last moment to ask for a return of an order completed at `completedAt`. */
export const returnDeadline = (completedAt: Date | string) => new Date(new Date(completedAt).getTime() + RETURN_WINDOW_MS);

/** Whether an order in `status` (completed at `completedAt`, if it did) can still be returned. */
export function returnOpen(status: OrderStatus, completedAt: Date | string | null | undefined, now = new Date()): boolean {
  if (status === 'SHIPPED' || status === 'DELIVERED') return true;
  return status === 'COMPLETED' && !!completedAt && returnDeadline(completedAt) > now;
}

/** Most units of one line a customer can put in the cart. */
export const MAX_CART_QUANTITY = 99;

/** Seller Center order tabs (§3.6) and the statuses each shows. */
export const SHOP_ORDER_TABS = {
  'to-pay': ['PENDING'],
  'to-ship': ['CONFIRMED', 'PACKED'],
  shipping: ['SHIPPED', 'DELIVERED'],
  returns: ['RETURN_REQUESTED'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED'],
} as const satisfies Record<string, readonly OrderStatus[]>;
export type ShopOrderTab = keyof typeof SHOP_ORDER_TABS;

export function isShopOrderTab(value: unknown): value is ShopOrderTab {
  return typeof value === 'string' && Object.hasOwn(SHOP_ORDER_TABS, value);
}

/**
 * What a shop can do to an order, from which statuses, and where it leads. `null` keeps
 * the status (rejecting a return escalates it to MC Mart instead).
 *
 * Shops only get orders that are paid (a transfer MC Mart checked) or cash on delivery,
 * as CONFIRMED. From there: `ship` (pack it and upload the courier's bill, in one step; the
 * customer then confirms receipt or it completes after AUTO_COMPLETE_DAYS) or `out-of-stock`
 * (cancels it, sets the stock to 0, tells both sides in their chat; MC Mart refunds a
 * paid transfer). `pack` remains for older clients.
 */
export const SHOP_ORDER_ACTIONS = {
  pack: { from: ['CONFIRMED'], to: 'PACKED' },
  ship: { from: ['CONFIRMED', 'PACKED'], to: 'SHIPPED' },
  'out-of-stock': { from: ['CONFIRMED', 'PACKED'], to: 'CANCELLED' },
  cancel: { from: ['CONFIRMED', 'PACKED'], to: 'CANCELLED' },
  'approve-return': { from: ['RETURN_REQUESTED'], to: 'CANCELLED' },
  'reject-return': { from: ['RETURN_REQUESTED'], to: null },
} as const satisfies Record<string, { from: readonly OrderStatus[]; to: OrderStatus | null }>;
export type ShopOrderAction = keyof typeof SHOP_ORDER_ACTIONS;
export const SHOP_ORDER_ACTION_NAMES = Object.keys(SHOP_ORDER_ACTIONS) as ShopOrderAction[];

/** Actions available for an order in `status`. */
export function shopOrderActions(status: OrderStatus): ShopOrderAction[] {
  return SHOP_ORDER_ACTION_NAMES.filter((a) => (SHOP_ORDER_ACTIONS[a].from as readonly OrderStatus[]).includes(status));
}
