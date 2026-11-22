"use client";

import { shopOpenState, WEEKDAY_NAMES, WEEKDAYS, type BusinessHours, type Locale, type OpenState } from "@talad/shared";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { interpolate } from "@/lib/format";
import { ShopSection } from "./shop-section";

export interface ShopHoursDict {
  hours: string;
  openNow: string;
  closedNow: string;
  closesAt: string;
  opensToday: string;
  opensOn: string;
  closedDay: string;
}

/**
 * The shop's opening hours, with "Open now · Closes at 18:00". The status is worked out in the
 * browser (Vientiane time) after it loads, so a cached page never shows a stale "open".
 */
export function ShopHours({ hours, locale, dict }: { hours: BusinessHours; locale: Locale; dict: ShopHoursDict }) {
  const [state, setState] = useState<OpenState | null>(null);
  useEffect(() => {
    const tick = () => setState(shopOpenState(hours));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [hours]);

  if (!WEEKDAYS.some((d) => hours[d])) return null;
  const names = WEEKDAY_NAMES[locale === "lo" ? "lo" : "en"];
  // "Open now · Closes at 18:00" shows on the folded row, so it's seen without opening it.
  const status = state && (
    <>
      <span className={state.open ? "font-semibold text-primary" : "font-semibold text-destructive"}>
        · {state.open ? dict.openNow : dict.closedNow}
      </span>{" "}
      <span className="text-muted-foreground max-sm:hidden">
        {state.open && state.today
          ? interpolate(dict.closesAt, { time: state.today.close })
          : state.next &&
            (state.next.today
              ? interpolate(dict.opensToday, { time: state.next.open })
              : interpolate(dict.opensOn, { day: names[state.next.day], time: state.next.open }))}
      </span>
    </>
  );

  return (
    <ShopSection icon={<Clock className="size-4" />} title={dict.hours} summary={status}>
      <dl className="grid max-w-sm grid-cols-[auto_1fr] gap-x-6 gap-y-0.5 text-sm">
        {WEEKDAYS.map((d) => (
          <div key={d} className="contents">
            <dt className="text-muted-foreground">{names[d]}</dt>
            <dd className={hours[d] ? "tabular-nums" : "text-muted-foreground"}>
              {hours[d] ? `${hours[d].open}–${hours[d].close}` : dict.closedDay}
            </dd>
          </div>
        ))}
      </dl>
    </ShopSection>
  );
}
