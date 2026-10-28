"use client";

import { ReceiptText } from "lucide-react";
import { useState } from "react";
import { Modal } from "../auth/modal";

/** The courier's bill the shop photographed: a thumbnail on the order, full size in a pop-up. */
export function ShippingBill({ src, label, closeLabel }: { src: string; label: string; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center gap-3 rounded-xl p-1.5 text-left ring-1 ring-border transition hover:bg-muted hover:ring-primary/40"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private image streamed per session */}
        <img src={src} alt="" className="h-20 w-16 shrink-0 rounded-lg bg-muted object-cover" />
        <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ReceiptText className="size-4" />
          {label}
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} closeLabel={closeLabel} size="sm">
        {open && (
          // eslint-disable-next-line @next/next/no-img-element -- private image streamed per session
          <img src={src} alt={label} className="mx-auto max-h-[75vh] w-full rounded-xl object-contain ring-1 ring-border" />
        )}
      </Modal>
    </>
  );
}
