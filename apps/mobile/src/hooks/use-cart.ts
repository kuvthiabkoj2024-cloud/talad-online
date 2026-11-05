import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type CartView } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export const CART_KEY = ['me', 'cart'] as const;

/** The signed-in customer's cart (nothing while signed out). */
export function useCart() {
  const { customer } = useAuth();
  return useQuery({ queryKey: CART_KEY, queryFn: () => api<CartView>('/me/cart'), enabled: !!customer });
}

/** Items in the cart, for the tab badge. */
export function useCartCount() {
  return useCart().data?.count ?? 0;
}

/** Add, change and remove cart lines; the cart reloads after each. */
export function useCartActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: CART_KEY });
  return {
    add: useMutation({
      mutationFn: (input: { productId: string; variantId: string | null; quantity: number }) =>
        api<{ itemId: string; count: number }>('/me/cart/items', {
          method: 'POST',
          body: { productId: input.productId, quantity: input.quantity, ...(input.variantId && { variantId: input.variantId }) },
        }),
      onSuccess: refresh,
    }),
    setQuantity: useMutation({
      mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
        api(`/me/cart/items/${itemId}`, { method: 'PATCH', body: { quantity } }),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (itemId: string) => api(`/me/cart/items/${itemId}`, { method: 'DELETE' }),
      onSettled: refresh,
    }),
  };
}
