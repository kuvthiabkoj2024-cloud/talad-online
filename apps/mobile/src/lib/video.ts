import type { Locale } from '@talad/shared';

import { filePart, postForm, SITE_URL, type FeedEntry } from './api';

/**
 * The feed's social side (§2.5), as on the website (apps/web/src/lib/video-actions.ts): views,
 * likes on customer videos, favourites on product videos, comments with replies, shares and
 * follows. Product videos are keyed by the product id, customer videos by the post id.
 */

export interface VideoComment {
  id: string;
  parentId: string | null;
  /** Null once deleted (kept while it still has replies). */
  body: string | null;
  createdAt: string;
  replyCount: number;
  /** `isShop`: the shop answering (its name and logo). */
  author: { id: string; name: string; avatarUrl: string | null; avatarVersion?: string | null; isShop: boolean };
}

export interface VideoCommentPage {
  items: VideoComment[];
  nextCursor: string | null;
}

export type CommentTarget = { kind: 'product' | 'post'; id: string };

export const targetOf = (item: FeedEntry): CommentTarget => ({ kind: item.kind === 'post' ? 'post' : 'product', id: item.id });

/** Where a video's comments are read, and written. */
export const commentsPath = (t: CommentTarget) => (t.kind === 'product' ? `/products/${t.id}/video/comments` : `/feed-posts/${t.id}/comments`);
export const postCommentPath = (t: CommentTarget) => (t.kind === 'product' ? `/me/videos/${t.id}/comments` : `/me/feed-posts/${t.id}/comments`);
/** Product video comments and customer post comments are deleted at the same place. */
export const deleteCommentPath = (commentId: string) => `/me/videos/comments/${commentId}`;

/** View and share counters (no sign-in needed). */
export const viewPath = (t: CommentTarget) => (t.kind === 'product' ? `/products/${t.id}/video/views` : `/feed-posts/${t.id}/views`);
export const sharePath = (t: CommentTarget) => (t.kind === 'product' ? `/products/${t.id}/video/shares` : `/feed-posts/${t.id}/shares`);

/** The page a share opens: the product, or the post in the website's feed. */
export function shareUrl(item: FeedEntry, locale: Locale): string {
  return item.kind === 'post' ? `${SITE_URL}/${locale}/feed?post=${item.id}` : `${SITE_URL}/${locale}/p/${item.shop.slug}/${item.slug}`;
}

/** Wait this long on a video before it counts as a view (the website's VIEW_AFTER_MS). */
export const VIEW_AFTER_MS = 2500;

/** A multipart upload that reports progress (0–1): a posted video can take a while. */
export async function uploadWithProgress<T>(
  path: string,
  fields: Record<string, string>,
  file: { uri: string; name: string; type: string },
  onProgress: (fraction: number) => void,
): Promise<T> {
  const form = new FormData();
  form.append('file', await filePart({ uri: file.uri, fileName: file.name, mimeType: file.type }, 'video.mp4'));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return postForm<T>(path, form, onProgress);
}
