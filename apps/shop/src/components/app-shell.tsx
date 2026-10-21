import { SidebarInset, SidebarProvider } from '@talad/ui/components/sidebar'
import { TooltipProvider } from '@talad/ui/components/tooltip'
import { Outlet } from 'react-router'
import { AppSidebar } from './app-sidebar'
import { InstallBanner } from './install-banner'
import { RealtimeBridge } from './realtime-bridge'

/** The sidebar remembers expanded/collapsed in its `sidebar_state` cookie. */
function sidebarDefaultOpen(): boolean {
  return !document.cookie.split('; ').includes('sidebar_state=false')
}

/** Desktop: collapsible sidebar + content. Phones: full-width pages with their own top bar. */
export function AppShell() {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={sidebarDefaultOpen()}>
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-(--page)">
          <Outlet />
        </SidebarInset>
        <InstallBanner />
        <RealtimeBridge />
      </SidebarProvider>
    </TooltipProvider>
  )
}
