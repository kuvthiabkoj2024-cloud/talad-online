import { formatPhone, normalizePhone, OTP_LENGTH, PHONE_COUNTRY_CODE } from '@talad/shared';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { ThemedText } from '@/components/themed-text';
import { Turnstile, TURNSTILE_SITE_KEY } from '@/components/turnstile';
import { Button, Card } from '@/components/ui';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, type CustomerProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { googleIdToken, googleSignInAvailable } from '@/lib/google-auth';
import { fill, useI18n } from '@/lib/i18n';

type Session = { token: string; customer: CustomerProfile };
type Verified = Session | { twoFactor: { method: 'TOTP' | 'SMS'; challenge: string } };

/**
 * Sign in or sign up, as on the website: with an SMS code or with Google. Sign up asks for a name
 * (a number without an account switches to it too) and shows the terms being agreed to; accounts
 * with two-step verification are asked for that code too. `?next=seller` (Sell on MC Mart) goes on
 * to the shop application afterwards.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { signIn } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const showGoogle = googleSignInAvailable();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [register, setRegister] = useState(false);
  const [step, setStep] = useState<{ kind: 'phone' } | { kind: 'code'; e164: string; devCode?: string } | { kind: 'twoFactor'; challenge: string }>({ kind: 'phone' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Robot check before an SMS is sent (as on the website): one token per request.
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  const flow = register ? 'register' : 'login';

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PHONE_NOT_REGISTERED') {
        setRegister(true);
        setError(t.login.newAccount);
      } else if (e instanceof ApiError && (e.code === 'CAPTCHA_REQUIRED' || e.code === 'CAPTCHA_FAILED')) {
        setError(e.code === 'CAPTCHA_REQUIRED' ? t.login.captchaWait : t.login.captchaFailed);
      } else if (e instanceof ApiError && e.code === 'OTP_DAILY_LIMIT') setError(t.login.dailyLimit);
      else setError(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const e164 = normalizePhone(phone);
      if (!e164) return setError(t.login.invalidPhone);
      if (register && !name.trim()) return setError(t.login.newAccount);
      if (TURNSTILE_SITE_KEY && !captcha) return setError(captchaError ? `${t.login.captchaFailed} (${captchaError})` : t.login.captchaWait);
      const headers: Record<string, string> = captcha ? { 'X-Turnstile-Token': captcha } : {};
      setCaptcha(null);
      setCaptchaReset((n) => n + 1);
      const res = await api<{ devCode?: string }>('/auth/customer/otp/request', {
        method: 'POST',
        body: { phone: e164, flow, ...(register && { name: name.trim() }) },
        headers,
      });
      setCode('');
      setStep({ kind: 'code', e164, devCode: res.devCode });
    });

  const finish = async (res: Verified) => {
    if ('twoFactor' in res) {
      setCode('');
      setStep({ kind: 'twoFactor', challenge: res.twoFactor.challenge });
      return;
    }
    await signIn(res.token, res.customer);
    if (next === 'seller') router.replace(res.customer.shop ? '/seller' : '/seller/register');
    else router.back();
  };

  const withGoogle = () =>
    run(async () => {
      let idToken: string | null;
      try {
        idToken = await googleIdToken();
      } catch (e) {
        return setError(e instanceof Error && e.message === 'PLAY_SERVICES' ? t.login.googlePlayServices : t.login.googleFailed);
      }
      if (!idToken) return;
      await finish(await api<Verified>('/auth/customer/google', { method: 'POST', body: { idToken } }));
    });

  const switchMode = (toRegister: boolean) => {
    setRegister(toRegister);
    setError(null);
    setStep({ kind: 'phone' });
  };

  const verify = () =>
    run(async () => {
      if (step.kind === 'code')
        await finish(
          await api<Verified>('/auth/customer/otp/verify', {
            method: 'POST',
            body: { phone: step.e164, flow, code, ...(register && { name: name.trim() }) },
          }),
        );
      else if (step.kind === 'twoFactor') await finish(await api<Verified>('/auth/customer/2fa/verify', { method: 'POST', body: { challenge: step.challenge, code } }));
    });

  const input = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }];

  return (
    <KeyboardAvoid style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: register ? t.login.signUp : t.login.title }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={[styles.logoWrap, { backgroundColor: theme.primary }]}>
            <Image source={require('@/assets/images/brand-logo.png')} style={styles.logo} contentFit="contain" />
          </View>
          <ThemedText type="title">{t.brand}</ThemedText>
        </View>

        <Card style={styles.card}>
          {step.kind === 'phone' && (
            <View style={[styles.tabs, { backgroundColor: theme.backgroundElement }]} accessibilityRole="tablist">
              {[false, true].map((reg) => (
                <Pressable
                  key={String(reg)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: register === reg }}
                  onPress={() => switchMode(reg)}
                  style={[styles.tab, register === reg && [styles.tabOn, { backgroundColor: theme.card }]]}>
                  <ThemedText type="smallBold" themeColor={register === reg ? 'primary' : 'textSecondary'}>
                    {reg ? t.login.signUp : t.login.signIn}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )}
          {step.kind === 'phone' ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {register ? t.login.signUpSubtitle : t.login.subtitle}
              </ThemedText>
              <ThemedText type="smallBold">{t.login.phone}</ThemedText>
              <View style={[styles.phoneRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <ThemedText type="small" themeColor="textSecondary" style={[styles.prefix, { borderRightColor: theme.border }]}>
                  {PHONE_COUNTRY_CODE}
                </ThemedText>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="20 5555 1234"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  style={[styles.flex, styles.phoneInput, { color: theme.text }]}
                />
              </View>
              {register && (
                <>
                  <ThemedText type="smallBold">{t.login.name}</ThemedText>
                  <TextInput value={name} onChangeText={setName} autoComplete="name" textContentType="name" style={input} />
                </>
              )}
              <Turnstile
                locale={locale}
                action="app-otp"
                resetKey={captchaReset}
                onToken={(token) => {
                  setCaptcha(token);
                  if (token) setCaptchaError(null);
                }}
                onError={setCaptchaError}
              />
              <Button label={t.login.sendCode} loading={busy} onPress={() => void sendCode()} />
              {showGoogle && (
                <>
                  <View style={styles.orRow}>
                    <View style={[styles.line, { backgroundColor: theme.border }]} />
                    <ThemedText type="caption" themeColor="textSecondary">
                      {t.login.or}
                    </ThemedText>
                    <View style={[styles.line, { backgroundColor: theme.border }]} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void withGoogle()}
                    style={({ pressed }) => [styles.google, { borderColor: theme.border, backgroundColor: theme.card }, pressed && styles.pressed]}>
                    <ThemedText style={styles.gMark}>G</ThemedText>
                    <ThemedText type="smallBold">{t.login.withGoogle}</ThemedText>
                  </Pressable>
                </>
              )}
              <View style={styles.switchRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  {register ? t.login.haveAccount : t.login.noAccount}
                </ThemedText>
                <Pressable accessibilityRole="button" onPress={() => switchMode(!register)} hitSlop={8}>
                  <ThemedText type="smallBold" themeColor="primary">
                    {register ? t.login.signIn : t.login.signUp}
                  </ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {step.kind === 'code' ? fill(t.login.codeSent, { phone: formatPhone(step.e164) }) : t.login.twoFactor}
              </ThemedText>
              {step.kind === 'code' && step.devCode && (
                <ThemedText type="smallBold" themeColor="primary">
                  {fill(t.login.devCode, { code: step.devCode })}
                </ThemedText>
              )}
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                placeholder={t.login.code}
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                autoFocus
                style={[input, styles.code]}
              />
              <Button label={t.login.verify} loading={busy} disabled={code.length < OTP_LENGTH} onPress={() => void verify()} />
              <Button label={t.login.changePhone} variant="outline" onPress={() => setStep({ kind: 'phone' })} />
            </>
          )}
          {error && (
            <ThemedText type="small" themeColor={register && step.kind === 'phone' ? 'primary' : 'sale'}>
              {error}
            </ThemedText>
          )}
        </Card>

        <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
          {t.login.termsPrefix}{' '}
          <ThemedText type="caption" themeColor="primary" style={styles.underline} onPress={() => router.push('/pages/terms')}>
            {t.login.termsLink}
          </ThemedText>{' '}
          {t.login.and}{' '}
          <ThemedText type="caption" themeColor="primary" style={styles.underline} onPress={() => router.push('/pages/privacy')}>
            {t.login.privacyLink}
          </ThemedText>
        </ThemedText>

        {next !== 'seller' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.setParams({ next: 'seller' })}
            style={({ pressed }) => [styles.sell, { borderColor: theme.border, backgroundColor: theme.card }, pressed && styles.pressed]}>
            <View style={[styles.sellIcon, { backgroundColor: theme.primarySoft }]}>
              <Icon name="shop" size={22} color={theme.primary} />
            </View>
            <View style={styles.flex}>
              <ThemedText type="caption" themeColor="textSecondary">
                {t.login.sellTitle}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="primary">
                {t.login.sell}
              </ThemedText>
            </View>
            <Icon name="chevron-right" size={18} color={theme.textSecondary} />
          </Pressable>
        )}
        {next === 'seller' && (
          <Card style={[styles.sellNote, { backgroundColor: theme.primarySoft }]}>
            <Icon name="shop" size={20} color={theme.primary} />
            <ThemedText type="small" style={styles.flex}>
              {t.login.sellNote}
            </ThemedText>
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoid>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four, paddingTop: Spacing.five },
  brand: { alignItems: 'center', gap: Spacing.two },
  logoWrap: { width: 72, height: 72, borderRadius: Radius.lg + 4, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 52, height: 52 },
  card: { padding: Spacing.four, gap: Spacing.three },
  phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md, height: 52 },
  prefix: { paddingHorizontal: Spacing.three, borderRightWidth: 1, lineHeight: 50 },
  phoneInput: { fontSize: 16, paddingHorizontal: Spacing.three, fontFamily: FontFamily.regular },
  input: { height: 52, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: 16, fontFamily: FontFamily.regular },
  code: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  tabs: { flexDirection: 'row', borderRadius: Radius.full, padding: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: Radius.full },
  tabOn: { shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  google: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, height: 50, borderWidth: 1, borderRadius: Radius.full },
  gMark: { fontSize: 18, fontWeight: '800', color: '#4285F4' },
  pressed: { opacity: 0.8 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.one },
  center: { textAlign: 'center' },
  underline: { textDecorationLine: 'underline' },
  sell: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderWidth: 1, borderRadius: Radius.lg },
  sellIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sellNote: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
});
