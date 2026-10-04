import "server-only";

import { API_URL } from "./api";
import { getSessionToken } from "./session";

/**
 * Streams a private image (payment QR, transfer slip) from the API using the
 * customer's session. `download` asks the browser to save it instead of showing it.
 */
export async function proxyPrivateImage(apiPath: string, download?: string): Promise<Response> {
  const token = await getSessionToken();
  if (!token) return new Response(null, { status: 401 });
  const res = await fetch(`${API_URL}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok || !res.body) return new Response(null, { status: res.status === 401 ? 401 : 404 });

  const type = res.headers.get("Content-Type") ?? "application/octet-stream";
  const ext = type.split("/")[1] ?? "png";
  return new Response(res.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(download && { "Content-Disposition": `attachment; filename="${download}.${ext}"` }),
    },
  });
}
