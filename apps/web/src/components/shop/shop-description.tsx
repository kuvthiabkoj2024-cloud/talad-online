"use client";

import { useState } from "react";

/** Long shop descriptions are clamped to three lines with a toggle. */
export function ShopDescription({ text, labels }: { text: string; labels: { more: string; less: string } }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 180 || text.split("\n").length > 3;

  return (
    <div className="text-sm leading-relaxed text-muted-foreground">
      <p className={`whitespace-pre-line ${open || !long ? "" : "line-clamp-3"}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 font-semibold text-primary hover:underline">
          {open ? labels.less : labels.more}
        </button>
      )}
    </div>
  );
}
