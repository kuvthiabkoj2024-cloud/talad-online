import { formatPhone, normalizePhone, OTP_LENGTH, PHONE_COUNTRY_CODE } from '@talad/shared';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Turnstile, TURNSTILE_SITE_KEY } from '@/components/turnstile';
import { Button, Card } from '@/components/ui';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, type CustomerProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fill, useI18n } from '@/lib/i18n';

type Session = { token: string; customer: CustomerProfile };
type Verified = Session | { twoFactor: { method: 'TOTP' | 'SMS'; challenge: string } };

/**
 * Sign in with an SMS code, as on the website. A number without an account gets a name field
 * and signs up instead; accounts with two-step verification are asked for that code too.
 */
export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { signIn } = useAuth();
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
    router.back();
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: t.login.title }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={[styles.logoWrap, { backgroundColor: theme.primary }]}>
            <Image source={require('@/assets/images/brand-logo.png')} style={styles.logo} contentFit="contain" />
          </View>
          <ThemedText type="title">{t.brand}</ThemedText>
        </View>

        <Card style={styles.card}>
          {step.kind === 'phone' ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {t.login.subtitle}
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
      </ScrollView>
    </KeyboardAvoidingView>
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
});
