import {
  BarChart3,
  BotMessageSquare,
  House,
  Megaphone,
  Package,
  ReceiptText,
  ShieldCheck,
  Star,
  Store,
  TicketPercent,
  Users,
  Video,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Dict } from '@/i18n/en'

export type NavKey = keyof Dict['nav']

export interface NavItem {
  to: string
  label: NavKey
  icon: LucideIcon
}

/** Sidebar (desktop) groups; the phone home screen shows `TOOLS` as a grid instead. */
export const NAV_GROUPS: { label: NavKey; items: NavItem[] }[] = [
  {
    label: 'groupShop',
    items: [
      { to: '/', label: 'home', icon: House },
      { to: '/products', label: 'products', icon: Package },
      { to: '/videos', label: 'videos', icon: Video },
    ],
  },
  {
    label: 'groupSales',
    items: [
      { to: '/orders', label: 'orders', icon: ReceiptText },
      { to: '/coupons', label: 'coupons', icon: TicketPercent },
      { to: '/marketing', label: 'marketing', icon: Megaphone },
      { to: '/customers', label: 'customers', icon: Users },
    ],
  },
  {
    label: 'groupInsights',
    items: [
      { to: '/finance', label: 'finance', icon: Wallet },
      { to: '/stats', label: 'stats', icon: BarChart3 },
      { to: '/reviews', label: 'reviews', icon: Star },
      { to: '/chatbot', label: 'chatbot', icon: BotMessageSquare },
    ],
  },
  {
    label: 'groupSettings',
    items: [
      { to: '/profile', label: 'profile', icon: Store },
      { to: '/security', label: 'security', icon: ShieldCheck },
    ],
  },
]

/** Phone home-screen tool grid, in the order sellers reach for them. */
export const TOOLS: NavItem[] = [
  { to: '/products', label: 'products', icon: Package },
  { to: '/orders', label: 'orders', icon: ReceiptText },
  { to: '/finance', label: 'finance', icon: Wallet },
  { to: '/stats', label: 'stats', icon: BarChart3 },
  { to: '/videos', label: 'videos', icon: Video },
  { to: '/chatbot', label: 'chatbot', icon: BotMessageSquare },
  { to: '/coupons', label: 'coupons', icon: TicketPercent },
  { to: '/marketing', label: 'marketing', icon: Megaphone },
]

/** Sections that aren't built yet; they render the "coming soon" page. */
export const COMING_SOON: NavItem[] = NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.to === '/chatbot')
