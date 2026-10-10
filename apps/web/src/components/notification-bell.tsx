"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { interpolate } from "@/lib/format";
import { useSession } from "./auth/session-provider";

/** Header bell with the live unread count. */
export function NotificationBell({
  href,
  label,
  unreadLabel,
  className,
}: {
  href: string;
  label: string;
  /** e.g. "Notifications, {n} unread" */
  unreadLabel: string;
  className: string;
}) {
  const { notificationCount: count } = useSession();
  return (
    <Link href={href} aria-label={count > 0 ? interpolate(unreadLabel, { n: count }) : label} className={className}>
      <Bell className="size-6" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-sale px-1 text-center text-xs font-semibold tabular-nums text-white ring-2 ring-primary">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
