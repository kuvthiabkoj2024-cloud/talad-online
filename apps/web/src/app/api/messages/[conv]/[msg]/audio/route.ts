import { API_URL } from "@/lib/api";
import { clientHeaders } from "@/lib/client-headers";
import { getSessionToken } from "@/lib/session";

/**
 * A voice message in one of the customer's private chats (only its two sides can load it).
 * Answers byte ranges, which Safari needs to play (and seek) audio; recordings are small
 * (a minute at most), so the whole file is fetched and the asked-for part sent.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/messages/[conv]/[msg]/audio">) {
  const { conv, msg } = await params;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(conv) || !uuid.test(msg)) return new Response(null, { status: 404 });
  const token = await getSessionToken();
  if (!token) return new Response(null, { status: 401 });
  const res = await fetch(`${API_URL}/me/conversations/${conv}/messages/${msg}/audio`, { headers: { ...(await clientHeaders()), Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return new Response(null, { status: res.status === 401 ? 401 : 404 });

  const audio = new Uint8Array(await res.arrayBuffer());
  const headers = {
    "Content-Type": res.headers.get("Content-Type") ?? "audio/webm",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("Range") ?? "");
  if (!range) return new Response(audio, { headers: { ...headers, "Content-Length": String(audio.length) } });

  const size = audio.length;
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(audio.slice(start, end + 1), {
    status: 206,
    headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
  });
}
