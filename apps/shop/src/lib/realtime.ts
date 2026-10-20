import type { InboxNotification } from './types'

/** Chats listen for this to fetch a new message at once (detail: the conversation id). */
export const MESSAGE_EVENT = 'talad:message'

/** A notification's text in the viewer's language (the English title/body are the fallback). */
export const notificationText = (n: { title: string; body: string; i18n?: InboxNotification['data']['i18n'] }, locale: 'lo' | 'en') =>
  n.i18n?.[locale] ?? { title: n.title, body: n.body }
