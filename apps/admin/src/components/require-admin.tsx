import type { AdminPermission } from '@talad/shared'
import { Lock } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { can, isSuperAdmin, useAuth } from '@/auth/context'
import { useI18n } from '@/i18n/context'
import { PageBody } from './page-header'
import { EmptyState, ErrorState, FullScreen, LoadingState } from './states'

/** Everything but the sign-in page needs an admin session. */
export function RequireAdmin() {
  const { admin, status, retry } = useAuth()
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
  if (!admin) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

/** A page for admins with the `area` permission (omitted = Super Admin only). */
export function RequireArea({ area, children }: { area?: AdminPermission; children: React.ReactNode }) {
  const { admin } = useAuth()
  const { t } = useI18n()
  const ok = area ? can(admin, area) : isSuperAdmin(admin)
  if (ok) return children
  return (
    <PageBody>
      <EmptyState icon={Lock} title={t.common.noPermission} className="mt-6" />
    </PageBody>
  )
}
