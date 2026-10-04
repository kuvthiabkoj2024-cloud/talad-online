"use client";

import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { useRef, useState } from "react";
import { ProductImage } from "../product-image";

/**
 * Image gallery: a scroll-snap track (native swipe on touch devices) with
 * prev/next buttons, an "n / total" counter and a thumbnail strip.
 */
export function ProductGallery({
  images,
  alt,
  labels,
}: {
  images: string[];
  alt: string;
  labels: { image: string; prev: string; next: string };
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-muted text-muted-foreground/50">
        <Package className="size-24" strokeWidth={1} />
      </div>
    );
  }

  function goTo(i: number) {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(images.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  }

  function onScroll() {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative overflow-hidden rounded-xl bg-muted">
        <div
          ref={track}
          onScroll={onScroll}
          className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto"
        >
          {images.map((src, i) => (
            <div key={src} className="relative size-full shrink-0 snap-center">
              <ProductImage
                src={src}
                alt={i === 0 ? alt : `${alt} (${i + 1})`}
                // The first photo is the page's main image (LCP): fetch it right away.
                {...(i === 0 ? { preload: true } : {})}
                sizes="(min-width: 1280px) 560px, (min-width: 768px) 50vw, 100vw"
                className="object-contain"
              />
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <GalleryArrow side="left" label={labels.prev} disabled={index === 0} onClick={() => goTo(index - 1)} />
            <GalleryArrow side="right" label={labels.next} disabled={index === images.length - 1} onClick={() => goTo(index + 1)} />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white tabular-nums">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <ul className="no-scrollbar flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                aria-label={`${labels.image} ${i + 1}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className={`relative block size-16 overflow-hidden rounded-lg border-2 sm:size-20 ${
                  i === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <ProductImage src={src} alt="" sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GalleryArrow({
  side,
  label,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`absolute top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow transition-opacity group-hover:opacity-100 disabled:hidden sm:flex sm:opacity-0 ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <Icon className="size-5" />
    </button>
  );
}
