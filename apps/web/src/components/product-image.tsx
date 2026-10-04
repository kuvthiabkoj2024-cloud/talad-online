import Image, { type ImageProps } from "next/image";
import { OPTIMIZED_IMAGE_HOSTS } from "@/lib/image-hosts";

function optimizable(src: string): boolean {
  try {
    return OPTIMIZED_IMAGE_HOSTS.includes(new URL(src).hostname);
  } catch {
    // Relative URLs are our own auth-gated routes; the optimizer can't fetch those with cookies.
    return false;
  }
}

/**
 * Fills its (relatively positioned, sized) parent. Known catalog hosts are resized to
 * `sizes` and re-encoded, so a card thumbnail is ~20 KB instead of a full-size photo.
 */
export function ProductImage({ src, alt, ...rest }: Omit<ImageProps, "src" | "fill"> & { src: string }) {
  return <Image src={src} alt={alt} fill unoptimized={!optimizable(src)} {...rest} />;
}
