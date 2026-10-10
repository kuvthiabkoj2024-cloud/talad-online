"use server";

import { apiGet, feedPath, type FeedPage } from "./api";

/** Next page of the video feed for infinite scroll. Public data; the API re-validates the cursor. */
export async function loadFeed(cursor: string): Promise<FeedPage | null> {
  if (typeof cursor !== "string" || cursor.length > 64) return null;
  return apiGet<FeedPage>(feedPath(cursor));
}
