"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Accessible modal built on <dialog>: focus trapping, Esc to close and a
 * backdrop come from the browser. Clicking the backdrop also closes it.
 */
export function Modal({
  open,
  onClose,
  closeLabel,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  closeLabel: string;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
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
      className={`m-auto w-[calc(100%-2rem)] rounded-3xl bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:animate-[modal-in_180ms_ease-out] ${
        { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" }[size]
      }`}
    >
      <div className="relative max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-5" />
        </button>
        {open && children}
      </div>
    </dialog>
  );
}
