import { API_URL } from "@/lib/api";
import { clientHeaders } from "@/lib/client-headers";
import { getSessionToken } from "@/lib/session";

/**
 * One photo or video clip for a return request: streamed to the API as it arrives (clips can be
 * up to 90 MB, far over the Server Action limit), with the session token added.
 */
export async function POST(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const token = await getSessionToken();
  if (!token) return Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data") || !req.body) {
    return Response.json({ code: "INVALID_FILE" }, { status: 400 });
  }
  const { number } = await params;
  const res = await fetch(`${API_URL}/me/orders/${encodeURIComponent(number)}/return/evidence`, {
    method: "POST",
    headers: { ...(await clientHeaders()), Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: req.body,
    // Required to stream a request body with fetch.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const json = await res.json().catch(() => null);
  return Response.json(json, { status: res.status });
}
