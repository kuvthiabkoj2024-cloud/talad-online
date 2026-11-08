"use server";

import type { DeliveryDistance } from "@talad/shared";
import { apiGetAsCustomer } from "./session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * How far the signed-in customer's default address is from a shop offering free delivery
 * nearby (only km — the shop's pin stays on the server). Null when signed out.
 */
export async function deliveryDistance(shopId: string): Promise<DeliveryDistance | null> {
  if (!UUID.test(shopId)) return null;
  return apiGetAsCustomer<DeliveryDistance>(`/me/addresses/distance/${shopId}`);
}
