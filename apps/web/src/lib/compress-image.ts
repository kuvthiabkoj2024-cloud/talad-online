/**
 * Shrinks large photos in the browser before upload (phone photos are often 3–10 MB, over the
 * limits), so nobody has to resize a photo and pick it again. Small images are returned
 * unchanged. It keeps lowering the quality, then the size, until the photo fits `maxBytes`
 * (a few tries at most; `once` makes a single pass, e.g. for thumbnails). PNG/WebP pictures
 * keep their transparency where the browser can write WebP; otherwise transparent parts turn
 * white (not black).
 */
export async function compressImage(
  file: File,
  { maxSide = 1600, maxBytes = 1.5 * 1024 * 1024, once = false }: { maxSide?: number; maxBytes?: number; once?: boolean } = {},
): Promise<File> {
  if (file.size <= maxBytes) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const mayHaveAlpha = file.type === "image/png" || file.type === "image/webp";
    let side = Math.min(maxSide, Math.max(bitmap.width, bitmap.height));
    let best: Blob | null = null;
    for (let attempt = 0; attempt < (once ? 1 : 6); attempt++) {
      // Quality first (0.85 → 0.75 → 0.65), then a smaller picture each time.
      const quality = [0.85, 0.75, 0.65][Math.min(attempt, 2)];
      if (attempt >= 3) side = Math.round(side * 0.8);
      const blob = await encode(bitmap, side, quality, mayHaveAlpha);
      if (blob && (!best || blob.size < best.size)) best = blob;
      if (best && best.size <= maxBytes) break;
    }
    bitmap.close();
    if (!best || best.size >= file.size) return file;
    const ext = best.type === "image/webp" ? ".webp" : ".jpg";
    return new File([best], file.name.replace(/\.\w+$/, "") + ext, { type: best.type });
  } catch {
    return file; // unsupported format in this browser: let the server decide
  }
}

async function encode(bitmap: ImageBitmap, side: number, quality: number, keepAlpha: boolean): Promise<Blob | null> {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (keepAlpha) {
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const webp = await toBlob("image/webp");
    if (webp?.type === "image/webp") return webp; // Safari can't write WebP (it hands back a PNG)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return toBlob("image/jpeg");
}
