import type { ChatOrderSummary } from "./chat-orders";

/** Mirrors the API's private customer ↔ shop chat (services/api messages). */
export interface ConversationSummary {
  id: string;
  shop: { name: string; slug: string; logoUrl: string | null };
  customer: { name: string };
  lastMessage: { text: string; photo: boolean; audio?: boolean; product: boolean; order: boolean; location?: boolean; mine: boolean; bot: boolean; system?: boolean; createdAt: string } | null;
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
  /** The shop's auto-reply (its chat bot). */
  bot: boolean;
  /** A MC Mart notice to both sides (e.g. an order out of stock). */
  system?: boolean;
  /** A shared location (e.g. where to deliver). */
  location?: { lat: number; lng: number } | null;
  text: string;
  hasPhoto: boolean;
  /** A voice message and how long it is (play it from `messageAudioUrl`). */
  audio: { ms: number } | null;
  product: ChatProductRef | null;
  /** Products the bot shows under its reply. */
  products: ChatProductRef[];
  /** An order card (buy by chat). */
  order: ChatOrderSummary | null;
  createdAt: string;
}

export interface ShopThread {
  id: string;
  shop: { name: string; slug: string; logoUrl: string | null };
  customer: { name: string };
  hasMore: boolean;
  /** When the shop last opened the chat: the customer's messages up to then are read. */
  otherReadAt: string | null;
  messages: ShopChatMessage[];
}

/** Photo URL through the storefront (adds the session; the API only serves the chat's two sides). */
export const messagePhotoUrl = (conversationId: string, messageId: string) => `/api/messages/${conversationId}/${messageId}`;

/** Voice message URL through the storefront (adds the session; supports seeking). */
export const messageAudioUrl = (conversationId: string, messageId: string) => `/api/messages/${conversationId}/${messageId}/audio`;
