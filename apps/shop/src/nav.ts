import {
  BadgePercent,
  LayoutDashboard,
  Package,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/promotions', label: 'Promotions', icon: BadgePercent },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/reviews', label: 'Reviews', icon: Star },
  { to: '/profile', label: 'Shop profile', icon: Store },
  { to: '/security', label: 'Security', icon: ShieldCheck },
]
