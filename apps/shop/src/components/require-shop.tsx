import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Ban } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/auth/context'
import { useI18n } from '@/i18n/context'
import { ErrorState, FullScreen, LoadingState } from './states'

/** Pages for any signed-in account (e.g. opening a shop). */
export function RequireAccount() {
  const { account, status, retry } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <FullScreen>
        <LoadingState />
      </FullScreen>
    )
  }
  if (status === 'error') {
    return (
      <FullScreen>
        <ErrorState onRetry={retry} className="w-full max-w-md" />
      </FullScreen>
    )
  }
  if (!account) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

/** Seller tools: the account must own a shop that isn't suspended. No shop yet → apply for one. */
export function RequireShop() {
  const { account, signOut } = useAuth()
  const { t } = useI18n()

  if (!account?.shop) return <Navigate to="/register" replace />
  if (account.shop.status === 'SUSPENDED') {
    return (
      <FullScreen>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950">
              <Ban className="size-7" />
            </span>
            <h1 className="text-lg font-semibold">{t.auth.suspendedTitle}</h1>
            <p className="text-sm text-muted-foreground">{t.auth.suspendedBody}</p>
            <Button variant="outline" className="mt-2" onClick={() => void signOut()}>
              {t.auth.otherAccount}
            </Button>
          </CardContent>
        </Card>
      </FullScreen>
    )
  }
  return <Outlet />
}
