import {
  BotMessageSquare,
  HandCoins,
  House,
  Megaphone,
  MessagesSquare,
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

/** Sidebar groups (a slide-out menu on phones). */
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
      { to: '/cod', label: 'cod', icon: HandCoins },
      { to: '/messages', label: 'messages', icon: MessagesSquare },
      { to: '/coupons', label: 'coupons', icon: TicketPercent },
      { to: '/marketing', label: 'marketing', icon: Megaphone },
      { to: '/customers', label: 'customers', icon: Users },
    ],
  },
  {
    label: 'groupInsights',
    items: [
      { to: '/finance', label: 'finance', icon: Wallet },
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

/** Sections that aren't built yet; they render the "coming soon" page. */
export const COMING_SOON: NavItem[] = []
