import { ChevronRight } from "lucide-react";
import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb trail; the last crumb is the current page. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex items-center gap-1.5 overflow-hidden">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className={`flex items-center gap-1.5 ${last ? "min-w-0" : "shrink-0"}`}>
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="truncate text-foreground">
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight aria-hidden className="size-4 shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
