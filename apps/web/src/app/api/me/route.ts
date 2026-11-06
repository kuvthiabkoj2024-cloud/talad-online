import { apiGetAsCustomer, getCurrentCustomer } from "@/lib/session";

/**
 * The signed-in customer, cart count and unread notifications and chat messages for client components (header, app icon badge). Keeping
 * this out of the layout lets product pages stay statically cached.
 */
export async function GET() {
  const customer = await getCurrentCustomer();
  const [cart, unread, chats] = customer
    ? await Promise.all([
        apiGetAsCustomer<{ count: number }>("/me/cart/count"),
        apiGetAsCustomer<{ count: number }>("/me/notifications/unread-count"),
        apiGetAsCustomer<{ count: number }>("/me/conversations/unread-count").catch(() => null),
      ])
    : [null, null, null];
  return Response.json(
    { customer, cartCount: cart?.count ?? 0, notificationCount: unread?.count ?? 0, messageCount: chats?.count ?? 0 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
