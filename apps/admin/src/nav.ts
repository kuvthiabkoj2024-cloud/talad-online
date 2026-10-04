import {
  BadgePercent,
  ChartColumn,
  FileText,
  FolderTree,
  LayoutDashboard,
  Package,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/shops', label: 'Shops', icon: Store },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/categories', label: 'Categories', icon: FolderTree },
  { to: '/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/delivery', label: 'Delivery', icon: Truck },
  { to: '/promotions', label: 'Promotions', icon: BadgePercent },
  { to: '/disputes', label: 'Disputes', icon: ShieldAlert },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
  { to: '/cms', label: 'Content', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]
