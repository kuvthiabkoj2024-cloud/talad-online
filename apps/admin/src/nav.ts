import {
  BadgePercent,
  BarChart3,
  FileText,
  FolderTree,
  Gavel,
  Image,
  LayoutDashboard,
  Megaphone,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Dict } from '@/i18n/en'
import type { Alerts } from '@/lib/types'

export type NavKey = keyof Dict['nav']

export interface NavItem {
  to: string
  label: NavKey
  icon: LucideIcon
  /** Area in auth/context ACCESS; omitted = Super Admin only. */
  area?: string
  /** Sidebar badge from /admin/alerts. */
  badge?: (a: Alerts) => number
}

export const NAV_GROUPS: { label: NavKey; items: NavItem[] }[] = [
  {
    label: 'groupOverview',
    items: [
      { to: '/', label: 'dashboard', icon: LayoutDashboard, area: 'dashboard' },
      { to: '/reports', label: 'reports', icon: BarChart3, area: 'reports' },
    ],
  },
  {
    label: 'groupMarketplace',
    items: [
      { to: '/shops', label: 'shops', icon: Store, area: 'shops', badge: (a) => a.pendingShops },
      { to: '/products', label: 'products', icon: Package, area: 'products', badge: (a) => a.pendingProducts },
      { to: '/customers', label: 'customers', icon: Users, area: 'customers' },
      { to: '/orders', label: 'orders', icon: ReceiptText, area: 'orders' },
      { to: '/disputes', label: 'disputes', icon: Gavel, area: 'disputes', badge: (a) => a.openDisputes },
    ],
  },
  {
    label: 'groupMoney',
    items: [
      { to: '/payouts', label: 'payouts', icon: Wallet, area: 'payouts', badge: (a) => a.payoutsDue.count },
      { to: '/coupons', label: 'coupons', icon: BadgePercent },
    ],
  },
  {
    label: 'groupContent',
    items: [
      { to: '/catalog', label: 'catalog', icon: FolderTree },
      { to: '/banners', label: 'banners', icon: Image },
      { to: '/pages', label: 'pages', icon: FileText },
      { to: '/announcements', label: 'announcements', icon: Megaphone },
    ],
  },
  {
    label: 'groupSystem',
    items: [
      { to: '/delivery', label: 'delivery', icon: Truck },
      { to: '/settings', label: 'settings', icon: Settings },
      { to: '/admins', label: 'admins', icon: ShieldCheck },
      { to: '/audit', label: 'audit', icon: ScrollText },
    ],
  },
]

/** Query key for the sidebar badge counts; invalidate after a decision that changes them. */
export const ALERTS_KEY = ['admin', 'alerts'] as const
