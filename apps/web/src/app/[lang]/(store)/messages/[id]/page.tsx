import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopChat } from "@/components/messages/shop-chat";
import type { ShopThread } from "@/lib/messages";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

type Props = PageProps<"/[lang]/messages/[id]">;

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await getDictionary();
  return { title: messages.title, robots: { index: false } };
}

/** One private chat with a shop. `?product=` / `?order=` prefill what the customer asks about. */
export default async function ConversationPage({ params, searchParams }: Props) {
  const locale = await getLocale();
  const { id } = await params;
  await requireCustomer(locale, `/${locale}/messages/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // The API only returns it to this customer (other accounts get "not found").
  const thread = await apiGetAsCustomer<ShopThread>(`/me/conversations/${id}`);
  if (!thread) notFound();
  const sp = await searchParams;
  const productId = typeof sp.product === "string" && /^[0-9a-f-]{36}$/i.test(sp.product) ? sp.product : null;
  const order = typeof sp.order === "string" ? sp.order.slice(0, 40) : null;
  const { messages, chatOrder, checkout, account, cartErrors, auth } = await getDictionary();
  return (
    <ShopChat
      locale={locale}
      dict={messages}
      orderDicts={{ chatOrder, checkout, account, cartErrors, close: auth.close }}
      initial={thread}
      productId={productId}
      order={order}
    />
  );
}
