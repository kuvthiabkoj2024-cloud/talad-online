import { API_URL } from "@/lib/api";

/** Public profile photos, proxied from the API. URLs are versioned (?v=), so cache for long. */
export async function GET(_req: Request, { params }: RouteContext<"/api/avatars/[id]">) {
  const { id } = await params;
  const res = await fetch(`${API_URL}/avatars/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok || !res.body) return new Response(null, { status: 404 });

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
