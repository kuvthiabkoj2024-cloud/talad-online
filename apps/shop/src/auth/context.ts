import { createContext, useContext } from 'react'
import type { Account } from '@/lib/types'

export interface AuthState {
  /** The signed-in account, or null when signed out. */
  account: Account | null
  /** `error`: signed in, but the account couldn't be loaded (e.g. offline). */
  status: 'loading' | 'ready' | 'error'
  retry: () => void
  signIn: (token: string, account: Account) => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export const ME_KEY = ['me'] as const

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
