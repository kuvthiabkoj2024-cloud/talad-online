import sharp from "sharp";
import { API_URL } from "@/lib/api";
import { serverHeaders } from "@/lib/client-headers";
import { OG_HEIGHT, OG_WIDTH } from "@/lib/seo";

/** Hosts a share picture may come from: our media CDN and Google profile photos. Nothing else (no open proxy). */
function sourceUrl(src: string): string | null {
  // An uploaded profile photo: /api/avatars/<id>?v=…, read straight from the API.
  const avatar = /^\/api\/avatars\/([0-9a-f-]{36})(?:\?v=[\w-]+)?$/i.exec(src);
  if (avatar) return `${API_URL}/avatars/${avatar[1]}`;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const media = process.env.NEXT_PUBLIC_MEDIA_HOST;
  const allowed = (media && url.hostname === media) || url.hostname.endsWith(".googleusercontent.com");
  return allowed ? url.toString() : null;
}

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * A link-preview picture (og:image) for WhatsApp, Messenger and Facebook: the photo fitted into
 * 1200×630 over a blurred copy of itself, as a small JPEG. Shop photos are often several MB,
 * and WhatsApp skips previews with big pictures.
 */
export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src") ?? "";
  const from = sourceUrl(src);
  if (!from) return new Response(null, { status: 400 });

  try {
    const res = await fetch(from, { headers: from.startsWith(API_URL) ? serverHeaders() : undefined, signal: AbortSignal.timeout(10_000) });
    const size = Number(res.headers.get("content-length") ?? 0);
    if (!res.ok || size > MAX_BYTES) return new Response(null, { status: 404 });
    const input = Buffer.from(await res.arrayBuffer());
    if (input.length > MAX_BYTES) return new Response(null, { status: 404 });

    const photo = sharp(input, { failOn: "none" }).rotate();
    const [background, front] = await Promise.all([
      photo.clone().resize(OG_WIDTH, OG_HEIGHT, { fit: "cover" }).blur(40).modulate({ brightness: 0.85 }).toBuffer(),
      photo.clone().resize(OG_WIDTH, OG_HEIGHT, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
    ]);
    const jpeg = await sharp(background).composite([{ input: front }]).jpeg({ quality: 80, mozjpeg: true }).toBuffer();

    return new Response(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        // Photo URLs change when the photo does, so the picture can be cached for long.
        "Cache-Control": "public, max-age=604800, s-maxage=2592000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
