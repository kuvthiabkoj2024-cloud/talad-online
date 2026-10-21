import type { AdminPermission } from '@talad/shared'
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

/** Whether the signed-in admin has `permission` (Super Admins have them all). Mirrors the API's @Permission guards. */
export function can(admin: Admin | null | undefined, permission: AdminPermission): boolean {
  return !!admin && (admin.role.isSuper || admin.can.includes(permission))
}

/** Managing admins and roles is for Super Admins only. */
export const isSuperAdmin = (admin: Admin | null | undefined) => !!admin?.role.isSuper
