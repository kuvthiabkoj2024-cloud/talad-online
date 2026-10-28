"use server";

import type { PointsView } from "./orders";
import { apiGetAsCustomer } from "./session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The next page of the signed-in customer's points history. */
export async function loadMorePoints(cursor: string): Promise<PointsView | null> {
  if (!UUID.test(cursor)) return null;
  return apiGetAsCustomer<PointsView>(`/me/points?cursor=${cursor}`);
}
