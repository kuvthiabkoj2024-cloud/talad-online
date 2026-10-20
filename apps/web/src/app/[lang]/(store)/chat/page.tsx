import type { Metadata } from "next";
import { TaladChat } from "@/components/chat/talad-chat";
import type { SavedChatMessage } from "@/lib/chat-actions";
import { apiGetAsCustomer, getCurrentCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { chat } = await getDictionary();
  return { title: chat.title, description: chat.subtitle };
}

/** Market Chat (shop by chat): ask in Lao or English, or send a photo. */
export default async function ChatPage() {
  const locale = await getLocale();
  const { chat, product, cartErrors, messages, chatOrder, checkout, account, auth } = await getDictionary();
  // Signed in: each customer has their own saved conversation with Market Chat.
  const customer = await getCurrentCustomer();
  const [saved, unread] = customer
    ? await Promise.all([
        apiGetAsCustomer<SavedChatMessage[]>("/chat/history"),
        apiGetAsCustomer<{ count: number }>("/me/conversations/unread-count"),
      ])
    : [null, null];
  return (
    <TaladChat
      locale={locale}
      dict={chat}
      buyNow={product.buyNow}
      cartErrors={cartErrors}
      saved={customer ? (saved ?? []) : null}
      shopChats={customer ? { label: messages.openMessages, unread: unread?.count ?? 0 } : null}
      orderDicts={{ chatOrder, checkout, account, cartErrors, close: auth.close }}
    />
  );
}
