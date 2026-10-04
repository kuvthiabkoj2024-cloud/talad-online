import { Coffee, Gift, Shirt, Smartphone, Truck } from "lucide-react";
import type { Dictionary } from "@/app/[lang]/dictionaries";

/** Right-hand column next to the hero: brand promo + free-delivery ticket. */
export function PromoCards({ dict }: { dict: Dictionary["home"] }) {
  return (
    <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2">
      <div className="relative flex items-center overflow-hidden rounded-2xl bg-gradient-to-br from-card to-muted p-6 ring-1 ring-border">
        <div className="relative z-10 max-w-[60%]">
          <p className="text-xl font-bold leading-snug">
            {dict.promoTitle}
            <br />
            <span className="text-primary">Taladonline</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{dict.promoSubtitle}</p>
        </div>
        <div
          aria-hidden
          className="absolute -right-2 top-1/2 grid -translate-y-1/2 grid-cols-2 gap-2 text-primary/70"
        >
          <Coffee className="size-12 rotate-[-8deg]" strokeWidth={1.5} />
          <Shirt className="size-12 rotate-[6deg]" strokeWidth={1.5} />
          <Gift className="size-12 rotate-[4deg]" strokeWidth={1.5} />
          <Smartphone className="size-12 rotate-[-6deg]" strokeWidth={1.5} />
        </div>
      </div>

      {/* Ticket-style card: side notches are page-coloured circles */}
      <div className="relative flex flex-col justify-center rounded-2xl border-2 border-primary/40 bg-card px-7 py-5">
        <span aria-hidden className="absolute -left-2.5 top-1/2 size-5 -translate-y-1/2 rounded-full border-2 border-primary/40 bg-background [clip-path:inset(0_0_0_50%)]" />
        <span aria-hidden className="absolute -right-2.5 top-1/2 size-5 -translate-y-1/2 rounded-full border-2 border-primary/40 bg-background [clip-path:inset(0_50%_0_0)]" />
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-primary p-2 text-primary-foreground">
            <Truck className="size-6" />
          </span>
          <p className="text-2xl font-extrabold">{dict.freeShipTitle}</p>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{dict.freeShipDesc}</p>
      </div>
    </div>
  );
}
