import { API_URL } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

/**
 * Streams a customer's bank QR image from the API. The image lives in private
 * storage, so it is only reachable through the owner's session.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/bank-qr/[id]">) {
  const token = await getSessionToken();
  if (!token) return new Response(null, { status: 401 });
  const { id } = await params;

  const res = await fetch(`${API_URL}/me/bank-accounts/${encodeURIComponent(id)}/qr`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok || !res.body) return new Response(null, { status: res.status === 401 ? 401 : 404 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
