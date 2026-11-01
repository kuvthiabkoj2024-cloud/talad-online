"use server";

import { apiGet, type LikedVideoPage, type ProfileFollowerPage, type ProfileVideoPage } from "./api";
import { apiGetAsCustomer } from "./session";

/** "Show more" on a customer's profile: their next videos, likes, followers or follows. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const valid = (id: string, cursor?: string) => UUID.test(id) && (cursor === undefined || UUID.test(cursor));

export async function loadProfileVideos(customerId: string, cursor?: string): Promise<ProfileVideoPage | null> {
  if (!valid(customerId, cursor)) return null;
  return apiGet<ProfileVideoPage>(`/profiles/${customerId}/videos?limit=18${cursor ? `&cursor=${cursor}` : ""}`);
}

export async function loadProfilePeople(list: "followers" | "following", customerId: string, cursor?: string): Promise<ProfileFollowerPage | null> {
  if (!valid(customerId, cursor)) return null;
  return apiGet<ProfileFollowerPage>(`/profiles/${customerId}/${list === "following" ? "following" : "followers"}?limit=20${cursor ? `&cursor=${cursor}` : ""}`);
}

/** The signed-in customer's own liked videos. */
export async function loadLikedVideos(cursor: string): Promise<LikedVideoPage | null> {
  if (!/^\d+\.[0-9a-f-]{36}$/i.test(cursor)) return null;
  return apiGetAsCustomer<LikedVideoPage>(`/me/liked-videos?limit=18&cursor=${cursor}`);
}
