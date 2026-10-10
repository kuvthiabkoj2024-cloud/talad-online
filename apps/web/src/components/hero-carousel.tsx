"use client";

import { CreditCard, ShoppingBag, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Slide {
  title: string;
  subtitle: string;
}

/** An admin-managed banner (§2.8), already localized; `href` is a full storefront path. */
export interface BannerSlide {
  id: string;
  title: string;
  imageUrl: string;
  href: string | null;
}

// Built-in promo slides, shown when no admin banner is running.
const DECOR: { icon: LucideIcon; className: string }[] = [
  { icon: Truck, className: "from-[#43a047] via-[#2e7d32] to-[#1b5e20]" },
  { icon: ShoppingBag, className: "from-[#388e3c] via-[#2e7d32] to-[#14471a]" },
  { icon: CreditCard, className: "from-[#4caf50] via-[#388e3c] to-[#1b5e20]" },
];

const INTERVAL_MS = 5000;

export function HeroCarousel({
  slides,
  banners = [],
  slideLabel,
}: {
  slides: Slide[];
  banners?: BannerSlide[];
  slideLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length || slides.length;

  useEffect(() => {
    if (paused || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, count]);

  return (
    <section
      aria-roledescription="carousel"
      className="relative h-48 overflow-hidden rounded-2xl sm:h-64 lg:h-full lg:min-h-80"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {banners.map((b, i) => {
        const image = (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded banner from the media CDN
          <img src={b.imageUrl} alt={b.title} className="size-full object-cover" />
        );
        return (
          <div
            key={b.id}
            aria-roledescription="slide"
            aria-label={`${slideLabel} ${i + 1} / ${count}`}
            aria-hidden={i !== index}
            className={`absolute inset-0 bg-muted transition-opacity duration-700 ${i === index ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            {b.href ? (
              <Link href={b.href} tabIndex={i === index ? 0 : -1} className="block size-full">
                {image}
              </Link>
            ) : (
              image
            )}
          </div>
        );
      })}

      {banners.length === 0 && slides.map((slide, i) => {
        const { icon: Icon, className } = DECOR[i % DECOR.length];
        return (
          <div
            key={slide.title}
            aria-roledescription="slide"
            aria-label={`${slideLabel} ${i + 1} / ${slides.length}`}
            aria-hidden={i !== index}
            className={`absolute inset-0 flex items-center bg-gradient-to-br px-8 text-white transition-opacity duration-700 sm:px-14 ${className} ${
              i === index ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="relative z-10 max-w-[60%]">
              <p className="text-2xl font-extrabold leading-tight drop-shadow-sm sm:text-4xl lg:text-5xl">
                {slide.title}
              </p>
              <p className="mt-3 text-sm text-white/85 sm:text-lg">{slide.subtitle}</p>
            </div>
            <Icon
              aria-hidden
              strokeWidth={1.25}
              className="absolute -bottom-6 right-4 size-44 text-white/20 sm:right-12 sm:size-64 lg:size-72"
            />
          </div>
        );
      })}

      <div className={`absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2 ${count < 2 ? "hidden" : ""}`}>
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${slideLabel} ${i + 1}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
