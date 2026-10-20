import type { Metadata } from "next";
import { FeedView } from "@/components/feed/feed-view";
import { apiGet, feedPath, type FeedPage } from "@/lib/api";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

// New product videos show up within a minute; later pages are always fetched live.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { feed } = await getDictionary();
  return { title: feed.title };
}

/** Feed: shops' product videos, newest first, one per screen (§2.5). */
export default async function FeedPage() {
  const locale = await getLocale();
  const { feed: dict, cartErrors } = await getDictionary();
  const first = await apiGet<FeedPage>(feedPath());

  return (
    <FeedView
      locale={locale}
      dict={dict}
      cartErrors={cartErrors}
      initialItems={first?.items ?? []}
      initialCursor={first?.nextCursor ?? null}
    />
  );
}
