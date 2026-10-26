import type { Metadata } from "next";
import { BadgeCheck, Store, Users } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/components/account/page-heading";
import { FollowButton } from "@/components/shop/follow-button";
import type { FollowedShop } from "@/lib/follow-actions";
import { formatCount, interpolate } from "@/lib/format";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { account } = await getDictionary();
  return { title: account.followedShops, robots: { index: false } };
}

/** The shops the customer follows, most recently followed first, with an unfollow toggle. */
export default async function FollowingPage() {
  const locale = await getLocale();
  const { account, shop: shopDict } = await getDictionary();
  await requireCustomer(locale, `/${locale}/account/following`);
  const shops = (await apiGetAsCustomer<FollowedShop[]>("/me/follows")) ?? [];

  return (
    <>
      <PageHeading title={account.followedShops} />
      {shops.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center shadow-sm ring-1 ring-border">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Store className="size-7" strokeWidth={1.75} />
          </span>
          <h2 className="font-semibold">{account.followedEmpty}</h2>
          <p className="max-w-xs text-sm text-muted-foreground">{account.followedEmptyBody}</p>
          <Link
            href={`/${locale}`}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
          >
            {account.browseShops}
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          {shops.map((s) => (
            <li key={s.id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
              <Link href={`/${locale}/s/${s.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-primary">
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- media CDN host not configured yet
                    <img src={s.logoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <Store className="size-6" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-semibold">
                    <span className="truncate">{s.name}</span>
                    {s.verified && <BadgeCheck className="size-4 shrink-0 text-primary" />}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{interpolate(account.followedProducts, { n: s.productCount })}</span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {interpolate(shopDict.followers, { n: formatCount(s.followers, locale) })}
                    </span>
                  </span>
                </span>
              </Link>
              <FollowButton shopId={s.id} size="sm" initialFollowing labels={{ follow: shopDict.follow, following: shopDict.following }} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
