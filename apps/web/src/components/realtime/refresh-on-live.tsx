"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LIVE_NOTIFICATION_EVENT } from "@/lib/live-events";

/** Re-renders this page when a live notification arrives (the notifications list, an order). */
export function RefreshOnLive() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener(LIVE_NOTIFICATION_EVENT, refresh);
    return () => window.removeEventListener(LIVE_NOTIFICATION_EVENT, refresh);
  }, [router]);
  return null;
}
