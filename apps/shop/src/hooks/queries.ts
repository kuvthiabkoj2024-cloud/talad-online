import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api, send } from '@/lib/api'
import type { CategoryNode, DeliveryProvider, MyShop, ShopProfile, ShopSummary, Unit } from '@/lib/types'

export const queryKeys = {
  shop: ['shop'] as const,
  summary: ['shop', 'summary'] as const,
  products: ['shop', 'products'] as const,
  videos: ['shop', 'videos'] as const,
  product: (id: string) => ['shop', 'products', id] as const,
  coupons: ['shop', 'coupons'] as const,
  orders: ['shop', 'orders'] as const,
  order: (number: string) => ['shop', 'orders', number] as const,
  flashSales: ['shop', 'flash-sales'] as const,
  customers: ['shop', 'customers'] as const,
  reviews: ['shop', 'reviews'] as const,
  profile: ['shop', 'profile'] as const,
  conversations: ['shop', 'conversations'] as const,
  conversation: (id: string) => ['shop', 'conversations', id] as const,
  unreadMessages: ['shop', 'conversations', 'unread'] as const,
  chatbot: ['shop', 'chatbot'] as const,
  notifications: ['shop', 'notifications'] as const,
  notificationsUnread: ['shop', 'notifications', 'unread'] as const,
  /** Under `notifications`, so live events and the bell refresh it too. */
  badges: ['shop', 'notifications', 'badges'] as const,
}

export const useMyShop = () => useQuery({ queryKey: queryKeys.shop, queryFn: () => api<MyShop>('/me/shop') })

/** "New" counts on the Orders and Videos tiles (unread order / video-activity notifications). */
export const useShopBadges = () =>
  useQuery({ queryKey: queryKeys.badges, queryFn: () => api<{ orders: number; videos: number }>('/me/shop/notifications/badges') })

/** Opening a section clears its badge (and those notifications in the bell). */
export function useClearBadge(section: 'orders' | 'videos') {
  const queryClient = useQueryClient()
  const { data } = useShopBadges()
  const pending = (data?.[section] ?? 0) > 0
  useEffect(() => {
    if (!pending) return
    void send('POST', `/me/shop/notifications/read-section/${section}`).then(() => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }))
  }, [pending, section, queryClient])
}

export const useShopSummary = () =>
  useQuery({ queryKey: queryKeys.summary, queryFn: () => api<ShopSummary>('/me/shop/summary') })

/** Reference data: rarely changes, so cached for the session. */
export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories'), staleTime: Infinity })

export const useUnits = () => useQuery({ queryKey: ['units'], queryFn: () => api<Unit[]>('/units'), staleTime: Infinity })

export const useShopProfile = () =>
  useQuery({ queryKey: queryKeys.profile, queryFn: () => api<ShopProfile>('/me/shop/profile') })

export const useDeliveryProviders = () =>
  useQuery({
    queryKey: ['delivery-providers'],
    queryFn: () => api<DeliveryProvider[]>('/me/shop/orders/delivery-providers'),
    staleTime: Infinity,
  })

/** Unread customer messages, for the Messages badge (checked every 30 s). */
export const useUnreadMessages = () =>
  useQuery({
    queryKey: queryKeys.unreadMessages,
    queryFn: () => api<{ count: number }>('/me/shop/conversations/unread-count'),
    refetchInterval: 30_000,
    select: (d) => d.count,
  })
