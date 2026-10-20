import { API_URL } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The signed-in customer's live events (order updates, shop replies…), passed through from the
 * API's event stream with the session token, which the browser can't read (httpOnly cookie).
 */
export async function GET(req: Request) {
  const token = await getSessionToken();
  if (!token) return new Response(null, { status: 401 });
  const upstream = await fetch(`${API_URL}/me/events`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    cache: "no-store",
    // Closing the page closes the API stream too.
    signal: req.signal,
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response(null, { status: upstream?.status ?? 502 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
