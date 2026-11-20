import type { NotificationFrom } from "@talad/shared";
import type { LucideIcon } from "lucide-react";
import { Store } from "lucide-react";
import { BrandLogo } from "../brand-logo";
import { avatarSrc } from "@/lib/customer";

/**
 * Who a notification is from, as Facebook shows it: MC Mart's logo (admin messages, system news),
 * the shop's logo (its orders and replies) or the customer's photo (their orders, likes,
 * comments), with a small badge for the kind of notification.
 */
export function NotificationAvatar({ from, icon: Icon, tone }: { from?: NotificationFrom; icon: LucideIcon; tone: string }) {
  return (
    <span className="relative shrink-0">
      <Picture from={from} />
      <span className={`absolute -bottom-1 -right-1 flex size-5.5 items-center justify-center rounded-full ring-2 ring-card ${tone}`}>
        <Icon className="size-3" />
      </span>
    </span>
  );
}

function Picture({ from }: { from?: NotificationFrom }) {
  const round = "flex size-12 items-center justify-center overflow-hidden rounded-full";
  if (!from || from.kind === "mcmart") {
    return (
      <span className={`${round} bg-linear-to-br from-[#43a047] to-[#1b5e20]`}>
        <BrandLogo className="size-7" />
      </span>
    );
  }
  const src = from.kind === "shop" ? from.imageUrl : avatarSrc(from);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- shop logos (CDN) and social profile photos
    return <img src={src} alt={from.name} referrerPolicy="no-referrer" className={`${round} bg-muted object-cover`} />;
  }
  return (
    <span className={`${round} bg-primary-soft text-sm font-bold text-primary`} aria-label={from.name}>
      {from.kind === "shop" ? (
        <Store className="size-5" />
      ) : (
        from.name
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      )}
    </span>
  );
}
