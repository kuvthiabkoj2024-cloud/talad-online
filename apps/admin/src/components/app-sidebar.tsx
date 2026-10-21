import type { AdminPermission } from '@talad/shared'
import {
  Sidebar,
  SidebarContent,
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
import { ShieldCheck } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { can, isSuperAdmin, useAuth } from '@/auth/context'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import type { Alerts } from '@/lib/types'
import { ALERTS_KEY, NAV_GROUPS } from '@/nav'

/** Navigation for what the signed-in admin may open, with counts of what's waiting (refreshed every minute). */
export function AppSidebar() {
  const { t } = useI18n()
  const { admin } = useAuth()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const alerts = useQuery({ queryKey: ALERTS_KEY, queryFn: () => api<Alerts>('/admin/alerts'), refetchInterval: 60_000 })
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))
  const allowed = (area?: AdminPermission) => (area ? can(admin, area) : isSuperAdmin(admin))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={`${t.app.brand} ${t.app.name}`}>
              <NavLink to="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-white text-sidebar ring-1 ring-white/30">
                  <ShieldCheck className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{t.app.brand}</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">{t.app.name}</span>
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
              <SidebarMenu className="gap-1.5">
                {items.map(({ to, label, icon: Icon, badge }) => {
                  const count = badge && alerts.data ? badge(alerts.data) : 0
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(to)}
                        tooltip={t.nav[label]}
                        // The current page is a tab joined to the page (styles: .sidebar-tab in @talad/ui globals.css).
                        className="sidebar-tab"
                      >
                        <NavLink to={to} onClick={() => isMobile && setOpenMobile(false)}>
                          <Icon />
                          <span>{t.nav[label]}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {count > 0 && (
                        <SidebarMenuBadge className="rounded-full bg-red-500 px-1.5 text-white ring-2 ring-sidebar peer-hover/menu-button:text-white peer-data-active/menu-button:text-white">
                          {count}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
