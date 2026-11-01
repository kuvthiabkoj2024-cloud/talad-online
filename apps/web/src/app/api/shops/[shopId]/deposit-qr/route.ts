import { proxyPrivateImage } from "@/lib/proxy-image";

/** The QR a shop takes deposits on (checkout, a rejected slip). `?download=1` saves it as a file. */
export async function GET(req: Request, { params }: RouteContext<"/api/shops/[shopId]/deposit-qr">) {
  const { shopId } = await params;
  const download = new URL(req.url).searchParams.has("download") ? "shop-payment-qr" : undefined;
  return proxyPrivateImage(`/me/checkout/shops/${encodeURIComponent(shopId)}/deposit-qr`, download);
}
