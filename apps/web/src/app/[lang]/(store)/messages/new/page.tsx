import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import { requireCustomer } from "@/lib/require-customer";
import { getSessionToken } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

type Props = PageProps<"/[lang]/messages/new">;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** "Chat with shop": opens (or creates) the private chat with that shop, then goes to it. */
export default async function NewConversationPage({ searchParams }: Props) {
  const locale = await getLocale();
  const sp = await searchParams;
  const shop = one(sp.shop).slice(0, 80);
  const product = /^[0-9a-f-]{36}$/i.test(one(sp.product)) ? one(sp.product) : "";
  const order = one(sp.order).slice(0, 40);
  const query = new URLSearchParams({ shop, ...(product && { product }), ...(order && { order }) });
  await requireCustomer(locale, `/${locale}/messages/new?${query}`);
  const { messages } = await getDictionary();

  let error: keyof typeof messages.errors = "generic";
  try {
    const res = await fetch(`${API_URL}/me/conversations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await getSessionToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ shop }),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.id) {
      const next = new URLSearchParams({ ...(product && { product }), ...(order && { order }) });
      redirect(`/${locale}/messages/${json.id}${next.size ? `?${next}` : ""}`);
    }
    if (json?.code === "OWN_SHOP" || json?.code === "SHOP_NOT_FOUND") error = json.code;
  } catch (e) {
    // redirect() works by throwing; let it through.
    if (e && typeof e === "object" && "digest" in e) throw e;
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Store className="size-7" />
      </span>
      <p className="font-semibold">{messages.errors[error]}</p>
      <Link href={`/${locale}/messages`} className="text-sm font-semibold text-primary hover:underline">
        {messages.title}
      </Link>
    </div>
  );
}
