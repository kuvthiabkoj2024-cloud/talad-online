import type { PayoutStatus } from './types'

export type PayoutAction = 'paid' | 'failed'

/** What can happen next to a payout in each status. */
export const PAYOUT_NEXT: Record<PayoutStatus, PayoutAction[]> = { SCHEDULED: ['paid', 'failed'], PROCESSING: ['paid', 'failed'], PAID: [], FAILED: [] }
