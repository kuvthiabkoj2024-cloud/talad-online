import type { AdminPermission } from '@talad/shared'
import {
  BadgePercent,
  BarChart3,
  FileText,
  FolderTree,
  Ruler,
  Gavel,
  Image,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Package,
  Percent,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Truck,
  Undo2,
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
  /** The permission it needs (see auth/context `can`); omitted = Super Admin only. */
  area?: AdminPermission
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
      // Orders waiting for a payment check (the same count as Payments).
      { to: '/orders', label: 'orders', icon: ReceiptText, area: 'orders', badge: (a) => a.paymentsToCheck },
      { to: '/disputes', label: 'disputes', icon: Gavel, area: 'disputes', badge: (a) => a.openDisputes },
    ],
  },
  {
    label: 'groupMoney',
    items: [
      { to: '/payments', label: 'payments', icon: Landmark, area: 'payments', badge: (a) => a.paymentsToCheck },
      { to: '/refunds', label: 'refunds', icon: Undo2, area: 'payments', badge: (a) => a.refundsDue },
      { to: '/payouts', label: 'payouts', icon: Wallet, area: 'payouts', badge: (a) => a.payoutsDue.count },
      { to: '/commissions', label: 'commissions', icon: Percent, area: 'shops.commission', badge: (a) => a.commissionRequests },
      { to: '/coupons', label: 'coupons', icon: BadgePercent, area: 'coupons' },
    ],
  },
  {
    label: 'groupContent',
    items: [
      { to: '/categories', label: 'categories', icon: FolderTree, area: 'catalog' },
      { to: '/units', label: 'units', icon: Ruler, area: 'catalog' },
      { to: '/banners', label: 'banners', icon: Image, area: 'banners' },
      { to: '/pages', label: 'pages', icon: FileText, area: 'pages' },
      { to: '/announcements', label: 'announcements', icon: Megaphone, area: 'announcements' },
    ],
  },
  {
    label: 'groupSystem',
    items: [
      { to: '/delivery', label: 'delivery', icon: Truck, area: 'delivery' },
      { to: '/settings', label: 'settings', icon: Settings, area: 'settings' },
      { to: '/admins', label: 'admins', icon: ShieldCheck },
      { to: '/audit', label: 'audit', icon: ScrollText, area: 'audit' },
    ],
  },
]

/** Query key for the sidebar badge counts; invalidate after a decision that changes them. */
export const ALERTS_KEY = ['admin', 'alerts'] as const
