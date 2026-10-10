import type { AdminRole } from '@talad/shared'
import { createContext, useContext } from 'react'
import type { Admin } from '@/lib/types'

export interface AuthState {
  admin: Admin | null
  /** `error`: signed in, but the profile couldn't be loaded (e.g. offline). */
  status: 'loading' | 'ready' | 'error'
  retry: () => void
  signIn: (token: string, admin: Admin) => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export const ME_KEY = ['admin', 'me'] as const

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/**
 * What each role may open (mirrors the API's @Roles guards, §2.1). Super Admin is
 * implied everywhere; areas without an entry are Super Admin only.
 */
export const ACCESS: Record<string, AdminRole[]> = {
  dashboard: ['SUPPORT', 'FINANCE'],
  shops: ['SUPPORT', 'FINANCE'],
  products: ['SUPPORT'],
  customers: ['SUPPORT'],
  orders: ['SUPPORT', 'FINANCE'],
  disputes: ['SUPPORT'],
  payouts: ['FINANCE'],
  reports: ['FINANCE'],
  'shop-decisions': ['SUPPORT'],
  'shop-commission': ['FINANCE'],
}

export function can(role: AdminRole | undefined, area: string): boolean {
  if (!role) return false
  return role === 'SUPER_ADMIN' || (ACCESS[area]?.includes(role) ?? false)
}
