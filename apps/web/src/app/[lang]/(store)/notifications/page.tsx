import { isNotificationTab, type Locale, type NotificationTab } from "@talad/shared";
import {
  BellOff,
  BellRing,
  Info,
  LayoutList,
  Package,
  TicketPercent,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/account/page-heading";
import { MarkAllReadButton, NotificationRow } from "@/components/notifications/notification-controls";
import { Pagination } from "@/components/pagination";
import { ProductImage } from "@/components/product-image";
import {
  notificationHref,
  notificationText,
  type CustomerNotification,
  type NotificationList,
} from "@/lib/notifications";
import { formatDate } from "@/lib/orders";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale, type Dictionary } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { notifications } = await getDictionary();
  return { title: notifications.title, robots: { index: false } };
}

type Dict = Dictionary["notifications"];

/** Look of each notification type: icon and its colours. */
const TYPE_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  ORDER: { icon: Package, tone: "bg-primary-soft text-primary" },
  PROMOTION: { icon: TicketPercent, tone: "bg-sale/10 text-sale" },
  PRICE_DROP: { icon: TrendingDown, tone: "bg-orange-50 text-orange-600" },
  SYSTEM: { icon: Info, tone: "bg-sky-50 text-sky-600" },
};

const LOCALE_TAGS: Record<Locale, string> = { lo: "lo-LA", en: "en-GB" };
/** Day boundaries for "Today" / "Yesterday" follow the marketplace's timezone. */
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Vientiane" });

/** "Just now", "5 min. ago", "3 hr. ago", "2 days ago", then the date. */
function timeAgo(iso: string, now: number, locale: Locale, dict: Dict): string {
  const seconds = (now - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return dict.justNow;
  const rtf = new Intl.RelativeTimeFormat(LOCALE_TAGS[locale], { numeric: "auto", style: "short" });
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return rtf.format(-Math.floor(seconds / 3600), "hour");
  if (seconds < 7 * 86_400) return rtf.format(-Math.floor(seconds / 86_400), "day");
  return formatDate(iso, locale);
}

/** Rendered per request (it reads the session), so one clock reading per render is right. */
const requestTime = () => Date.now();

/** Splits a newest-first page into Today / Yesterday / Earlier. */
function groupByDay(items: CustomerNotification[], now: number, dict: Dict) {
  const today = dayKey(new Date(now));
  const yesterday = dayKey(new Date(now - 86_400_000));
  const groups: { label: string; items: CustomerNotification[] }[] = [];
  for (const item of items) {
    const key = dayKey(new Date(item.createdAt));
    const label = key === today ? dict.today : key === yesterday ? dict.yesterday : dict.earlier;
    if (groups.at(-1)?.label === label) groups.at(-1)!.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** Notification inbox (§4.7) with type tabs (?tab=orders|promotions|updates). */
export default async function NotificationsPage({ searchParams }: PageProps<"/[lang]/notifications">) {
  const locale = await getLocale();
  const { notifications: dict, account } = await getDictionary();
  const { tab, page: pageParam } = await searchParams;
  const active: NotificationTab | "all" = isNotificationTab(tab) ? tab : "all";
  const page = Math.max(1, Number.parseInt(typeof pageParam === "string" ? pageParam : "", 10) || 1);
  const base = `/${locale}/notifications`;

  /** URL for a tab + page; page 1 and the "all" tab are left out to keep links clean. */
  const listHref = (t: NotificationTab | "all", p = 1) => {
    const params = new URLSearchParams();
    if (t !== "all") params.set("tab", t);
    if (p > 1) params.set("page", String(p));
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };

  await requireCustomer(locale, listHref(active, page));

  const apiQuery = new URLSearchParams({ page: String(page) });
  if (active !== "all") apiQuery.set("tab", active);
  const data = await apiGetAsCustomer<NotificationList>(`/me/notifications?${apiQuery}`);
  if (data && page > data.totalPages) redirect(listHref(active, data.totalPages));
  const now = requestTime();
  const groups = groupByDay(data?.items ?? [], now, dict);
  const unreadHere = data?.unread[active] ?? 0;

  const tabs: { key: NotificationTab | "all"; label: string; icon: LucideIcon }[] = [
    { key: "all", label: dict.all, icon: LayoutList },
    { key: "orders", label: dict.orders, icon: Package },
    { key: "promotions", label: dict.promotions, icon: TicketPercent },
    { key: "updates", label: dict.updates, icon: BellRing },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:py-8">
      <PageHeading
        title={dict.title}
        description={dict.description}
        action={
          <MarkAllReadButton
            tab={active === "all" ? undefined : active}
            disabled={unreadHere === 0}
            label={dict.markAllRead}
          />
        }
      />

      <nav
        aria-label={dict.title}
        className="no-scrollbar sticky top-(--header-h) z-10 -mx-4 flex overflow-x-auto border-b border-border bg-background/95 px-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:bg-card sm:px-1.5 sm:py-1.5 sm:shadow-sm"
      >
        {tabs.map(({ key, label, icon: Icon }) => {
          const selected = key === active;
          const count = data?.unread[key] ?? 0;
          return (
            <Link
              key={key}
              href={listHref(key)}
              scroll={false}
              aria-current={selected ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition-colors sm:py-2 ${
                selected
                  ? "bg-primary-soft font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
              {count > 0 && (
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 ${
                    selected ? "bg-primary text-primary-foreground" : "bg-sale/10 text-sale"
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center shadow-sm ring-1 ring-border sm:py-12">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <BellOff className="size-7" strokeWidth={1.75} />
          </span>
          <h2 className="font-semibold">{active === "all" ? dict.empty : dict.emptyTab}</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            {active === "all" ? dict.emptyBody : dict.emptyTabBody}
          </p>
        </div>
      ) : (
        groups.map((group, g) => (
          <section key={g} className="flex flex-col gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
              {group.items.map((n) => {
                const { title, body } = notificationText(n, locale);
                const { icon: Icon, tone } = TYPE_STYLE[n.type] ?? TYPE_STYLE.SYSTEM;
                return (
                  <li key={n.id}>
                    <NotificationRow
                      id={n.id}
                      unread={n.readAt === null}
                      href={notificationHref(n, locale)}
                      className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted data-unread:bg-primary-soft/40 data-unread:hover:bg-primary-soft/70"
                    >
                      <span className="relative shrink-0">
                        {n.data.imageUrl ? (
                          <span className="relative block size-12 overflow-hidden rounded-xl bg-muted">
                            <ProductImage src={n.data.imageUrl} alt="" sizes="48px" className="object-cover" />
                          </span>
                        ) : (
                          <span className={`flex size-12 items-center justify-center rounded-xl ${tone}`}>
                            <Icon className="size-6" />
                          </span>
                        )}
                        {n.data.imageUrl && (
                          <span
                            className={`absolute -bottom-1 -right-1 flex size-5.5 items-center justify-center rounded-full ring-2 ring-card ${tone}`}
                          >
                            <Icon className="size-3" />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="flex-1 text-sm font-medium group-data-unread:font-bold">{title}</span>
                          <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                            {timeAgo(n.createdAt, now, locale, dict)}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{body}</span>
                      </span>
                      <span className="mt-1.5 hidden size-2.5 shrink-0 rounded-full bg-sale group-data-unread:block">
                        <span className="sr-only">{dict.unread}</span>
                      </span>
                    </NotificationRow>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {data && data.total > 0 && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          totalPages={data.totalPages}
          href={(p) => listHref(active, p)}
          labels={account}
        />
      )}
    </div>
  );
}
