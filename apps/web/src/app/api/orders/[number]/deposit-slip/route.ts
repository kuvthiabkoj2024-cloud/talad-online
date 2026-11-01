import { proxyPrivateImage } from "@/lib/proxy-image";

/** The deposit slip the customer sent the shop for one of their orders. */
export async function GET(_req: Request, { params }: RouteContext<"/api/orders/[number]/deposit-slip">) {
  const { number } = await params;
  return proxyPrivateImage(`/me/orders/${encodeURIComponent(number)}/deposit-slip`);
}
