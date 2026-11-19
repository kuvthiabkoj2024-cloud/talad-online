import { Coins, Gift, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/account/page-heading";
import { PointsHistory } from "@/components/account/points-history";
import { interpolate } from "@/lib/format";
import type { PointsView } from "@/lib/orders";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { account } = await getDictionary();
  return { title: account.pointsTitle, robots: { index: false } };
}

/** The customer's loyalty points: balance, when they expire, and the history (no money values or earning rules). */
export default async function PointsPage() {
  const locale = await getLocale();
  const { account: dict } = await getDictionary();
  await requireCustomer(locale, `/${locale}/account/points`);
  const points = await apiGetAsCustomer<PointsView>("/me/points");
  const p = points ?? { balance: 0, owed: 0, pointValue: 0, worth: 0, earnTiers: [], earnPer: 0, expiryDays: null, items: [], nextCursor: null };

  return (
    <>
      <PageHeading title={dict.pointsTitle} />
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[#43a047] via-primary to-[#1b5e20] p-6 text-white shadow-sm">
        <Coins aria-hidden strokeWidth={1.25} className="absolute -bottom-6 -right-4 size-40 text-white/10" />
        <p className="text-sm text-white/80">{dict.pointsBalanceLabel}</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{p.balance.toLocaleString("en-US")}</p>
        {p.owed > 0 && <p className="mt-1 text-sm font-medium">{interpolate(dict.pointsOwed, { n: p.owed.toLocaleString("en-US") })}</p>}
        <Link
          href={`/${locale}`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-primary shadow transition hover:bg-white/90"
        >
          <ShoppingBag className="size-4" />
          {dict.pointsShop}
        </Link>
      </section>

      {p.expiryDays && (
        <p className="flex items-start gap-2 rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-sm ring-1 ring-border">
          <Gift className="mt-0.5 size-4 shrink-0 text-primary" />
          {interpolate(dict.pointsExpire, { days: p.expiryDays })}
        </p>
      )}

      <PointsHistory initial={p} locale={locale} dict={dict} />
    </>
  );
}
