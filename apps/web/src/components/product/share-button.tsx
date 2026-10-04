"use client";

import { Check, Forward } from "lucide-react";
import { useState } from "react";

/** Native share sheet on mobile; copies the link elsewhere. */
export function ShareButton({
  title,
  labels,
}: {
  title: string;
  labels: { share: string; copied: string };
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // user dismissed the share sheet
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      {copied ? labels.copied : labels.share}
      {copied ? <Check className="size-5 text-primary" /> : <Forward className="size-5" />}
    </button>
  );
}
