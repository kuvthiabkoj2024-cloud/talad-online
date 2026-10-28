import { proxyPrivateImage } from "@/lib/proxy-image";

/** Taladonline's receiving QR for transfers (checkout, unpaid orders). `?download=1` saves it as a file. */
export async function GET(req: Request) {
  const download = new URL(req.url).searchParams.has("download") ? "taladonline-payment-qr" : undefined;
  return proxyPrivateImage("/me/checkout/payment-qr", download);
}
