import { API_URL } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

/**
 * A customer's new feed video: streamed to the API as it arrives (videos can be up to
 * 200 MB, far over the Server Action limit), with the session token added.
 */
export async function POST(req: Request) {
  const token = await getSessionToken();
  if (!token) return Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data") || !req.body) {
    return Response.json({ code: "INVALID_VIDEO" }, { status: 400 });
  }
  const res = await fetch(`${API_URL}/me/feed-posts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: req.body,
    // Required to stream a request body with fetch.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const json = await res.json().catch(() => null);
  return Response.json(json, { status: res.status });
}
