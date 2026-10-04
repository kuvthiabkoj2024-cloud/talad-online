import { proxyPrivateImage } from "@/lib/proxy-image";

/** Payment QR of the shop behind one of the customer's orders. */
export async function GET(req: Request, { params }: RouteContext<"/api/orders/[number]/qr">) {
  const { number } = await params;
  const download = new URL(req.url).searchParams.has("download") ? `payment-qr-${number}` : undefined;
  return proxyPrivateImage(`/me/orders/${encodeURIComponent(number)}/payment-qr`, download);
}
