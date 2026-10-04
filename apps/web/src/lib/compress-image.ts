/**
 * Shrinks large photos in the browser before upload (phone camera slips are often
 * 3–5 MB, over the 2 MB limit). Small images are returned unchanged.
 */
export async function compressImage(file: File, { maxSide = 1600, maxBytes = 1.5 * 1024 * 1024 } = {}): Promise<File> {
  if (file.size <= maxBytes) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // unsupported format in this browser: let the server decide
  }
}
