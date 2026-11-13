import { LAO_BANKS, type BankCode } from '@talad/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PrivateImage } from '@/components/seller/private-image';
import { KeyValue, SellerScroll, sellerStyles } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

interface CodMonth {
  month: string;
  orders: number;
  sales: number;
  commission: number;
  rate: number;
  credit: number;
  toTransfer: number;
  inProgress: { orders: number; sales: number };
  items: { number: string; completedAt: string; customer: string; sales: number; commission: number }[];
  account: { bankCode: string | null; accountName: string | null; accountNumber: string | null; hasQr: boolean } | null;
}

const MONTHS: Record<'lo' | 'en', string[]> = {
  lo: ['ມັງກອນ', 'ກຸມພາ', 'ມີນາ', 'ເມສາ', 'ພຶດສະພາ', 'ມິຖຸນາ', 'ກໍລະກົດ', 'ສິງຫາ', 'ກັນຍາ', 'ຕຸລາ', 'ພະຈິກ', 'ທັນວາ'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
/** `YYYY-MM`, `back` months ago. */
const monthKey = (back: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Cash on delivery (§3.6): the shop keeps the cash, so at the end of each month it transfers
 * MC Mart's commission on that month's completed COD sales.
 */
export default function SellerCodScreen() {
  const theme = useTheme();
  const { s, locale } = useSellerI18n();
  const c = s.codOrders;
  const [back, setBack] = useState(0);
  const [qr, setQr] = useState(false);
  const month = monthKey(back);
  const data = useQuery({ queryKey: ['seller', 'cod', month], queryFn: () => api<CodMonth>(`/me/shop/cod?month=${month}`) });
  const d = data.data;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).toISOString();

  return (
    <>
      <Stack.Screen options={{ title: c.title }} />
      <SellerScroll loading={data.isPending} error={data.isError} refreshing={data.isRefetching} onRefresh={() => void data.refetch()}>
        <Card style={[sellerStyles.card, styles.months]}>
          <Pressable accessibilityRole="button" onPress={() => setBack((b) => Math.min(b + 1, 11))} hitSlop={8} disabled={back >= 11}>
            <Icon name="back" size={20} color={back >= 11 ? theme.border : theme.primary} />
          </Pressable>
          <ThemedText type="smallBold" style={styles.center}>
            {MONTHS[locale][m - 1]} {y}
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={() => setBack((b) => Math.max(b - 1, 0))} hitSlop={8} disabled={back === 0}>
            <Icon name="chevron-right" size={22} color={back === 0 ? theme.border : theme.primary} />
          </Pressable>
        </Card>
        {d && (
          <>
            <Card style={sellerStyles.card}>
              <KeyValue label={c.sales} value={money(d.sales)} />
              <ThemedText type="caption" themeColor="textSecondary">
                {fill(c.salesHint, { n: d.orders })}
              </ThemedText>
              <KeyValue label={c.commission} value={money(d.commission)} />
              <ThemedText type="caption" themeColor="textSecondary">
                {fill(c.rate, { rate: d.rate })}
              </ThemedText>
              {d.credit > 0 && <KeyValue label={c.credit} value={`−${money(d.credit)}`} muted />}
              <KeyValue
                label={d.toTransfer >= 0 ? c.toTransfer : c.weOwe}
                value={money(Math.abs(d.toTransfer))}
                strong
                color={d.toTransfer >= 0 ? theme.sale : theme.primary}
              />
              <ThemedText type="caption" themeColor="textSecondary">
                {d.toTransfer >= 0 ? fill(back === 0 ? c.dueEnd : c.dueBy, { date: date(lastDay, locale) }) : c.weOweHint}
              </ThemedText>
              {d.inProgress.orders > 0 && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {fill(c.inProgress, { n: d.inProgress.orders, amount: money(d.inProgress.sales) })}
                </ThemedText>
              )}
            </Card>

            {d.account && d.toTransfer > 0 && (
              <Card style={sellerStyles.card}>
                <ThemedText type="smallBold">{c.payTo}</ThemedText>
                {d.account.bankCode && (
                  <ThemedText type="small">{d.account.bankCode in LAO_BANKS ? LAO_BANKS[d.account.bankCode as BankCode] : d.account.bankCode}</ThemedText>
                )}
                {d.account.accountName && <ThemedText type="small">{d.account.accountName}</ThemedText>}
                {d.account.accountNumber && (
                  <ThemedText type="subtitle" selectable>
                    {d.account.accountNumber}
                  </ThemedText>
                )}
                {d.account.hasQr && <Button label="QR" icon="qr" variant="outline" onPress={() => setQr(true)} />}
                <ThemedText type="caption" themeColor="textSecondary">
                  {c.note}
                </ThemedText>
              </Card>
            )}

            <Card style={sellerStyles.card}>
              <ThemedText type="smallBold">{c.orders}</ThemedText>
              {d.items.length ? (
                d.items.map((o) => (
                  <View key={o.number} style={[styles.order, { borderTopColor: theme.border }]}>
                    <View style={styles.flex}>
                      <ThemedText type="small">{o.number}</ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {o.customer} · {date(o.completedAt, locale)}
                      </ThemedText>
                    </View>
                    <View style={styles.right}>
                      <ThemedText type="smallBold">{money(o.sales)}</ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {c.orderCommission} {money(o.commission)}
                      </ThemedText>
                    </View>
                  </View>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {c.empty}
                </ThemedText>
              )}
            </Card>
          </>
        )}
      </SellerScroll>
      <PrivateImage path={qr ? '/me/shop/cod/payment-qr' : null} onClose={() => setQr(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, textAlign: 'center' },
  months: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two + 2 },
  order: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  right: { alignItems: 'flex-end' },
});
