"use client";

import { Megaphone } from "lucide-react";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { setPromotions } from "@/lib/notification-settings-actions";

type Dict = Dictionary["notifications"];

/**
 * Promotions and MC Mart news by push and SMS, on or off. Off, they still show in the
 * notifications list; order and chat notifications always come. The app has the same switch.
 */
export function PromotionsSwitch({ initial, dict }: { initial: boolean; dict: Dict }) {
  const [on, setOn] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setFailed(false);
    start(async () => {
      const res = await setPromotions(next);
      if (!res.ok) {
        setOn(!next);
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
        <Megaphone className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold" id="promotions-title">
          {dict.promoTitle}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{dict.promoBody}</p>
        {failed && (
          <p role="alert" className="mt-1 text-sm text-sale">
            {dict.promoFailed}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="promotions-title"
        disabled={pending}
        onClick={toggle}
        className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span className="sr-only">{on ? dict.promoOn : dict.promoOff}</span>
        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
