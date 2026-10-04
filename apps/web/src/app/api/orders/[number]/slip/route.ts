import { proxyPrivateImage } from "@/lib/proxy-image";

/** The transfer slip the customer uploaded for one of their orders. */
export async function GET(_req: Request, { params }: RouteContext<"/api/orders/[number]/slip">) {
  const { number } = await params;
  return proxyPrivateImage(`/me/orders/${encodeURIComponent(number)}/payment-slip`);
}
