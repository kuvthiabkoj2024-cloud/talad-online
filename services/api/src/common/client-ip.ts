import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * The storefront's server calls the API on shoppers' behalf (server actions), so every such
 * request comes from the server's own address. It proves it is ours with `X-Internal-Key`
 * (INTERNAL_API_KEY on both) and says who it's acting for in `X-Client-IP` / `X-Client-User-Agent`.
 * Anyone else sending those headers is ignored.
 */
export function fromInternalServer(req: Pick<Request, 'headers'>): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  const given = req.headers['x-internal-key'];
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The visitor's IP: forwarded by our storefront server, else the connection's (`trust proxy`
 * resolves nginx's X-Forwarded-For). Null for our server acting for no visitor (cached pages).
 */
export function clientIp(req: Pick<Request, 'headers' | 'ip'>): string | null {
  if (fromInternalServer(req)) {
    const ip = req.headers['x-client-ip'];
    return typeof ip === 'string' && isIP(ip.trim()) ? ip.trim() : null;
  }
  return req.ip ?? null;
}

/** IP and browser for session logs (§ login history). */
export function clientInfo(req: Request): { ip: string | undefined; userAgent: string | undefined } {
  const forwardedAgent = fromInternalServer(req) ? req.headers['x-client-user-agent'] : undefined;
  return {
    ip: clientIp(req) ?? undefined,
    userAgent: (typeof forwardedAgent === 'string' ? forwardedAgent : undefined) ?? req.headers['user-agent'],
  };
}
