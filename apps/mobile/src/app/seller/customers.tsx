import { formatPhone, type OrderStatus } from '@talad/shared';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { OrderStatusPill } from '@/components/seller/order-status';
import { Sheet } from '@/components/seller/sheet';
import { Choices, SellerScroll, sellerStyles } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useSellerI18n } from '@/lib/seller-i18n';

interface ShopCustomer {
  id: string;
  name: string;
  phone: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
  note: string | null;
  blacklisted: boolean;
}
interface ShopCustomerList {
  items: ShopCustomer[];
  page: number;
  totalPages: number;
}

/** People who bought from the shop (§3.5), with private notes and a block list. */
export default function SellerCustomersScreen() {
  const theme = useTheme();
  const { s, locale } = useSellerI18n();
  const c = s.customers;
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [blocked, setBlocked] = useState<'all' | 'blocked'>('all');
  const [open, setOpen] = useState<ShopCustomer | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(id);
  }, [typed]);

  const list = useInfiniteQuery({
    queryKey: ['seller', 'customers', q, blocked],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ page: String(pageParam), pageSize: '20' });
      if (q) query.set('q', q);
      if (blocked === 'blocked') query.set('blacklisted', 'true');
      return api<ShopCustomerList>(`/me/shop/customers?${query}`);
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <Stack.Screen options={{ title: c.title }} />
      <SellerScroll loading={list.isPending} error={list.isError} refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
        <Input value={typed} onChangeText={setTyped} placeholder={c.searchPlaceholder} autoCorrect={false} />
        <Choices
          value={blocked}
          onChange={setBlocked}
          options={[
            { key: 'all', label: s.orders.tabs.all },
            { key: 'blocked', label: c.onlyBlocked },
          ]}
        />
        {list.data && !items.length && <EmptyState icon="users" title={c.emptyTitle} body={c.emptyBody} />}
        {items.length > 0 && (
          <Card>
            {items.map((cu, i) => (
              <Pressable
                key={cu.id}
                accessibilityRole="button"
                onPress={() => setOpen(cu)}
                style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.avatar, { backgroundColor: cu.blacklisted ? '#fee2e2' : theme.primarySoft }]}>
                  <ThemedText type="smallBold" style={{ color: cu.blacklisted ? '#b91c1c' : theme.primary }}>
                    {cu.name.slice(0, 1).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.flex}>
                  <View style={styles.inline}>
                    <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
                      {cu.name}
                    </ThemedText>
                    {cu.blacklisted && (
                      <ThemedText type="caption" themeColor="sale">
                        · {c.blocked}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                    {c.orders} {cu.orderCount} · {c.lastOrder} {date(cu.lastOrderAt, locale)}
                  </ThemedText>
                  {cu.note && (
                    <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                      📝 {cu.note}
                    </ThemedText>
                  )}
                </View>
                <ThemedText type="smallBold" themeColor="primary">
                  {money(cu.totalSpent)}
                </ThemedText>
              </Pressable>
            ))}
          </Card>
        )}
        {list.hasNextPage && <Button label={s.orders.loadMore} variant="outline" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />}
      </SellerScroll>
      {open && <CustomerSheet customer={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** One customer: call them, the private note, blocking, and their recent orders here. */
function CustomerSheet({ customer: cu, onClose }: { customer: ShopCustomer; onClose: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { s, locale } = useSellerI18n();
  const c = s.customers;
  const [note, setNote] = useState(cu.note ?? '');
  const [blacklisted, setBlacklisted] = useState(cu.blacklisted);
  const [saving, setSaving] = useState(false);
  const orders = useQuery({
    queryKey: ['seller', 'customer-orders', cu.id],
    queryFn: () => api<{ number: string; status: OrderStatus; total: number; createdAt: string }[]>(`/me/shop/customers/${cu.id}/orders`),
  });

  async function save() {
    setSaving(true);
    try {
      await api(`/me/shop/customers/${cu.id}`, { method: 'PUT', body: { note: note.trim() || null, blacklisted } });
      void queryClient.invalidateQueries({ queryKey: ['seller', 'customers'] });
      onClose();
      Alert.alert(c.saved);
    } catch {
      Alert.alert(s.common.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible title={cu.name} onClose={onClose}>
      {cu.phone && (
        <ThemedText type="small" themeColor="primary">
          📞 {formatPhone(cu.phone)}
        </ThemedText>
      )}
      <Field label={c.note}>
        <Input value={note} onChangeText={setNote} placeholder={c.notePlaceholder} multiline maxLength={1000} style={styles.multiline} />
      </Field>
      <View style={styles.block}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{c.block}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {c.blockHint}
          </ThemedText>
        </View>
        <Switch value={blacklisted} onValueChange={setBlacklisted} trackColor={{ true: theme.sale }} />
      </View>
      <Button label={s.common.save} loading={saving} onPress={() => void save()} />
      <ThemedText type="smallBold">{c.recentOrders}</ThemedText>
      {orders.data?.map((o) => (
        <Pressable
          key={o.number}
          accessibilityRole="button"
          onPress={() => {
            onClose();
            router.push(`/seller/orders/${encodeURIComponent(o.number)}`);
          }}
          style={[sellerStyles.card, styles.order, { borderColor: theme.border }]}>
          <View style={styles.flex}>
            <ThemedText type="smallBold">{o.number}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {date(o.createdAt, locale)} · {money(o.total)}
            </ThemedText>
          </View>
          <OrderStatusPill status={o.status} />
          <Icon name="chevron-right" size={16} color={theme.textSecondary} />
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: Spacing.two },
  block: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  order: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
});
