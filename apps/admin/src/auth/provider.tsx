import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, getToken, send, setToken, setUnauthorizedHandler } from '@/lib/api'
import type { Admin } from '@/lib/types'
import { AuthContext, ME_KEY } from './context'

/** Admin session: the API token in local storage and the signed-in staff member. A 401 signs out. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [hasToken, setHasToken] = useState(() => getToken() !== null)

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: () => api<Admin>('/admin/auth/me'),
    enabled: hasToken,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const clear = useCallback(() => {
    setToken(null)
    setHasToken(false)
    queryClient.clear()
  }, [queryClient])

  useEffect(() => setUnauthorizedHandler(clear), [clear])

  const signIn = useCallback(
    (token: string, admin: Admin) => {
      setToken(token)
      queryClient.setQueryData(ME_KEY, admin)
      setHasToken(true)
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    await send('POST', '/admin/auth/logout').catch(() => {})
    clear()
  }, [clear])

  const value = useMemo(
    () => ({
      admin: hasToken ? (me.data ?? null) : null,
      status: !hasToken ? ('ready' as const) : me.isPending ? ('loading' as const) : me.isError ? ('error' as const) : ('ready' as const),
      retry: () => void me.refetch(),
      signIn,
      signOut,
    }),
    [hasToken, me, signIn, signOut],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}
