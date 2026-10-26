import type { Locale } from "@talad/shared";
import { BadgeCheck, CalendarDays, MessageCircleMore, Package, Star, Store, Users } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { formatCount, interpolate } from "@/lib/format";
import type { PublicShop } from "@/lib/shop";
import { ShareButton } from "../product/share-button";
import type { ShareSheetDict } from "../feed/share-sheet";
import { FollowButton, FollowerCount } from "./follow-button";
import { ShopDescription } from "./shop-description";

const DATE_LOCALES = { lo: "lo-LA", en: "en-GB" } as const;

/** Shop hero: cover, logo, name, trust signals and description (§3.2). */
export function ShopHeader({
  shop,
  locale,
  dict,
  shareDict,
}: {
  shop: PublicShop;
  locale: Locale;
  dict: Dictionary["shop"];
  shareDict: ShareSheetDict;
}) {
  const joined = new Intl.DateTimeFormat(DATE_LOCALES[locale], { month: "long", year: "numeric" }).format(
    new Date(shop.joinedAt),
  );
  const initials = shop.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <section className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border">
      <div className="relative h-32 sm:h-44">
        {shop.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- media CDN host not configured yet
          <img src={shop.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-gradient-to-br from-[#43a047] via-primary to-[#1b5e20]">
            <Store aria-hidden strokeWidth={1} className="absolute -bottom-8 right-6 size-48 text-white/10" />
            <div
              aria-hidden
              className="absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]"
            />
          </div>
        )}
      </div>

      {/* relative + z-10: the logo overlaps the cover, so this row must stack above it */}
      <div className="relative z-10 flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:gap-5 sm:px-6">
        <span className="-mt-12 flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card text-2xl font-bold text-primary shadow-lg ring-4 ring-card sm:-mt-14 sm:size-28">
          {shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- media CDN host not configured yet
            <img src={shop.logoUrl} alt={shop.name} className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center bg-primary-soft">{initials}</span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{shop.name}</h1>
            {shop.verified && (
              <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                <BadgeCheck className="size-3.5" />
                {dict.verified}
              </span>
            )}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <Package className="size-4" />
              {interpolate(dict.productCount, { n: formatCount(shop.productCount, locale) })}
            </li>
            {shop.ratingCount > 0 && (
              <li className="flex items-center gap-1.5">
                <Star className="size-4 fill-amber-400 text-amber-400" />
                {interpolate(dict.rating, { rating: shop.ratingAvg.toFixed(1), n: shop.ratingCount })}
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <Users className="size-4" />
              <FollowerCount shopId={shop.id} initial={shop.followerCount} label={dict.followers} locale={locale} />
            </li>
            <li className="flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              {interpolate(dict.joined, { date: joined })}
            </li>
          </ul>
        </div>

        {/* Phones: follow and chat share the row, share is an icon. */}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 whitespace-nowrap sm:flex sm:self-end">
          <FollowButton shopId={shop.id} labels={{ follow: dict.follow, following: dict.following }} />
          <Link
            href={`/${locale}/messages/new?shop=${shop.slug}`}
            className="flex h-11 items-center justify-center gap-1.5 rounded-full border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft sm:px-5"
          >
            <MessageCircleMore className="size-4" />
            {dict.chat}
          </Link>
          <ShareButton title={shop.name} label={dict.share} dict={shareDict} variant="pill" iconOnlyOnPhones />
        </div>
      </div>

      {shop.description && (
        <div className="border-t border-border px-5 py-4 sm:px-6">
          <h2 className="mb-1 text-sm font-semibold">{dict.about}</h2>
          <ShopDescription text={shop.description} labels={{ more: dict.readMore, less: dict.readLess }} />
        </div>
      )}
    </section>
  );
}
