import type { Metadata } from "next";
import { FeedView } from "@/components/feed/feed-view";
import { apiGet, feedPath, type FeedPage, type FeedPostItem } from "@/lib/api";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

// New videos show up within a minute; later pages are always fetched live.
export const revalidate = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata({ searchParams }: PageProps<"/[lang]/feed">): Promise<Metadata> {
  const { feed } = await getDictionary();
  const post = await sharedPost((await searchParams).post);
  return {
    title: feed.title,
    ...(post && { description: post.caption || post.author.name, openGraph: { type: "video.other", title: post.caption || feed.title } }),
  };
}

/** A post shared by link (`?post=<id>`): the feed opens on it. */
async function sharedPost(id: unknown): Promise<FeedPostItem | null> {
  return typeof id === "string" && UUID.test(id) ? apiGet<FeedPostItem>(`/feed-posts/${id}`) : null;
}

/** Feed: shops' product videos and customers' own videos, newest first, one per screen (§2.5). */
export default async function FeedPage({ searchParams }: PageProps<"/[lang]/feed">) {
  const locale = await getLocale();
  const { feed: dict, cartErrors } = await getDictionary();
  const [first, shared] = await Promise.all([apiGet<FeedPage>(feedPath()), sharedPost((await searchParams).post)]);
  const items = first?.items ?? [];

  return (
    <FeedView
      locale={locale}
      dict={dict}
      cartErrors={cartErrors}
      initialItems={shared ? [shared, ...items.filter((i) => i.id !== shared.id)] : items}
      initialCursor={first?.nextCursor ?? null}
    />
  );
}
