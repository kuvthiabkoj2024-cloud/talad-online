"use server";

import { API_URL, apiGet, type ProductDetail, type VideoComment, type VideoCommentPage } from "./api";
import { getSessionToken } from "./session";

/** Feed-video engagement (views, shares, comments, favorites) and the Buy now options. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,120}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export type VideoActionError = "UNAUTHENTICATED" | "COMMENT_EMPTY" | "COMMENT_TOO_LONG" | "generic";
export type VideoResult<T> = ({ ok: true } & T) | { ok: false; error: VideoActionError };

async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  { auth, body }: { auth: boolean; body?: unknown },
): Promise<VideoResult<{ data: T }>> {
  const token = auth ? await getSessionToken() : null;
  if (auth && !token) return { ok: false, error: "UNAUTHENTICATED" };
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    if (res.status === 401) return { ok: false, error: "UNAUTHENTICATED" };
    const code = json?.code;
    return {
      ok: false,
      error: code === "COMMENT_EMPTY" || code === "COMMENT_TOO_LONG" ? code : "generic",
    };
  } catch {
    return { ok: false, error: "generic" };
  }
}

/** One play, reported after a few seconds of watching. Returns the new total. */
export async function recordVideoView(productId: string): Promise<number | null> {
  if (!isId(productId)) return null;
  const res = await call<{ views: number }>("POST", `/products/${productId}/video/views`, { auth: false });
  return res.ok ? res.data.views : null;
}

export async function recordVideoShare(productId: string): Promise<number | null> {
  if (!isId(productId)) return null;
  const res = await call<{ shares: number }>("POST", `/products/${productId}/video/shares`, { auth: false });
  return res.ok ? res.data.shares : null;
}

export async function loadVideoComments(productId: string, cursor?: string): Promise<VideoCommentPage | null> {
  if (!isId(productId) || (cursor !== undefined && !isId(cursor))) return null;
  return apiGet<VideoCommentPage>(`/products/${productId}/video/comments${cursor ? `?cursor=${cursor}` : ""}`);
}

export async function loadVideoReplies(
  productId: string,
  commentId: string,
  cursor?: string,
): Promise<VideoCommentPage | null> {
  if (!isId(productId) || !isId(commentId) || (cursor !== undefined && !isId(cursor))) return null;
  return apiGet<VideoCommentPage>(
    `/products/${productId}/video/comments/${commentId}/replies${cursor ? `?cursor=${cursor}` : ""}`,
  );
}

export async function postVideoComment(
  productId: string,
  body: string,
  parentId?: string,
): Promise<VideoResult<{ comment: VideoComment }>> {
  if (!isId(productId) || (parentId !== undefined && !isId(parentId)) || typeof body !== "string") {
    return { ok: false, error: "generic" };
  }
  const res = await call<VideoComment>("POST", `/me/videos/${productId}/comments`, {
    auth: true,
    body: { body, ...(parentId && { parentId }) },
  });
  return res.ok ? { ok: true, comment: res.data } : res;
}

export async function deleteVideoComment(commentId: string): Promise<VideoResult<object>> {
  if (!isId(commentId)) return { ok: false, error: "generic" };
  const res = await call<unknown>("DELETE", `/me/videos/comments/${commentId}`, { auth: true });
  return res.ok ? { ok: true } : res;
}

export async function setVideoFavorite(
  productId: string,
  on: boolean,
): Promise<VideoResult<{ favorited: boolean; favorites: number }>> {
  if (!isId(productId)) return { ok: false, error: "generic" };
  const res = await call<{ favorited: boolean; favorites: number }>(
    on ? "PUT" : "DELETE",
    `/me/favorites/${productId}`,
    { auth: true },
  );
  return res.ok ? { ok: true, ...res.data } : res;
}

/** Which of these feed videos the signed-in customer has favorited (empty when signed out). */
export async function favoritedVideos(productIds: string[]): Promise<string[]> {
  const ids = Array.isArray(productIds) ? productIds.filter(isId).slice(0, 50) : [];
  if (!ids.length || !(await getSessionToken())) return [];
  const res = await call<{ productIds: string[] }>("GET", `/me/favorites/status?ids=${ids.join(",")}`, { auth: true });
  return res.ok ? res.data.productIds : [];
}

/** Live options, prices and stock for the Buy now sheet. */
export async function loadBuyOptions(shopSlug: string, slug: string): Promise<ProductDetail | null> {
  if (!SLUG.test(shopSlug) || !SLUG.test(slug)) return null;
  return apiGet<ProductDetail>(`/products/${encodeURIComponent(shopSlug)}/${encodeURIComponent(slug)}`);
}
