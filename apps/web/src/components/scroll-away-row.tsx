"use client";

import { useEffect, useRef, useState } from "react";

/** Ignore tiny scroll jitter (and iOS rubber-banding) before changing direction. */
const MIN_DELTA = 8;

/**
 * A header row that slides up behind the row above it while the page scrolls down, and
 * back as soon as it scrolls up (or nears the top). It moves with a transform, so the
 * header keeps its height and the page never jumps. Stays put while focused (typing).
 */
export function ScrollAwayRow({
  className,
  children,
  ...rest
}: React.ComponentProps<"div"> & { className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - last;
      if (Math.abs(delta) < MIN_DELTA) return;
      last = y;
      const nearTop = y < (ref.current?.offsetHeight ?? 0) * 2;
      const typing = ref.current?.contains(document.activeElement) ?? false;
      setHidden(delta > 0 && !nearTop && !typing);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      {...rest}
      ref={ref}
      inert={hidden}
      className={`relative transition-transform duration-200 ease-out motion-reduce:transition-none ${
        hidden ? "pointer-events-none -translate-y-full" : "pointer-events-auto"
      } ${className}`}
    >
      {children}
    </div>
  );
}
