"use client";

import { Check, Copy, Download, ExternalLink, MessageCircle, Phone, Send, Share2, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";

/** The texts the sheet needs; the feed passes its own, product and shop pages theirs. */
export type ShareSheetDict = Pick<Dictionary["feed"], "shareTitle" | "close" | "scanQr" | "saveQr" | "copied" | "copyLink" | "shareMore" | "openLink">;

interface Target {
  name: string;
  /** Brand color for the round button. */
  bg: string;
  icon: React.ReactNode;
  href: (url: string, text: string) => string;
}

const e = encodeURIComponent;

/** Share links that need no app id. Messenger's deep link only works where the app is installed. */
const TARGETS: Target[] = [
  {
    name: "Facebook",
    bg: "bg-[#1877F2]",
    icon: <span className="text-2xl font-black leading-none">f</span>,
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`,
  },
  {
    name: "Messenger",
    bg: "bg-linear-to-br from-[#00B2FF] to-[#A033FF]",
    icon: <MessageCircle className="size-6 fill-current" />,
    href: (url) => `fb-messenger://share/?link=${e(url)}`,
  },
  {
    name: "WhatsApp",
    bg: "bg-[#25D366]",
    icon: <Phone className="size-6 fill-current" />,
    href: (url, text) => `https://wa.me/?text=${e(`${text} ${url}`)}`,
  },
  {
    name: "LINE",
    bg: "bg-[#06C755]",
    icon: <span className="text-xs font-black tracking-tight">LINE</span>,
    href: (url) => `https://social-plugins.line.me/lineit/share?url=${e(url)}`,
  },
  {
    name: "Telegram",
    bg: "bg-[#229ED9]",
    icon: <Send className="-ml-0.5 size-6 fill-current" />,
    href: (url, text) => `https://t.me/share/url?url=${e(url)}&text=${e(text)}`,
  },
];

/**
 * Share a page (a feed video, a product, a shop): QR code (scan on another phone, or save it to post), the link,
 * one-tap buttons for the apps people use in Laos, and the phone's own share sheet.
 * `onShared` fires once per opening, whichever way the viewer shares.
 */
export function ShareSheet({
  open,
  onClose,
  url,
  title,
  dict,
  onShared,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  dict: ShareSheetDict;
  onShared?: () => void;
}) {
  // Mounted fresh each time the sheet opens, so this state starts clean.
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [counted, setCounted] = useState(false);
  const [canNativeShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");

  useEffect(() => {
    QRCode.toDataURL(url, {
      margin: 1,
      width: 480,
      errorCorrectionLevel: "M",
      color: { dark: "#14532d", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  function shared() {
    if (counted) return;
    setCounted(true);
    onShared?.();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers: fall back to a hidden textarea.
      const t = document.createElement("textarea");
      t.value = url;
      document.body.append(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    shared();
    setTimeout(() => setCopied(false), 2000);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text: title, url });
      shared();
    } catch {
      // dismissed
    }
  }

  // Centred card (same design as the Seller Center's share dialog), on a native <dialog>:
  // focus trap, Esc and the backdrop come from the browser; tapping the backdrop closes it.
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="share-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="share-title" className="text-lg font-bold leading-tight">
              {dict.shareTitle}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.close}
            className="-mr-2 -mt-1 rounded-full p-2 text-foreground transition-colors hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex size-44 items-center justify-center rounded-2xl border border-border bg-white p-2 shadow-sm">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated data URL
              <img src={qr} alt={`QR: ${url}`} className="size-full" />
            ) : (
              <span className="size-full animate-pulse rounded-xl bg-muted" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">{dict.scanQr}</p>
          {qr && (
            <a
              href={qr}
              download="taladonline-qr.png"
              onClick={shared}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Download className="size-4" />
              {dict.saveQr}
            </a>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-muted/50 p-1 pl-4">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={url}>
            {url.replace(/^https?:\/\//, "")}
          </span>
          <button
            type="button"
            onClick={copy}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:brightness-110"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? dict.copied : dict.copyLink}
          </button>
        </div>

        <ul className="grid grid-cols-5 gap-2">
          {TARGETS.map((t) => (
            <li key={t.name}>
              <a
                href={t.href(url, title)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={shared}
                className="flex flex-col items-center gap-1.5 text-[11px] font-medium"
              >
                <span className={`flex size-11 items-center justify-center rounded-full text-white shadow-sm ${t.bg}`}>
                  {t.icon}
                </span>
                {t.name}
              </a>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-muted"
          >
            <ExternalLink className="size-4" />
            {dict.openLink}
          </a>
          <button
            type="button"
            onClick={canNativeShare ? nativeShare : copy}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-muted"
          >
            {canNativeShare ? <Share2 className="size-4" /> : <Copy className="size-4" />}
            {canNativeShare ? dict.shareMore : dict.copyLink}
          </button>
        </div>
      </div>
    </dialog>
  );
}
