import type { Locale, OrderStatus } from '@talad/shared';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
/** The Seller Center, where shops sign up. */
export const SHOP_URL = (process.env.EXPO_PUBLIC_SHOP_URL ?? 'http://localhost:5174').replace(/\/$/, '');
/** The storefront: checkout and order details open there. */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

let token: string | null = null;
let onUnauthorized: () => void = () => {};

/** The signed-in customer's session token, sent with every request. */
export function setApiToken(value: string | null) {
  token = value;
}

/** The current session token (for requests `api()` doesn't cover, like multipart uploads). */
export const getApiToken = () => token;

/** Called when the API says the session is no longer valid (signed out elsewhere, expired). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, body: { code?: unknown; message?: unknown }) {
    super(typeof body.message === 'string' ? body.message : `HTTP ${status}`);
    this.status = status;
    this.code = typeof body.code === 'string' ? body.code : undefined;
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, body);
  }
  return body as T;
}

export type LocalizedText = Partial<Record<Locale, string>>;

export const localized = (text: LocalizedText | null | undefined, locale: Locale) => text?.[locale] ?? text?.en ?? text?.lo ?? '';

export interface CategoryNode {
  id: string;
  slug: string;
  name: LocalizedText;
  iconUrl: string | null;
  imageUrl: string | null;
  children: CategoryNode[];
}

/** Mirrors `ProductCard` from services/api catalog/products. */
export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  /** Lowest price; `priceMax` is set when variants make it a range. */
  price: number;
  priceMax: number | null;
  compareAtPrice: number | null;
  imageUrl: string | null;
  soldCount: number;
  ratingAvg: number;
  shop: { slug: string; name: string };
  /** Set while in a running flash sale; prices are already discounted. */
  flashSale?: { percent: number; endsAt: string } | null;
}

export interface ProductVariant {
  id: string;
  sku: string;
  label: string;
  attributes: Record<string, string>;
  price: number;
  regularPrice: number | null;
  stock: number;
}

/** Mirrors `ProductDetail` from services/api catalog/products. */
export interface ProductDetail extends Omit<ProductCard, 'imageUrl' | 'shop'> {
  description: string | null;
  stock: number;
  imageUrls: string[];
  videoUrl: string | null;
  ratingCount: number;
  options: { name: string; values: string[] }[];
  variants: ProductVariant[];
  unit: { code: string; name: LocalizedText };
  category: { slug: string; name: LocalizedText; parent: { slug: string; name: LocalizedText } | null };
  shop: { id: string; slug: string; name: string; logoUrl: string | null; verified: boolean; productCount: number };
}

export interface CartItem {
  id: string;
  productId: string;
  productSlug: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  stock: number;
  available: boolean;
  ownShop: boolean;
  lineTotal: number;
}

export interface CartView {
  shops: { shop: { id: string; slug: string; name: string }; items: CartItem[]; subtotal: number }[];
  count: number;
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** External photo (e.g. Google); used when nothing was uploaded. */
  avatarUrl: string | null;
  /** Set when the customer uploaded a photo (served by the API). */
  avatarVersion: string | null;
  createdAt: string;
  linked: { google: boolean; apple: boolean };
  /** The shop this account owns (accounts can buy and sell). */
  shop: { id: string; slug: string; name: string; status: string } | null;
}

/** A customer's public video profile. */
export interface PublicProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: string;
  followers: number;
  following: number;
  videos: number;
  likes: number;
}

/** A video the customer liked (a post) or saved (a shop's product video). */
export interface LikedVideo {
  kind: 'post' | 'product';
  id: string;
  videoUrl: string;
  posterUrl: string | null;
  title: string;
  stats: { views: number; likes: number; comments: number; shares: number };
}

/** The customer's photo: their upload, else their Google/Apple picture. */
export const avatarSrc = (c: Pick<CustomerProfile, 'id' | 'avatarUrl' | 'avatarVersion'>) =>
  c.avatarVersion ? `${API_URL}/avatars/${c.id}?v=${c.avatarVersion}` : c.avatarUrl;

/** Multipart upload (photos, QR images); `file` is a picked image. */
export async function upload<T>(path: string, field: string, file: { uri: string; mimeType?: string | null; fileName?: string | null }, extra: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  // React Native's FormData takes { uri, name, type } for files.
  form.append(field, { uri: file.uri, name: file.fileName ?? 'photo.jpg', type: file.mimeType ?? 'image/jpeg' } as unknown as Blob);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface AddressItem {
  id: string;
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  village: string | null;
  line: string;
  isDefault: boolean;
}

export interface BankAccountItem {
  id: string;
  bankCode: string;
  accountName: string;
  accountNumber: string;
  hasQr: boolean;
  isDefault: boolean;
}

export interface FollowedShop {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  verified: boolean;
  productCount: number;
  followers: number;
}

export interface PointsView {
  balance: number;
  owed: number;
  pointValue: number;
  worth: number;
  earnTiers: { upTo: number | null; points: number }[];
  earnPer: number;
  expiryDays: number | null;
  items: { id: string; type: 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST'; points: number; note: string | null; orderNumber: string | null; expiresAt: string | null; createdAt: string }[];
  nextCursor: string | null;
}

export interface ConversationSummary {
  id: string;
  shop: { name: string; slug: string; logoUrl: string | null };
  lastMessage: { text: string; photo: boolean; product: boolean; order: boolean; location?: boolean; mine: boolean; bot: boolean } | null;
  lastMessageAt: string;
  unread: number;
}

export interface ChatProductRef {
  id: string;
  name: string;
  slug: string;
  shopSlug: string;
  price: number;
  imageUrl: string | null;
}

export interface ShopChatMessage {
  id: string;
  mine: boolean;
  bot: boolean;
  system?: boolean;
  location?: { lat: number; lng: number } | null;
  text: string;
  hasPhoto: boolean;
  product: ChatProductRef | null;
  products: ChatProductRef[];
  order: unknown | null;
  createdAt: string;
}

export interface ShopThread {
  id: string;
  shop: { name: string; slug: string; logoUrl: string | null };
  hasMore: boolean;
  otherReadAt: string | null;
  messages: ShopChatMessage[];
}

export interface OrderSummary {
  number: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  itemCount: number;
  shop: { name: string };
  items: { sku: string; name: string; variant: string | null; quantity: number; imageUrl: string | null; lineTotal: number }[];
}

/** A shop's product video in the feed. */
export interface FeedProduct extends Omit<ProductCard, 'shop'> {
  kind?: 'product';
  videoUrl: string;
  shop: { id: string; slug: string; name: string; logoUrl: string | null };
  stats: { views: number; favorites: number; comments: number; shares: number };
}

/** A customer's own video in the feed. */
export interface FeedPost {
  kind: 'post';
  id: string;
  videoUrl: string;
  caption: string;
  author: { id: string; name: string; avatarUrl: string | null };
  stats: { views: number; likes: number; comments: number; shares: number };
}

export type FeedEntry = FeedProduct | FeedPost;

export interface ChatProduct extends ProductCard {
  exact: boolean;
}

export const productHref = (p: { slug: string; shop: { slug: string } }) => `/product/${p.shop.slug}/${p.slug}` as const;
