import { Button } from '@talad/ui/components/button'
import { AuthLayout } from '@talad/ui/components/auth-layout'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { ArrowLeft, LayoutDashboard, LoaderCircle, ScrollText, ShieldCheck, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/auth/context'
import { CodeInput } from '@/components/code-input'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, send } from '@/lib/api'
import type { Admin } from '@/lib/types'

type LoginResponse = { token: string; admin: Admin } | { twoFactor: { method: 'TOTP'; challenge: string } }

const KNOWN = ['INVALID_CREDENTIALS', 'ACCOUNT_DISABLED', 'TWO_FACTOR_INVALID', 'CHALLENGE_EXPIRED'] as const
function errorText(e: unknown, t: Dict): string {
  if (e instanceof ApiError && e.status === 429) return t.auth.throttled
  const code = e instanceof ApiError ? e.code : undefined
  return code && (KNOWN as readonly string[]).includes(code) ? t.auth[code as (typeof KNOWN)[number]] : t.auth.generic
}

/** Staff sign-in (§2.1): email + password, then an authenticator code when 2FA is on. */
export function LoginPage() {
  const { t } = useI18n()
  const { admin, signIn } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  // Local development: the seeded admin is filled in (see .env.example). Production builds drop this.
  const [email, setEmail] = useState(() => (import.meta.env.DEV ? (import.meta.env.VITE_DEV_ADMIN_EMAIL ?? '') : ''))
  const [password, setPassword] = useState(() => (import.meta.env.DEV ? (import.meta.env.VITE_DEV_ADMIN_PASSWORD ?? '') : ''))
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (admin) return <Navigate to={from} replace />

  async function run(request: () => Promise<LoginResponse>) {
    setError(null)
    setPending(true)
    try {
      const res = await request()
      if ('twoFactor' in res) {
        setChallenge(res.twoFactor.challenge)
        setCode('')
        return
      }
      signIn(res.token, res.admin)
      navigate(from, { replace: true })
    } catch (e) {
      setError(errorText(e, t))
      setCode('')
      if (e instanceof ApiError && e.code === 'CHALLENGE_EXPIRED') setChallenge(null)
    } finally {
      setPending(false)
    }
  }

  const login = () => run(() => send('POST', '/admin/auth/login', { email: email.trim(), password }))
  const verify = (value = code) =>
    value.length === 6 && challenge && run(() => send('POST', '/admin/auth/2fa/verify', { challenge, code: value }))

  const errorLine = error && (
    <p role="alert" className="text-center text-sm text-destructive">
      {error}
    </p>
  )

  return (
    <AuthShell>
      {challenge ? (
        <form
          className="flex flex-col items-center gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          <div className="flex flex-col items-center text-center">
            <ShieldCheck className="mb-2 size-8 text-primary" />
            <h1 className="text-xl font-semibold">{t.auth.twoFactorTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.auth.twoFactorPrompt}</p>
          </div>
          <CodeInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={pending} label={t.auth.twoFactorTitle} />
          {errorLine}
          <Button type="submit" size="lg" className="w-full" disabled={pending || code.length !== 6}>
            {pending && <LoaderCircle className="animate-spin" />}
            {t.auth.signIn}
          </Button>
          <Button type="button" variant="link" className="self-start px-0" onClick={() => (setChallenge(null), setError(null))}>
            <ArrowLeft />
            {t.auth.backToSignIn}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void login()
          }}
        >
          <div className="text-center">
            <h1 className="text-xl font-semibold">{t.auth.title}</h1>
            <p className="mt-4 text-sm text-muted-foreground">{t.auth.subtitle}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" required>{t.auth.email}</Label>
            <Input id="email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" required>{t.auth.password}</Label>
              <Link to="/forgot-password" state={{ email }} className="text-sm font-medium text-primary hover:underline">
                {t.auth.forgot}
              </Link>
            </div>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {errorLine}
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" />}
            {t.auth.signIn}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

/** Branded frame shared by sign-in, forgot and reset password. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n()
  const p = t.auth.panel
  return (
    <AuthLayout
      logo={ShieldCheck}
      brand={t.app.brand}
      badge={t.app.name}
      headline={p.headline}
      tagline={p.tagline}
      highlights={[
        { icon: UsersRound, title: p.access, body: p.accessBody },
        { icon: ScrollText, title: p.audit, body: p.auditBody },
        { icon: LayoutDashboard, title: p.insight, body: p.insightBody },
      ]}
      footnote={p.footnote}
      aside={<LocaleToggle locale={locale} onChange={setLocale} />}
    >
      {children}
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
