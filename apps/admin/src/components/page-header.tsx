import { Separator } from '@talad/ui/components/separator'
import { SidebarTrigger } from '@talad/ui/components/sidebar'
import { cn } from '@talad/ui/lib/utils'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/context'
import { useI18n } from '@/i18n/context'
import { roleName } from '@/lib/roles'
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
        <AccountMenu
          side="bottom"
          trigger={
            // Phones: just the avatar. Desktop: avatar, name and role.
            <button
              type="button"
              className="flex items-center gap-2 rounded-full p-0.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted md:py-1 md:pr-2.5 md:pl-1"
            >
              <AdminAvatar name={admin.name} className="size-8" />
              <span className="hidden min-w-0 text-left leading-tight md:block">
                <span className="block max-w-40 truncate text-sm font-medium">{admin.name}</span>
                <span className="block max-w-40 truncate text-xs text-muted-foreground">{roleName(admin.role, t)}</span>
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
            </button>
          }
        />
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
  return <div className={cn('mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6', className)}>{children}</div>
}
