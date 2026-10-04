import { NavLink, Outlet } from 'react-router'
import { cn } from '@talad/ui/lib/utils'
import { NAV } from '@/nav'

export function AppShell() {
  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar p-4 md:block">
        <div className="mb-6 px-2 text-lg font-semibold">Taladonline Seller Center</div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent',
                  isActive && 'bg-sidebar-accent font-medium',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
