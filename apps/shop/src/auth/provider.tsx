import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { disablePush } from '@talad/ui/lib/web-push'
import { api, getToken, send, setToken, setUnauthorizedHandler } from '@/lib/api'
import { removePushSubscription } from '@/lib/push'
import type { Account } from '@/lib/types'
import { AuthContext, ME_KEY } from './context'

/**
 * Seller Center session: the API token in local storage and the account it belongs to.
 * A 401 anywhere signs the seller out.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [hasToken, setHasToken] = useState(() => getToken() !== null)

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: () => api<Account>('/auth/customer/me'),
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
    (token: string, account: Account) => {
      setToken(token)
      queryClient.setQueryData(ME_KEY, account)
      setHasToken(true)
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    // This browser stops getting the shop's notifications (while the session still works).
    await disablePush(removePushSubscription)
    await send('POST', '/auth/customer/logout').catch(() => {})
    clear()
  }, [clear])

  const value = useMemo(
    () => ({
      account: hasToken ? (me.data ?? null) : null,
      status: !hasToken ? ('ready' as const) : me.isPending ? ('loading' as const) : me.isError ? ('error' as const) : ('ready' as const),
      retry: () => void me.refetch(),
      signIn,
      signOut,
    }),
    [hasToken, me, signIn, signOut],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}
