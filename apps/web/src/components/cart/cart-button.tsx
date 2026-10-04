"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useSession } from "../auth/session-provider";

/** Header cart icon with the live item count. */
export function CartButton({ href, label, className }: { href: string; label: string; className: string }) {
  const { cartCount } = useSession();
  return (
    <Link href={href} aria-label={label} className={className}>
      <ShoppingCart className="size-6" />
      {cartCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-card px-1 text-center text-xs font-semibold tabular-nums text-primary">
          {cartCount > 99 ? "99+" : cartCount}
        </span>
      )}
    </Link>
  );
}
