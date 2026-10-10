"use client";

import type { NotificationTab } from "@talad/shared";
import { CheckCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notification-actions";
import { useSession } from "../auth/session-provider";

/**
 * One notification. Opening it marks it read right away (badge included) while the
 * link navigates; `data-unread` drives the bold title and dot inside.
 */
export function NotificationRow({
  id,
  unread,
  href,
  className,
  children,
}: {
  id: string;
  unread: boolean;
  href: string | null;
  className: string;
  children: React.ReactNode;
}) {
  const { setNotificationCount } = useSession();
  const [read, setRead] = useState(!unread);

  function open() {
    if (read) return;
    setRead(true);
    setNotificationCount((n) => Math.max(0, n - 1));
    void markNotificationRead(id);
  }

  const props = { "data-unread": read ? undefined : "", onClick: open, className: `group ${className}` };
  return href ? (
    <Link href={href} {...props}>
      {children}
    </Link>
  ) : (
    <button type="button" {...props}>
      {children}
    </button>
  );
}

export function MarkAllReadButton({
  tab,
  disabled,
  label,
}: {
  tab?: NotificationTab;
  disabled: boolean;
  label: string;
}) {
  const { refresh } = useSession();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          if (!(await markAllNotificationsRead(tab))) return;
          await refresh();
          router.refresh();
        })
      }
      className="flex items-center gap-1.5 rounded-full border border-primary/40 px-3.5 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
      {label}
    </button>
  );
}
