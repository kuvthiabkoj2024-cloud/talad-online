import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CategoryNode, DeliveryProvider, MyShop, ShopProfile, ShopSummary, Unit } from '@/lib/types'

export const queryKeys = {
  shop: ['shop'] as const,
  summary: ['shop', 'summary'] as const,
  products: ['shop', 'products'] as const,
  product: (id: string) => ['shop', 'products', id] as const,
  coupons: ['shop', 'coupons'] as const,
  orders: ['shop', 'orders'] as const,
  order: (number: string) => ['shop', 'orders', number] as const,
  flashSales: ['shop', 'flash-sales'] as const,
  customers: ['shop', 'customers'] as const,
  reviews: ['shop', 'reviews'] as const,
  profile: ['shop', 'profile'] as const,
}

export const useMyShop = () => useQuery({ queryKey: queryKeys.shop, queryFn: () => api<MyShop>('/me/shop') })

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
