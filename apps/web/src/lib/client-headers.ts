import "server-only";

import { headers } from "next/headers";

/**
 * Headers for this server's calls to the API. The API sees all of them coming from this server,
 * so it's told which shopper each is for (nginx sets X-Real-IP), proven with INTERNAL_API_KEY.
 * Rate limits and robot checks are then per shopper, not shared by the whole site.
 * Empty without the key (local development: the API then sees localhost, which is fine).
 */
export async function clientHeaders(): Promise<Record<string, string>> {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return {};
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const agent = h.get("user-agent");
  return {
    "X-Internal-Key": key,
    ...(ip && { "X-Client-IP": ip }),
    ...(agent && { "X-Client-User-Agent": agent.slice(0, 500) }),
  };
}

/**
 * For cached public reads (product pages, listings) that serve every visitor: marks them as
 * this server's own, which the API doesn't rate-limit. Reading request headers here would
 * stop those pages from being cached.
 */
export function serverHeaders(): Record<string, string> {
  const key = process.env.INTERNAL_API_KEY;
  return key ? { "X-Internal-Key": key } : {};
}
