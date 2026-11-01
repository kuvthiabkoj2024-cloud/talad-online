"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

/** One answer open at a time, the first to begin with. Answers are HTML cleaned by the API when saved. */
export function FaqAccordion({ items }: { items: { id: string; title: string; html: string }[] }) {
  const base = useId();
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const open = item.id === openId;
        const panel = `${base}-${item.id}`;
        return (
          <section key={item.id} className={`group rounded-2xl border bg-card transition-colors ${open ? "border-primary/40" : "border-border"}`}>
            <h2>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panel}
                onClick={() => setOpenId(open ? null : item.id)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl p-5 text-left focus-visible:outline-2 focus-visible:outline-primary sm:px-8"
              >
                <span className={`font-semibold sm:text-lg ${open ? "text-primary" : ""}`}>{item.title}</span>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${open ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <ChevronDown className={`size-5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
                </span>
              </button>
            </h2>
            {/* Stays in the page when closed so the browser's find-in-page and search engines see it; inert keeps its links out of tab order. */}
            <div id={panel} inert={!open} className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className="cms-body px-5 pb-5 sm:px-8 sm:pb-6" dangerouslySetInnerHTML={{ __html: item.html }} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
