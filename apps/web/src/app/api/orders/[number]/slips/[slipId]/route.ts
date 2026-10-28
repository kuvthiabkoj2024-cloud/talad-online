import { proxyPrivateImage } from "@/lib/proxy-image";

/** One of the transfer slips the customer sent for this order. */
export async function GET(_req: Request, { params }: RouteContext<"/api/orders/[number]/slips/[slipId]">) {
  const { number, slipId } = await params;
  return proxyPrivateImage(`/me/orders/${encodeURIComponent(number)}/payment-slips/${encodeURIComponent(slipId)}`);
}
