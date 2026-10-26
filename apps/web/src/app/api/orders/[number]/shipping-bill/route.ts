import { proxyPrivateImage } from "@/lib/proxy-image";

/** The courier's bill the shop photographed when it shipped one of the customer's orders. */
export async function GET(_req: Request, { params }: RouteContext<"/api/orders/[number]/shipping-bill">) {
  const { number } = await params;
  return proxyPrivateImage(`/me/orders/${encodeURIComponent(number)}/shipping-bill`);
}
