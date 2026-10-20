import { Separator } from '@talad/ui/components/separator'
import { SidebarTrigger } from '@talad/ui/components/sidebar'
import { cn } from '@talad/ui/lib/utils'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/context'
import { useI18n } from '@/i18n/context'
import { AccountMenu, AdminAvatar } from './account-menu'
import { NotificationBell } from './notification-bell'

/** Sticky top bar: sidebar toggle, optional back link, title, and the account on phones. */
export function TopBar({ title, backTo }: { title: string; backTo?: string }) {
  const { t } = useI18n()
  const { admin } = useAuth()
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4! self-center!" />
      {backTo && (
        <Link to={backTo} aria-label={t.common.back} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
      {admin && <NotificationBell />}
      {admin && (
        <span className="md:hidden">
          <AccountMenu
            trigger={
              <button type="button" className="rounded-full p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <AdminAvatar name={admin.name} className="size-8" />
              </button>
            }
          />
        </span>
      )}
    </header>
  )
}

export function PageIntro({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6', className)}>{children}</div>
}
