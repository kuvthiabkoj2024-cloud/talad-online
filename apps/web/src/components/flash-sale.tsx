import type { Dictionary } from "@/app/[lang]/dictionaries";
import { Countdown } from "./countdown";

/**
 * Flash sale strip with countdown (§5). Renders nothing until there is an active sale.
 * TODO: load the active sale and its products from the promotions API.
 */
export function FlashSale({ dict }: { dict: Dictionary["home"] }) {
  const endsAt: string | null = null;
  if (!endsAt) return null;

  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">⚡ {dict.flashSale}</h2>
        <span className="text-sm text-muted-foreground">
          {dict.endsIn} <Countdown endsAt={endsAt} />
        </span>
      </div>
    </section>
  );
}
