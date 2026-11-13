import type { Locale } from '@talad/shared';

import { API_URL, ApiError, getApiToken, SITE_URL, type FeedEntry } from './api';

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
  author: { id: string; name: string; avatarUrl: string | null; isShop: boolean };
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

/**
 * A multipart upload that reports progress (0–1): a posted video can take a while.
 * React Native's FormData takes { uri, name, type } for files.
 */
export function uploadWithProgress<T>(
  path: string,
  fields: Record<string, string>,
  file: { uri: string; name: string; type: string },
  onProgress: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file as unknown as Blob);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    const token = getApiToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError(0, { code: 'NETWORK', message: 'Network error' }));
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText || '{}');
      } catch {
        // Not JSON (e.g. a proxy's 413 page).
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, xhr.status === 413 ? { code: 'FILE_TOO_LARGE' } : body));
    };
    xhr.send(form);
  });
}
