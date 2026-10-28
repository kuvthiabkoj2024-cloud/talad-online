import type { Metadata } from "next";
import { FeedView } from "@/components/feed/feed-view";
import { apiGet, feedPath, type FeedEntry, type FeedItem, type FeedPage, type FeedPostItem } from "@/lib/api";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

// New videos show up within a minute; later pages are always fetched live.
export const revalidate = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

type Params = Awaited<PageProps<"/[lang]/feed">["searchParams"]>;

export async function generateMetadata({ searchParams }: PageProps<"/[lang]/feed">): Promise<Metadata> {
  const { feed } = await getDictionary();
  const linked = await linkedVideo(await searchParams);
  if (!linked) return { title: feed.title };
  const title = linked.kind === "post" ? linked.caption || feed.title : linked.name;
  const description = linked.kind === "post" ? linked.caption || linked.author.name : linked.shop.name;
  return { title, description, openGraph: { type: "video.other", title } };
}

/**
 * A video opened by link: a shared post (`?post=<id>`) or a product video (`?video=<id>`),
 * e.g. from a notification. The feed opens on it.
 */
async function linkedVideo({ post, video }: Params): Promise<FeedEntry | null> {
  if (isId(post)) return apiGet<FeedPostItem>(`/feed-posts/${post}`);
  if (isId(video)) {
    const item = await apiGet<FeedItem>(`/products/feed/${video}`);
    return item && { ...item, kind: "product" };
  }
  return null;
}

/** Feed: shops' product videos and customers' own videos, newest first, one per screen (§2.5). */
export default async function FeedPage({ searchParams }: PageProps<"/[lang]/feed">) {
  const locale = await getLocale();
  const { feed: dict, cartErrors } = await getDictionary();
  const params = await searchParams;
  const [first, linked] = await Promise.all([apiGet<FeedPage>(feedPath()), linkedVideo(params)]);
  const items = first?.items ?? [];
  // `&comment=<thread>[&reply=<id>]`: open its comments on that comment.
  const openComments = linked && isId(params.comment) ? { thread: params.comment, ...(isId(params.reply) && { reply: params.reply }) } : undefined;

  return (
    <FeedView
      key={`${linked?.id ?? "feed"}:${openComments?.reply ?? openComments?.thread ?? ""}`}
      locale={locale}
      dict={dict}
      cartErrors={cartErrors}
      initialItems={linked ? [linked, ...items.filter((i) => i.id !== linked.id)] : items}
      initialCursor={first?.nextCursor ?? null}
      openComments={openComments}
    />
  );
}
