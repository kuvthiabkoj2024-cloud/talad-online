"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pages opened from the account hub (/account); deeper pages have their own back link. */
const HUB_CHILDREN = /^\/account\/(profile|orders|addresses|bank-accounts|following|points)\/?$/;

/** "← Back to Profile" above the pages listed on the account hub. */
export function BackToAccount({ href, label }: { href: string; label: string }) {
  const path = usePathname().replace(/^\/[^/]+/, "");
  if (!HUB_CHILDREN.test(path)) return null;
  return <BackLink href={href} label={label} />;
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-my-1 flex items-center gap-1.5 self-start rounded-full py-1 pr-2 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
