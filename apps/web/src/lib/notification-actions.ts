"use server";

import { isNotificationTab, type NotificationTab } from "@talad/shared";
import { API_URL } from "./api";
import { getSessionToken } from "./session";

async function post(path: string): Promise<boolean> {
  const token = await getSessionToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function markNotificationRead(id: string): Promise<boolean> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  return post(`/me/notifications/${id}/read`);
}

/** Marks every unread notification (or one tab's) as read. */
export async function markAllNotificationsRead(tab?: NotificationTab): Promise<boolean> {
  if (tab !== undefined && !isNotificationTab(tab)) return false;
  return post(`/me/notifications/read-all${tab ? `?tab=${tab}` : ""}`);
}
