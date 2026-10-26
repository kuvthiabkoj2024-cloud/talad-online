import type { PushSubscriptionBody } from '@talad/ui/lib/web-push'
import { send } from './api'

/** This browser gets the shop's Web Push notifications (orders, activity, messages). */
export const savePushSubscription = (body: PushSubscriptionBody) => send<void>('PUT', '/me/shop/push-subscription', body)
export const removePushSubscription = (endpoint: string) => send<void>('DELETE', '/me/shop/push-subscription', { endpoint })
