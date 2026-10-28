"use server";

import { apiGet, type ProfileFollowerPage, type ProfileVideoPage } from "./api";

/** "Show more" on a customer's profile: their next videos or followers. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const valid = (id: string, cursor?: string) => UUID.test(id) && (cursor === undefined || UUID.test(cursor));

export async function loadProfileVideos(customerId: string, cursor?: string): Promise<ProfileVideoPage | null> {
  if (!valid(customerId, cursor)) return null;
  return apiGet<ProfileVideoPage>(`/profiles/${customerId}/videos?limit=18${cursor ? `&cursor=${cursor}` : ""}`);
}

export async function loadProfileFollowers(customerId: string, cursor?: string): Promise<ProfileFollowerPage | null> {
  if (!valid(customerId, cursor)) return null;
  return apiGet<ProfileFollowerPage>(`/profiles/${customerId}/followers?limit=20${cursor ? `&cursor=${cursor}` : ""}`);
}
