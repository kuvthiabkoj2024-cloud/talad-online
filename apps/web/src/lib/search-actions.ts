"use server";

import { API_URL, type ProductCard } from "./api";

export interface PhotoMatch extends ProductCard {
  match: { score: number; by: "visual" | "keyword" | "both"; strong: boolean };
}

/** Mirrors `PhotoSearchResult` from services/api catalog/image-search. */
export interface PhotoSearchResult {
  /** Products that match the photo. */
  items: PhotoMatch[];
  /** Related products (e.g. cat food for a cat photo), shown in their own section. */
  related: PhotoMatch[];
  label: string | null;
  keywords: string[];
  category: string | null;
  engines: { visual: boolean; ai: boolean };
}

export type PhotoSearchError = "INVALID_IMAGE" | "FILE_TOO_LARGE" | "IMAGE_SEARCH_UNAVAILABLE" | "THROTTLED" | "generic";

/** "Scan to search": forwards the (already downsized) photo to the API. Guests can use it. */
export async function searchByPhoto(form: FormData): Promise<{ ok: true; result: PhotoSearchResult } | { ok: false; error: PhotoSearchError }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "INVALID_IMAGE" };
  const body = new FormData();
  body.set("file", file, file.name || "photo.jpg");
  try {
    const res = await fetch(`${API_URL}/products/search/image`, { method: "POST", body, cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, result: json as PhotoSearchResult };
    if (res.status === 429) return { ok: false, error: "THROTTLED" };
    const code = json?.code as PhotoSearchError | undefined;
    return { ok: false, error: code && ["INVALID_IMAGE", "FILE_TOO_LARGE", "IMAGE_SEARCH_UNAVAILABLE"].includes(code) ? code : "generic" };
  } catch {
    return { ok: false, error: "generic" };
  }
}
