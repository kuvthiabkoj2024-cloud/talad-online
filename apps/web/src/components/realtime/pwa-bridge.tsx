"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/components/auth/session-provider";
import { listenForPushOpens, setAppBadge } from "@/lib/pwa";

/** After opening a chat or the notifications page, how long until the counts are checked again. */
const RECHECK_MS = 1_500;

/**
 * For the app installed on the home screen: keeps the number on its icon (unread notifications
 * + unread chat messages) in step with the bell, and opens the page a tapped push notification
 * is about (see public/sw.js).
 */
export function PwaBridge() {
  const { customer, status, notificationCount, messageCount, refresh } = useSession();
  const pathname = usePathname();
  const signedIn = !!customer;

  useEffect(() => {
    if (status !== "ready") return;
    setAppBadge(signedIn ? notificationCount + messageCount : 0);
  }, [status, signedIn, notificationCount, messageCount]);

  // A full page load: the app may be on another page already, and the old one shouldn't linger.
  useEffect(() => listenForPushOpens((path) => window.location.assign(path)), []);

  // Back from the background (pushes may have come in, or been read on another device).
  useEffect(() => {
    if (!signedIn) return;
    const onShow = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [signedIn, refresh]);

  // Reading a chat or the inbox lowers the counts.
  const reading = /\/(messages\/[^/]+|notifications)$/.test(pathname);
  useEffect(() => {
    if (!signedIn || !reading) return;
    const timer = setTimeout(() => void refresh(), RECHECK_MS);
    return () => clearTimeout(timer);
  }, [signedIn, reading, pathname, refresh]);

  return null;
}
