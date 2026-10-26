"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { ShareSheet, type ShareSheetDict } from "../feed/share-sheet";

/**
 * Opens the share sheet (QR code, copy link, Facebook, Messenger, WhatsApp…) for this page.
 * The link is the page itself without its query string, so filters and searches don't travel.
 */
export function ShareButton({
  title,
  label,
  dict,
  variant = "text",
  iconOnlyOnPhones = false,
}: {
  title: string;
  label: string;
  dict: ShareSheetDict;
  /** "text": a quiet link-style button; "pill": an outlined button (shop header). */
  variant?: "text" | "pill";
  /** Narrow screens show just the icon (the label stays for screen readers). */
  iconOnlyOnPhones?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setUrl(window.location.origin + window.location.pathname)}
        className={
          variant === "pill"
            ? `flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-semibold transition-colors hover:border-primary hover:text-primary ${iconOnlyOnPhones ? "w-11 sm:w-auto sm:px-5" : "px-5"}`
            : "flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
        }
      >
        <Share2 className="size-4.5 shrink-0" />
        <span className={iconOnlyOnPhones ? "max-sm:sr-only" : undefined}>{label}</span>
      </button>
      {url && <ShareSheet open onClose={() => setUrl(null)} url={url} title={title} dict={dict} />}
    </>
  );
}
