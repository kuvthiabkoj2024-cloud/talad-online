import { ACCOUNT_PASSWORD, formatPhone, normalizePhone, OTP_LENGTH, PHONE_COUNTRY_CODE } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { AuthLayout } from '@talad/ui/components/auth-layout'
import { Input } from '@talad/ui/components/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@talad/ui/components/input-otp'
import { Label } from '@talad/ui/components/label'
import { Tabs, TabsList, TabsTrigger } from '@talad/ui/components/tabs'
import { ArrowLeft, ChartNoAxesColumnIncreasing, LoaderCircle, PackagePlus, ShieldCheck, Store, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/context'
import { useI18n } from '@/i18n/context'
import { ApiError, send } from '@/lib/api'
import { fill } from '@/lib/format'
import type { Account } from '@/lib/types'

type AuthErrorKey = keyof ReturnType<typeof useI18n>['t']['auth']['errors']

/** Clock reads for the resend countdown (event handlers and timers only). */
const clock = () => Date.now()
const fromNow = (seconds: number) => clock() + seconds * 1000

interface OtpSent {
  phone: string
  resendAfterSeconds: number
  /** Only outside production, for testing without SMS. */
  devCode?: string
}

interface Challenge {
  method: 'TOTP' | 'SMS'
  challenge: string
  phoneHint: string | null
  devCode?: string
}

type SignInResponse = { token: string; customer: Account } | { twoFactor: Challenge }

type Step =
  | { kind: 'start' }
  | { kind: 'code'; sent: OtpSent }
  | { kind: 'forgot' }
  | { kind: 'reset'; sent: OtpSent }
  | { kind: 'twoFactor'; challenge: Challenge }

/**
 * Seller Center sign-in or sign-up (§3.1): one Taladonline account shops and sells. Sign in
 * with an SMS code or a password; accounts with two-step verification enter a second code.
 */
export function LoginPage() {
  const { t, locale, setLocale } = useI18n()
  const { account, signIn } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [method, setMethod] = useState<'code' | 'password'>('code')
  const [step, setStep] = useState<Step>({ kind: 'start' })
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const [pending, setPending] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(clock)

  useEffect(() => {
    if (resendAt <= now) return
    const id = setInterval(() => setNow(clock()), 1000)
    return () => clearInterval(id)
  }, [resendAt, now])

  if (account) return <Navigate to={from} replace />

  const register = mode === 'register'
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000))

  /** Runs a request with the shared pending/error handling. */
  async function run(fn: () => Promise<void>) {
    setError(null)
    setPending(true)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof ApiError && e.code && e.code in t.auth.errors ? (e.code as AuthErrorKey) : 'generic')
      if (e instanceof ApiError && typeof e.body.retryAfter === 'number') startCooldown(e.body.retryAfter)
      setCode('')
    } finally {
      setPending(false)
    }
  }

  function startCooldown(seconds: number) {
    setResendAt(fromNow(seconds))
    setNow(clock())
  }

  function go(next: Step) {
    setStep(next)
    setCode('')
    setError(null)
  }

  function finish(res: SignInResponse) {
    if ('twoFactor' in res) {
      go({ kind: 'twoFactor', challenge: res.twoFactor })
      if (res.twoFactor.method === 'SMS') startCooldown(60)
      return
    }
    signIn(res.token, res.customer)
    navigate(from, { replace: true })
  }

  const identity = () => (register ? { phone, flow: mode, name: name.trim() } : { phone, flow: mode })

  const requestCode = () =>
    run(async () => {
      if (register && name.trim().length < 2) throw new ApiError(400, { code: 'nameRequired' })
      if (!normalizePhone(phone)) throw new ApiError(400, { code: 'INVALID_PHONE' })
      const sent = await send<OtpSent>('POST', '/auth/customer/otp/request', identity())
      go({ kind: 'code', sent })
      startCooldown(sent.resendAfterSeconds)
    })

  const verifyCode = (value = code) =>
    value.length === OTP_LENGTH &&
    run(async () => finish(await send<SignInResponse>('POST', '/auth/customer/otp/verify', { ...identity(), code: value })))

  const passwordLogin = () =>
    run(async () => finish(await send<SignInResponse>('POST', '/auth/customer/password/login', { identifier: identifier.trim(), password })))

  const verifyTwoFactor = (challenge: Challenge, value = code) =>
    value.length === OTP_LENGTH &&
    run(async () => finish(await send<SignInResponse>('POST', '/auth/customer/2fa/verify', { challenge: challenge.challenge, code: value })))

  const resendTwoFactor = (challenge: Challenge) =>
    run(async () => {
      const next = await send<Challenge>('POST', '/auth/customer/2fa/resend', { challenge: challenge.challenge })
      go({ kind: 'twoFactor', challenge: next })
      startCooldown(60)
    })

  const requestReset = () =>
    run(async () => {
      if (!normalizePhone(phone)) throw new ApiError(400, { code: 'INVALID_PHONE' })
      const sent = await send<OtpSent>('POST', '/auth/customer/password/forgot', { phone })
      go({ kind: 'reset', sent })
      startCooldown(sent.resendAfterSeconds)
    })

  const reset = () =>
    run(async () => {
      if (newPassword.length < ACCOUNT_PASSWORD.min) throw new ApiError(400, { code: 'passwordShort' })
      await send('POST', '/auth/customer/password/reset', { phone, code, password: newPassword })
      toast.success(t.auth.resetDone)
      setPassword('')
      setNewPassword('')
      setIdentifier(phone)
      setMethod('password')
      go({ kind: 'start' })
    })

  const errorText = error && (
    <p role="alert" className="text-center text-sm text-destructive">
      {t.auth.errors[error]}
    </p>
  )

  const phoneField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor="phone" required>{t.auth.phone}</Label>
      <div className="flex items-center rounded-md border border-input bg-transparent focus-within:ring-[3px] focus-within:ring-ring/50">
        <span className="border-r px-3 text-sm text-muted-foreground">{PHONE_COUNTRY_CODE}</span>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={!register}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t.auth.phonePlaceholder}
          className="border-0 shadow-none focus-visible:ring-0"
          aria-invalid={error === 'INVALID_PHONE' || undefined}
        />
      </div>
    </div>
  )

  const backLink = (label: string, to: Step) => (
    <Button type="button" variant="link" className="px-0" onClick={() => go(to)}>
      <ArrowLeft />
      {label}
    </Button>
  )

  let body: React.ReactNode
  if (step.kind === 'code' || step.kind === 'twoFactor') {
    const tf = step.kind === 'twoFactor' ? step.challenge : null
    const devCode = tf ? tf.devCode : step.kind === 'code' ? step.sent.devCode : undefined
    const submit = (value?: string) => (tf ? verifyTwoFactor(tf, value) : verifyCode(value))
    body = (
      <form
        className="flex flex-col items-center gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex flex-col items-center text-center">
          {tf && <ShieldCheck className="mb-2 size-8 text-primary" />}
          <h1 className="text-xl font-semibold">{tf ? t.auth.twoFactorTitle : t.auth.codeTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tf
              ? tf.method === 'TOTP'
                ? t.auth.totpPrompt
                : fill(t.auth.smsPrompt, { phone: tf.phoneHint ?? '' })
              : step.kind === 'code' && fill(t.auth.codeSent, { phone: formatPhone(step.sent.phone) })}
          </p>
        </div>
        <CodeInput value={code} onChange={setCode} onComplete={(v) => void submit(v)} disabled={pending} />
        {devCode && <DevCode code={devCode} />}
        {errorText}
        <Button type="submit" size="lg" className="w-full" disabled={pending || code.length !== OTP_LENGTH}>
          {pending && <LoaderCircle className="animate-spin" />}
          {t.auth.verify}
        </Button>
        <div className="flex w-full items-center justify-between text-sm">
          {backLink(tf ? t.auth.backToSignIn : t.auth.changeNumber, { kind: 'start' })}
          {(!tf || tf.method === 'SMS') && (
            <Button
              type="button"
              variant="link"
              className="px-0"
              disabled={wait > 0 || pending}
              onClick={() => void (tf ? resendTwoFactor(tf) : requestCode())}
            >
              {wait > 0 ? fill(t.auth.resendIn, { s: wait }) : t.auth.resend}
            </Button>
          )}
        </div>
      </form>
    )
  } else if (step.kind === 'forgot') {
    body = (
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void requestReset()
        }}
      >
        <Heading title={t.auth.forgotTitle} subtitle={t.auth.forgotSubtitle} />
        {phoneField}
        {errorText}
        <Button type="submit" size="lg" disabled={pending || !phone.trim()}>
          {pending && <LoaderCircle className="animate-spin" />}
          {t.auth.sendCode}
        </Button>
        <div className="-mt-2">{backLink(t.auth.backToSignIn, { kind: 'start' })}</div>
      </form>
    )
  } else if (step.kind === 'reset') {
    body = (
      <form
        className="flex flex-col items-center gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void reset()
        }}
      >
        <Heading title={t.auth.resetTitle} subtitle={fill(t.auth.codeSent, { phone: formatPhone(step.sent.phone) })} />
        <CodeInput value={code} onChange={setCode} disabled={pending} />
        {step.sent.devCode && <DevCode code={step.sent.devCode} />}
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor="new-password" required>{t.auth.newPassword}</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={ACCOUNT_PASSWORD.min}
            maxLength={ACCOUNT_PASSWORD.max}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-invalid={error === 'passwordShort' || undefined}
          />
          <p className="text-xs text-muted-foreground">{fill(t.auth.passwordHint, { n: ACCOUNT_PASSWORD.min })}</p>
        </div>
        {errorText}
        <Button type="submit" size="lg" className="w-full" disabled={pending || code.length !== OTP_LENGTH || !newPassword}>
          {pending && <LoaderCircle className="animate-spin" />}
          {t.auth.savePassword}
        </Button>
        <div className="flex w-full items-center justify-between text-sm">
          {backLink(t.auth.backToSignIn, { kind: 'start' })}
          <Button type="button" variant="link" className="px-0" disabled={wait > 0 || pending} onClick={() => void requestReset()}>
            {wait > 0 ? fill(t.auth.resendIn, { s: wait }) : t.auth.resend}
          </Button>
        </div>
      </form>
    )
  } else if (!register && method === 'password') {
    body = (
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void passwordLogin()
        }}
      >
        <Heading title={t.auth.title} subtitle={t.auth.noPasswordHint} />
        <MethodTabs value={method} onChange={(m) => (setMethod(m), setError(null))} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="identifier" required>{t.auth.identifier}</Label>
          <Input
            id="identifier"
            autoComplete="username"
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t.auth.identifierPlaceholder}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" required>{t.auth.password}</Label>
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => {
                if (!identifier.includes('@')) setPhone(identifier)
                go({ kind: 'forgot' })
              }}
            >
              {t.auth.forgot}
            </button>
          </div>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {errorText}
        <Button type="submit" size="lg" disabled={pending || !identifier.trim() || !password}>
          {pending && <LoaderCircle className="animate-spin" />}
          {t.auth.verify}
        </Button>
      </form>
    )
  } else {
    body = (
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void requestCode()
        }}
      >
        <Heading title={register ? t.auth.signUpTitle : t.auth.title} subtitle={register ? t.auth.signUpSubtitle : t.auth.subtitle} />
        {!register && <MethodTabs value={method} onChange={(m) => (setMethod(m), setError(null))} />}
        {register && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="name" required>{t.auth.fullName}</Label>
            <Input
              id="name"
              autoComplete="name"
              autoFocus
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.auth.fullNamePlaceholder}
              aria-invalid={error === 'nameRequired' || undefined}
            />
          </div>
        )}
        {phoneField}
        {errorText}
        <Button type="submit" size="lg" disabled={pending || !phone.trim() || (register && !name.trim())}>
          {pending && <LoaderCircle className="animate-spin" />}
          {t.auth.sendCode}
        </Button>
      </form>
    )
  }

  const p = t.auth.panel
  return (
    <AuthLayout
      logo={Store}
      brand={t.app.brand}
      badge={t.app.name}
      headline={p.headline}
      tagline={p.tagline}
      highlights={[
        { icon: PackagePlus, title: p.sell, body: p.sellBody },
        { icon: Truck, title: p.orders, body: p.ordersBody },
        { icon: ChartNoAxesColumnIncreasing, title: p.grow, body: p.growBody },
      ]}
      footnote={p.footnote}
      aside={<LocaleToggle locale={locale} onChange={setLocale} />}
    >
      <div className="flex flex-col gap-5">{body}</div>
      {step.kind === 'start' && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {register ? t.auth.haveAccount : t.auth.noAccount}{' '}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => {
              setMode(register ? 'login' : 'register')
              setError(null)
            }}
          >
            {register ? t.auth.signInInstead : t.auth.createAccount}
          </button>
        </p>
      )}
    </AuthLayout>
  )
}

function LocaleToggle({ locale, onChange }: { locale: 'lo' | 'en'; onChange: (l: 'lo' | 'en') => void }) {
  return (
    <div className="flex rounded-full border bg-card p-0.5 text-xs font-semibold shadow-sm">
      {(['lo', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          onClick={() => onChange(l)}
          className={`rounded-full px-3 py-1 transition-colors ${locale === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {l === 'lo' ? 'ລາວ' : 'EN'}
        </button>
      ))}
    </div>
  )
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function MethodTabs({ value, onChange }: { value: 'code' | 'password'; onChange: (m: 'code' | 'password') => void }) {
  const { t } = useI18n()
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as 'code' | 'password')}>
      <TabsList className="w-full">
        <TabsTrigger value="code">{t.auth.methodCode}</TabsTrigger>
        <TabsTrigger value="password">{t.auth.methodPassword}</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean }) {
  return (
    <InputOTP maxLength={OTP_LENGTH} value={value} onChange={onChange} onComplete={onComplete} autoFocus disabled={disabled}>
      <InputOTPGroup>
        {Array.from({ length: OTP_LENGTH }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}

function DevCode({ code }: { code: string }) {
  const { t } = useI18n()
  return <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{fill(t.auth.devCode, { code })}</p>
}
