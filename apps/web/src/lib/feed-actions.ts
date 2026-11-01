"use server";

import { apiGet, feedPath, type FeedPage, type FeedType } from "./api";

/** Next page of the video feed for infinite scroll. Public data; the API re-validates the cursor. */
export async function loadFeed(type: FeedType, cursor: string): Promise<FeedPage | null> {
  if (typeof cursor !== "string" || cursor.length > 64 || (type !== "shop" && type !== "customer")) return null;
  return apiGet<FeedPage>(feedPath(type, cursor));
}
