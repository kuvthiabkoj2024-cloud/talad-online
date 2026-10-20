import { proxyPrivateImage } from "@/lib/proxy-image";

/** A photo in one of the customer's private chats with a shop (only its two sides can load it). */
export async function GET(_req: Request, { params }: RouteContext<"/api/messages/[conv]/[msg]">) {
  const { conv, msg } = await params;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(conv) || !uuid.test(msg)) return new Response(null, { status: 404 });
  return proxyPrivateImage(`/me/conversations/${conv}/messages/${msg}/photo`);
}
