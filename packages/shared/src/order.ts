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
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['COMPLETED', 'RETURN_REQUESTED'],
  COMPLETED: [],
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

/** Methods where the customer uploads a transfer slip for the shop to verify. */
export const SLIP_PAYMENT_METHODS: readonly PaymentMethod[] = ['BANK_TRANSFER', 'BCEL_ONE', 'LAPNET', 'U_MONEY'];
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

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
 * the status (rejecting a return escalates it to Taladonline instead).
 */
export const SHOP_ORDER_ACTIONS = {
  confirm: { from: ['PENDING'], to: 'CONFIRMED' },
  'reject-payment': { from: ['PENDING'], to: 'CANCELLED' },
  pack: { from: ['CONFIRMED'], to: 'PACKED' },
  ship: { from: ['PACKED'], to: 'SHIPPED' },
  deliver: { from: ['SHIPPED'], to: 'DELIVERED' },
  cancel: { from: ['PENDING', 'CONFIRMED', 'PACKED'], to: 'CANCELLED' },
  'approve-return': { from: ['RETURN_REQUESTED'], to: 'CANCELLED' },
  'reject-return': { from: ['RETURN_REQUESTED'], to: null },
} as const satisfies Record<string, { from: readonly OrderStatus[]; to: OrderStatus | null }>;
export type ShopOrderAction = keyof typeof SHOP_ORDER_ACTIONS;
export const SHOP_ORDER_ACTION_NAMES = Object.keys(SHOP_ORDER_ACTIONS) as ShopOrderAction[];

/** Actions available for an order in `status`. */
export function shopOrderActions(status: OrderStatus): ShopOrderAction[] {
  return SHOP_ORDER_ACTION_NAMES.filter((a) => (SHOP_ORDER_ACTIONS[a].from as readonly OrderStatus[]).includes(status));
}
