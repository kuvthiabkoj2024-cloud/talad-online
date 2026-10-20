"use client";

import { Check, Copy, Download, MessageCircle, Phone, Send, Share2 } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { BottomSheet } from "../bottom-sheet";

type Dict = Dictionary["feed"];

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
  {
    name: "X",
    bg: "bg-black",
    icon: <span className="text-xl font-bold leading-none">𝕏</span>,
    href: (url, text) => `https://x.com/intent/tweet?url=${e(url)}&text=${e(text)}`,
  },
];

/**
 * Share a feed video: QR code (scan on another phone, or save it to post), the link,
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
  dict: Dict;
  onShared: () => void;
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
    onShared();
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

  return (
    <BottomSheet open={open} onClose={onClose} title={dict.shareTitle} closeLabel={dict.close}>
      <div className="mx-auto flex max-w-md flex-col gap-5 pb-2">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-48 items-center justify-center rounded-2xl border border-border bg-white p-2 shadow-sm">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated data URL
              <img src={qr} alt={`QR: ${url}`} className="size-full" />
            ) : (
              <span className="size-full animate-pulse rounded-xl bg-muted" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">{dict.scanQr}</p>
          {qr && (
            <a
              href={qr}
              download="taladonline-qr.png"
              onClick={shared}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <Download className="size-4" />
              {dict.saveQr}
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-full border border-border bg-muted/50 p-1 pl-4">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={url}>
            {url}
          </span>
          <button
            type="button"
            onClick={copy}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? dict.copied : dict.copyLink}
          </button>
        </div>

        <ul className="grid grid-cols-4 gap-x-2 gap-y-4">
          {TARGETS.map((t) => (
            <li key={t.name}>
              <a
                href={t.href(url, title)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={shared}
                className="flex flex-col items-center gap-1.5 text-xs font-medium"
              >
                <span className={`flex size-12 items-center justify-center rounded-full text-white shadow-sm ${t.bg}`}>
                  {t.icon}
                </span>
                {t.name}
              </a>
            </li>
          ))}
          {canNativeShare && (
            <li>
              <button
                type="button"
                onClick={nativeShare}
                className="flex w-full flex-col items-center gap-1.5 text-xs font-medium"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground shadow-sm">
                  <Share2 className="size-5" />
                </span>
                {dict.shareMore}
              </button>
            </li>
          )}
        </ul>
      </div>
    </BottomSheet>
  );
}
