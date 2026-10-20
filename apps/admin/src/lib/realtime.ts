/** An admin notification (API `admin/notifications`). */
export interface AdminNotification {
  id: string
  type: string
  title: string
  body: string
  data: { link?: string; i18n?: Partial<Record<'lo' | 'en', { title: string; body: string }>> }
  readAt: string | null
  createdAt: string
}

export interface AdminNotificationPage {
  items: AdminNotification[]
  unread: number
  nextCursor: string | null
}

export const NOTIFICATIONS_KEY = ['admin', 'notifications'] as const
export const NOTIFICATIONS_UNREAD_KEY = ['admin', 'notifications', 'unread'] as const

/** A notification's text in the viewer's language (the English title/body are the fallback). */
export const notificationText = (n: { title: string; body: string; i18n?: AdminNotification['data']['i18n'] }, locale: 'lo' | 'en') =>
  n.i18n?.[locale] ?? { title: n.title, body: n.body }
