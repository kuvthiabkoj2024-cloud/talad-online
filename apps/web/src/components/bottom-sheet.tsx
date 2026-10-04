"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Panel that slides up from the bottom of the screen (mobile pickers). Built on
 * <dialog>: focus trapping, Esc to close and the backdrop come from the browser;
 * tapping the backdrop closes it too.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
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
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50 open:animate-[sheet-in_220ms_ease-out]"
    >
      <div className="mx-auto max-h-[80dvh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <span aria-hidden className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-border" />
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
