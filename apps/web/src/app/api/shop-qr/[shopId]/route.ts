import { proxyPrivateImage } from "@/lib/proxy-image";

/** A shop's payment QR for checkout. `?download=1` saves it as a file. */
export async function GET(req: Request, { params }: RouteContext<"/api/shop-qr/[shopId]">) {
  const { shopId } = await params;
  const download = new URL(req.url).searchParams.has("download") ? "payment-qr" : undefined;
  return proxyPrivateImage(`/me/checkout/shops/${encodeURIComponent(shopId)}/payment-qr`, download);
}
