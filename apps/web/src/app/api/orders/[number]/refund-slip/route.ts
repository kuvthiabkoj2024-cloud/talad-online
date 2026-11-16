import { proxyPrivateImage } from "@/lib/proxy-image";

/** MC Mart's refund transfer slip for one of the customer's cancelled orders. */
export async function GET(_req: Request, { params }: RouteContext<"/api/orders/[number]/refund-slip">) {
  const { number } = await params;
  return proxyPrivateImage(`/me/orders/${encodeURIComponent(number)}/refund-slip`);
}
