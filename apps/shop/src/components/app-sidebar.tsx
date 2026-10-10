import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@talad/ui/components/sidebar'
import { Store } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { useAuth } from '@/auth/context'
import { useMyShop } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { NAV_GROUPS } from '@/nav'

/**
 * Desktop navigation. Collapses to an icon rail (tooltips show the labels) with the
 * header button, the edge rail or Ctrl/⌘+B; on phones it's an off-canvas sheet.
 */
export function AppSidebar() {
  const { t } = useI18n()
  const { account } = useAuth()
  const { data: shop } = useMyShop()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={shop?.name ?? t.app.name}>
              <NavLink to="/">
                <span className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
                  {shop?.logoUrl ? <img src={shop.logoUrl} alt="" className="size-full object-cover" /> : <Store className="size-4" />}
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{shop?.name ?? account?.shop?.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t.app.brand} {t.app.name}
                  </span>
                </span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{t.nav[group.label]}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map(({ to, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton asChild isActive={isActive(to)} tooltip={t.nav[label]}>
                    <NavLink to={to} onClick={() => isMobile && setOpenMobile(false)}>
                      <Icon />
                      <span>{t.nav[label]}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
