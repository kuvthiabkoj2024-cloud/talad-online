"use client";

import { ChevronLeft, ChevronRight, Package, Play, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProductImage } from "../product-image";

type Slide = { kind: "video"; src: string } | { kind: "image"; src: string };

/**
 * Product media: the video first (playing on its own with sound when the browser allows it,
 * looping), then the photos.
 * A scroll-snap track (native swipe on touch devices) with prev/next buttons, an
 * "n / total" counter and a thumbnail strip. The video pauses while another slide shows.
 */
export function ProductGallery({
  images,
  videoUrl,
  alt,
  labels,
}: {
  images: string[];
  videoUrl?: string | null;
  alt: string;
  labels: { image: string; prev: string; next: string; video: string; soundOn: string; soundOff: string };
}) {
  const track = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  // Sound on by default. Browsers only allow that once the visitor has interacted with the
  // site (e.g. tapped a product to get here); otherwise it starts muted and the first tap
  // anywhere on the page turns the sound on (see below).
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const slides: Slide[] = [
    ...(videoUrl ? [{ kind: "video" as const, src: videoUrl }] : []),
    ...images.map((src) => ({ kind: "image" as const, src })),
  ];

  // Play while the video slide is showing, pause when the shopper swipes to a photo.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (index !== 0) {
      v.pause();
      return;
    }
    v.muted = muted;
    v.play().catch(() => {
      // Sound not allowed yet: play muted for now.
      v.muted = true;
      setMuted(true);
      setBlocked(true);
      void v.play().catch(() => {});
    });
  }, [index, muted]);

  // After a blocked start, the first tap or key press anywhere turns the sound on (it counts
  // as permission). A tap on the sound button itself is left to that button.
  useEffect(() => {
    if (!blocked) return;
    const unmute = (e: Event) => {
      setBlocked(false);
      if ((e.target as Element | null)?.closest?.("[data-sound-toggle]")) return;
      const v = video.current;
      if (v) v.muted = false;
      setMuted(false);
    };
    document.addEventListener("pointerdown", unmute, { once: true, capture: true });
    document.addEventListener("keydown", unmute, { once: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", unmute, { capture: true });
      document.removeEventListener("keydown", unmute, { capture: true });
    };
  }, [blocked]);

  if (slides.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-muted text-muted-foreground/50">
        <Package className="size-24" strokeWidth={1} />
      </div>
    );
  }

  function goTo(i: number) {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(slides.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  }

  function onScroll() {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  // With a video, the first photo is its poster and the photo numbering starts after it.
  const imageAlt = (i: number) => (i === 0 && !videoUrl ? alt : `${alt} (${i + 1})`);

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative overflow-hidden rounded-xl bg-muted">
        <div
          ref={track}
          onScroll={onScroll}
          className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto"
        >
          {slides.map((slide, i) =>
            slide.kind === "video" ? (
              <div key={slide.src} className="relative size-full shrink-0 snap-center bg-black">
                <video
                  ref={video}
                  src={slide.src}
                  poster={images[0]}
                  aria-label={`${alt} · ${labels.video}`}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  className="size-full object-contain"
                />
                <button
                  type="button"
                  data-sound-toggle
                  onClick={() => {
                    setBlocked(false);
                    setMuted((m) => !m);
                  }}
                  aria-label={muted ? labels.soundOn : labels.soundOff}
                  className="absolute bottom-3 left-3 flex size-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70"
                >
                  {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                </button>
              </div>
            ) : (
              <div key={slide.src} className="relative size-full shrink-0 snap-center">
                <ProductImage
                  src={slide.src}
                  alt={imageAlt(i - (videoUrl ? 1 : 0))}
                  // The first slide is the page's main image (LCP): fetch it right away.
                  {...(i === 0 ? { preload: true } : {})}
                  sizes="(min-width: 1280px) 560px, (min-width: 768px) 50vw, 100vw"
                  className="object-contain"
                />
              </div>
            ),
          )}
        </div>

        {slides.length > 1 && (
          <>
            <GalleryArrow side="left" label={labels.prev} disabled={index === 0} onClick={() => goTo(index - 1)} />
            <GalleryArrow side="right" label={labels.next} disabled={index === slides.length - 1} onClick={() => goTo(index + 1)} />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white tabular-nums">
              {index + 1} / {slides.length}
            </span>
          </>
        )}
      </div>

      {slides.length > 1 && (
        <ul className="no-scrollbar flex gap-2 overflow-x-auto">
          {slides.map((slide, i) => (
            <li key={slide.src} className="shrink-0">
              <button
                type="button"
                aria-label={slide.kind === "video" ? labels.video : `${labels.image} ${i + (videoUrl ? 0 : 1)}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className={`relative block size-16 overflow-hidden rounded-lg border-2 sm:size-20 ${
                  i === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {slide.kind === "video" ? (
                  <>
                    {images[0] ? (
                      <ProductImage src={images[0]} alt="" sizes="80px" className="object-cover" />
                    ) : (
                      <span className="absolute inset-0 bg-black" />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
                      <Play className="size-6 fill-current" />
                    </span>
                  </>
                ) : (
                  <ProductImage src={slide.src} alt="" sizes="80px" className="object-cover" />
                )}
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
