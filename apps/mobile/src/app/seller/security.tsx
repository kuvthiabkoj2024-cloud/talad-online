import { ACCOUNT_PASSWORD, formatPhone } from '@talad/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Sheet } from '@/components/seller/sheet';
import { SellerScroll, sellerStyles } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
import { date } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

interface SecurityStatus {
  hasPassword: boolean;
  twoFactor: 'NONE' | 'TOTP' | 'SMS';
  phone: string | null;
  email: string | null;
}
interface SessionRow {
  id: string;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  active: boolean;
  current: boolean;
}

/** The account's password, two-step verification and signed-in devices (§3.1). */
export default function SellerSecurityScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { s, locale } = useSellerI18n();
  const t = s.security;
  const status = useQuery({ queryKey: ['me', 'security'], queryFn: () => api<SecurityStatus>('/me/security') });
  const sessions = useQuery({ queryKey: ['me', 'sessions'], queryFn: () => api<SessionRow[]>('/me/sessions') });
  const [sheet, setSheet] = useState<'password' | 'totp' | 'off' | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = status.data;

  const fail = (e: unknown) => {
    const key = e instanceof ApiError ? e.code : undefined;
    Alert.alert((key && (t.errors as Record<string, string>)[key]) || s.common.saveError);
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['me', 'security'] });
    void queryClient.invalidateQueries({ queryKey: ['me', 'sessions'] });
  };
  const close = () => {
    setSheet(null);
    setCurrent('');
    setNext('');
    setCode('');
    setSetup(null);
  };

  async function run(task: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await task();
      refresh();
      close();
      if (done) Alert.alert(done);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function startTotp() {
    try {
      setSetup(await api<{ secret: string; qr: string }>('/me/security/totp/setup', { method: 'POST' }));
      setSheet('totp');
    } catch (e) {
      fail(e);
    }
  }

  async function startOff() {
    // SMS needs a fresh code sent first; an authenticator already shows one.
    if (d?.twoFactor === 'SMS') {
      try {
        await api('/me/security/code', { method: 'POST' });
      } catch (e) {
        return fail(e);
      }
    }
    setSheet('off');
  }

  function signOut(id?: string) {
    void (id ? api(`/me/sessions/${id}`, { method: 'DELETE' }) : api<{ revoked: number }>('/me/sessions/revoke-others', { method: 'POST' }))
      .then((r) => {
        refresh();
        if (!id && r && typeof r === 'object') Alert.alert(fill(t.signedOutOthers, { n: (r as { revoked: number }).revoked }));
      })
      .catch(fail);
  }

  const others = sessions.data?.filter((x) => x.active && !x.current) ?? [];
  const self = sessions.data?.find((x) => x.current);

  return (
    <>
      <Stack.Screen options={{ title: t.title }} />
      <SellerScroll loading={status.isPending} error={status.isError} refreshing={status.isRefetching} onRefresh={refresh}>
        {d && (
          <>
            <Card style={sellerStyles.card}>
              <ThemedText type="smallBold">{t.password}</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {d.hasPassword ? t.passwordOn : t.passwordOff}
              </ThemedText>
              <Button label={d.hasPassword ? t.changePassword : t.setPassword} variant="outline" onPress={() => setSheet('password')} style={styles.small} />
            </Card>

            <Card style={sellerStyles.card}>
              <View style={styles.head}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {t.twoFactor}
                </ThemedText>
                <ThemedText type="caption" style={{ color: d.twoFactor === 'NONE' ? theme.textSecondary : theme.primary, fontWeight: '700' }}>
                  {d.twoFactor === 'NONE' ? t.off : t.on}
                </ThemedText>
              </View>
              <ThemedText type="caption" themeColor="textSecondary">
                {t.twoFactorHint}
              </ThemedText>
              <View style={[styles.method, { borderColor: theme.border }]}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{t.totp}</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {t.totpBody}
                  </ThemedText>
                </View>
                {d.twoFactor === 'TOTP' ? (
                  <Button label={t.turnOff} variant="outline" onPress={() => void startOff()} style={styles.small} />
                ) : (
                  <Button label={t.setUpTotp} variant="outline" disabled={d.twoFactor !== 'NONE'} onPress={() => void startTotp()} style={styles.small} />
                )}
              </View>
              <View style={[styles.method, { borderColor: theme.border }]}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{t.sms}</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {fill(t.smsBody, { phone: d.phone ? formatPhone(d.phone) : '—' })}
                  </ThemedText>
                </View>
                {d.twoFactor === 'SMS' ? (
                  <Button label={t.turnOff} variant="outline" onPress={() => void startOff()} style={styles.small} />
                ) : (
                  <Button
                    label={t.useSms}
                    variant="outline"
                    disabled={d.twoFactor !== 'NONE'}
                    loading={busy && sheet === null}
                    onPress={() => void run(() => api('/me/security/sms/enable', { method: 'POST' }), t.enabled)}
                    style={styles.small}
                  />
                )}
              </View>
              {d.twoFactor !== 'NONE' && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {t.switchHint}
                </ThemedText>
              )}
            </Card>

            <Card style={sellerStyles.card}>
              <ThemedText type="smallBold">{t.devices}</ThemedText>
              {self && (
                <ThemedText type="small">
                  ✓ {t.thisDevice} · {fill(t.signedIn, { date: date(self.createdAt, locale) })}
                </ThemedText>
              )}
              {!others.length && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {t.noOthers}
                </ThemedText>
              )}
              {others.map((x) => (
                <View key={x.id} style={[styles.method, { borderColor: theme.border }]}>
                  <View style={styles.flex}>
                    <ThemedText type="small" numberOfLines={1}>
                      {x.userAgent ?? t.unknownDevice}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary">
                      {fill(t.signedIn, { date: date(x.createdAt, locale) })} · {fill(t.expires, { date: date(x.expiresAt, locale) })}
                    </ThemedText>
                  </View>
                  <Button label={t.signOut} variant="outline" onPress={() => signOut(x.id)} style={styles.small} />
                </View>
              ))}
              {others.length > 0 && <Button label={t.signOutOthers} variant="outline" onPress={() => signOut()} />}
            </Card>
          </>
        )}
      </SellerScroll>

      <Sheet visible={sheet === 'password'} title={d?.hasPassword ? t.changePassword : t.setPassword} onClose={close}>
        {d?.hasPassword && (
          <Field label={t.currentPassword}>
            <Input value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
          </Field>
        )}
        <Field label={t.newPassword} hint={fill(t.passwordHint, { n: ACCOUNT_PASSWORD.min })}>
          <Input value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
        </Field>
        <Button
          label={s.common.save}
          loading={busy}
          disabled={next.length < ACCOUNT_PASSWORD.min}
          onPress={() => void run(() => api('/me/security/password', { method: 'PUT', body: { ...(d?.hasPassword && { current }), password: next } }), t.passwordSaved)}
        />
      </Sheet>

      <Sheet visible={sheet === 'totp'} title={t.scanTitle} onClose={close}>
        <ThemedText type="small" themeColor="textSecondary">
          {t.scanBody}
        </ThemedText>
        {setup && (
          <>
            <Image source={setup.qr} style={styles.qr} contentFit="contain" />
            <ThemedText type="caption" themeColor="textSecondary">
              {t.setupKey}
            </ThemedText>
            <ThemedText type="smallBold" selectable>
              {setup.secret}
            </ThemedText>
          </>
        )}
        <Field label={t.code}>
          <Input value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" />
        </Field>
        <Button label={t.turnOn} loading={busy} disabled={code.length !== 6} onPress={() => void run(() => api('/me/security/totp/enable', { method: 'POST', body: { code } }), t.enabled)} />
      </Sheet>

      <Sheet visible={sheet === 'off'} title={t.turnOffTitle} onClose={close}>
        <ThemedText type="small" themeColor="textSecondary">
          {d?.twoFactor === 'SMS' ? t.turnOffSms : t.turnOffTotp}
        </ThemedText>
        <Field label={t.code}>
          <Input value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" />
        </Field>
        <Button label={t.turnOff} loading={busy} disabled={code.length !== 6} onPress={() => void run(() => api('/me/security/2fa/disable', { method: 'POST', body: { code } }), t.disabled)} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  small: { minHeight: 38, paddingHorizontal: Spacing.three, alignSelf: 'flex-start' },
  method: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  qr: { width: 200, height: 200, alignSelf: 'center' },
});
