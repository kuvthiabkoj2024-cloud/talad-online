import { Package } from "lucide-react";
import { ProductImage } from "../product-image";

export function OrderThumb({ src, size = "md" }: { src: string | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-14" : "size-16 sm:size-20";
  return (
    <span className={`${box} relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground/50 ring-1 ring-border`}>
      {src ? (
        <ProductImage src={src} alt="" sizes="80px" className="object-cover" />
      ) : (
        <Package className="size-6" strokeWidth={1.5} />
      )}
    </span>
  );
}
