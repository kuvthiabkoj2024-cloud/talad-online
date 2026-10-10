import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@talad/ui/components/sidebar'
import { useQuery } from '@tanstack/react-query'
import { ChevronsUpDown, ShieldCheck } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { can, useAuth } from '@/auth/context'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import type { Alerts } from '@/lib/types'
import { ALERTS_KEY, NAV_GROUPS } from '@/nav'
import { AccountMenu, AdminAvatar } from './account-menu'

/** Navigation for the signed-in role, with counts of what's waiting (refreshed every minute). */
export function AppSidebar() {
  const { t } = useI18n()
  const { admin } = useAuth()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const alerts = useQuery({ queryKey: ALERTS_KEY, queryFn: () => api<Alerts>('/admin/alerts'), refetchInterval: 60_000 })
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))
  const allowed = (area?: string) => (area ? can(admin?.role, area) : admin?.role === 'SUPER_ADMIN')

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={`${t.app.brand} ${t.app.name}`}>
              <NavLink to="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ShieldCheck className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{t.app.brand}</span>
                  <span className="truncate text-xs text-muted-foreground">{t.app.name}</span>
                </span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => allowed(i.area))
          if (items.length === 0) return null
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{t.nav[group.label]}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map(({ to, label, icon: Icon, badge }) => {
                  const count = badge && alerts.data ? badge(alerts.data) : 0
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild isActive={isActive(to)} tooltip={t.nav[label]}>
                        <NavLink to={to} onClick={() => isMobile && setOpenMobile(false)}>
                          <Icon />
                          <span>{t.nav[label]}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {count > 0 && <SidebarMenuBadge className="rounded-full bg-destructive px-1.5 text-white">{count}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      {admin && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <AccountMenu
                side={isMobile ? 'bottom' : 'right'}
                trigger={
                  <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                    <AdminAvatar name={admin.name} className="size-8 rounded-lg" />
                    <span className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{admin.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{t.roles[admin.role]}</span>
                    </span>
                    <ChevronsUpDown className="ml-auto" />
                  </SidebarMenuButton>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  )
}
