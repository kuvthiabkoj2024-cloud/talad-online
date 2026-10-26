import type { Metadata } from "next";
import Link from "next/link";
import { ImageIcon, MapPin, MessagesSquare, ShoppingBag, Store } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import type { ConversationSummary } from "@/lib/messages";
import { interpolate } from "@/lib/format";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await getDictionary();
  return { title: messages.title, robots: { index: false } };
}

/** The customer's private chats with shops (newest first). */
export default async function MessagesPage() {
  const locale = await getLocale();
  await requireCustomer(locale, `/${locale}/messages`);
  const { messages: dict, catalog } = await getDictionary();
  const list = (await apiGetAsCustomer<ConversationSummary[]>("/me/conversations")) ?? [];
  const time = new Intl.DateTimeFormat(locale === "lo" ? "lo-LA" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 sm:py-8">
      <Breadcrumb items={[{ label: catalog.home, href: `/${locale}` }, { label: dict.title }]} />
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{dict.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{dict.subtitle}</p>
      </div>
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <MessagesSquare className="size-10 text-muted-foreground" />
          <p className="font-semibold">{dict.empty}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{dict.emptyHint}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/${locale}/messages/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-primary">
                  {/* eslint-disable-next-line @next/next/no-img-element -- shop logo from the media CDN */}
                  {c.shop.logoUrl ? <img src={c.shop.logoUrl} alt="" className="size-full object-cover" /> : <Store className="size-6" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${c.unread ? "font-bold" : "font-semibold"}`}>{c.shop.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{time.format(new Date(c.lastMessageAt))}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={`flex min-w-0 flex-1 items-center gap-1 truncate text-sm ${c.unread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {c.lastMessage?.mine && <span className="shrink-0">{dict.you}:</span>}
                      {c.lastMessage?.photo ? (
                        <><ImageIcon className="size-4 shrink-0" /> {dict.photo}</>
                      ) : c.lastMessage?.location ? (
                        <><MapPin className="size-4 shrink-0" /> {dict.location}</>
                      ) : c.lastMessage?.product ? (
                        <><ShoppingBag className="size-4 shrink-0" /> {dict.product}</>
                      ) : (
                        <span className="truncate">{c.lastMessage?.text}</span>
                      )}
                    </span>
                    {c.unread > 0 && (
                      <span aria-label={interpolate(dict.unread, { n: c.unread })} className="min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-bold text-primary-foreground">
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
