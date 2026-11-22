import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A folded part of the shop header (about, opening hours): the title row opens it. `summary`
 * shows next to the title while folded, e.g. "Open now".
 */
export function ShopSection({ icon, title, summary, children }: { icon: ReactNode; title: string; summary?: ReactNode; children: ReactNode }) {
  return (
    <details className="group border-t border-border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm transition-colors hover:bg-muted/50 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-semibold">{title}</span>
        {summary && <span className="min-w-0 truncate">{summary}</span>}
        <ChevronDown aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-4 sm:px-6">{children}</div>
    </details>
  );
}
