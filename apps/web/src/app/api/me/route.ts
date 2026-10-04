import { apiGetAsCustomer, getCurrentCustomer } from "@/lib/session";

/**
 * The signed-in customer and cart count for client components (header). Keeping
 * this out of the layout lets product pages stay statically cached.
 */
export async function GET() {
  const customer = await getCurrentCustomer();
  const cart = customer ? await apiGetAsCustomer<{ count: number }>("/me/cart/count") : null;
  return Response.json(
    { customer, cartCount: cart?.count ?? 0 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
