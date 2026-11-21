import type { Metadata } from "next";
import { FeedView } from "@/components/feed/feed-view";
import { apiGet, feedPath, feedQuery, type FeedEntry, type FeedItem, type FeedPage, type FeedPostItem, type FeedType } from "@/lib/api";
import { formatMoney } from "@talad/shared";
import { avatarSrc } from "@/lib/customer";
import { interpolate } from "@/lib/format";
import { metaDescription, pageAlternates, shareMetadata } from "@/lib/seo";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

// New videos show up within a minute; later pages are always fetched live.
export const revalidate = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

type Params = Awaited<PageProps<"/[lang]/feed">["searchParams"]>;

export async function generateMetadata({ searchParams }: PageProps<"/[lang]/feed">): Promise<Metadata> {
  const { feed, meta } = await getDictionary();
  const lang = await getLocale();
  const linked = await linkedVideo(await searchParams);
  if (!linked) return { title: feed.title, alternates: pageAlternates(lang, "/feed") };
  // A shared video: the caption (or product) as the title, the poster or product photo as the picture.
  const share =
    linked.kind === "post"
      ? {
          path: `/feed?post=${linked.id}`,
          title: firstLine(linked.caption) || interpolate(meta.share.video, { name: linked.author.name }),
          description: metaDescription(linked.caption, interpolate(meta.share.video, { name: linked.author.name })),
          image: avatarSrc(linked.author),
        }
      : {
          path: `/feed?video=${linked.id}`,
          title: linked.name,
          description: metaDescription(formatMoney(linked.price, lang), interpolate(meta.share.productVideo, { name: linked.name, shop: linked.shop.name })),
          image: linked.imageUrl ?? linked.shop.logoUrl,
        };
  const metadata = shareMetadata({ lang, ...share, type: "video.other" });
  return {
    ...metadata,
    title: { absolute: `${share.title} · ${feed.title} · MC Mart` },
    // The video itself, for apps that play it inside the preview.
    openGraph: { ...metadata.openGraph, videos: [{ url: linked.videoUrl, type: "video/mp4", width: 720, height: 1280 }] },
  };
}

/** A caption's first line, short enough for a title. */
const firstLine = (text: string) => {
  const line = text.split("\n")[0]?.trim() ?? "";
  return line.length > 70 ? `${line.slice(0, 67).trimEnd()}…` : line;
};

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

/**
 * Feed: shops' product videos or customers' own videos (`?type=customer`), newest first, one per
 * screen (§2.5). A linked video opens the tab it belongs to. `?q=` searches the tab's videos by
 * title, caption and #hashtags, shop, brand or poster.
 */
export default async function FeedPage({ searchParams }: PageProps<"/[lang]/feed">) {
  const locale = await getLocale();
  const { feed: dict, cartErrors } = await getDictionary();
  const params = await searchParams;
  const linked = await linkedVideo(params);
  const type: FeedType = (linked ? linked.kind === "post" : params.type === "customer") ? "customer" : "shop";
  const q = linked ? "" : feedQuery(params.q);
  const first = await apiGet<FeedPage>(feedPath(type, undefined, q || undefined));
  const items = first?.items ?? [];
  // `&comment=<thread>[&reply=<id>]`: open its comments on that comment.
  const openComments = linked && isId(params.comment) ? { thread: params.comment, ...(isId(params.reply) && { reply: params.reply }) } : undefined;

  return (
    <FeedView
      key={`${type}:${q}:${linked?.id ?? "feed"}:${openComments?.reply ?? openComments?.thread ?? ""}`}
      locale={locale}
      type={type}
      q={q}
      dict={dict}
      cartErrors={cartErrors}
      initialItems={linked ? [linked, ...items.filter((i) => i.id !== linked.id)] : items}
      initialCursor={first?.nextCursor ?? null}
      openComments={openComments}
      backHref={linked && isId(params.back) ? `/${locale}/u/${params.back}${params.tab === "liked" ? "?tab=liked" : ""}` : undefined}
    />
  );
}
