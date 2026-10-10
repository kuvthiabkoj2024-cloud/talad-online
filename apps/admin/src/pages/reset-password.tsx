import { Button } from '@talad/ui/components/button'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { ArrowLeft, LoaderCircle, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { PASSWORD_MIN } from '@/components/account-menu'
import { useI18n } from '@/i18n/context'
import { ApiError, send } from '@/lib/api'
import { fill } from '@/lib/format'
import { AuthShell } from './login'

const back = (label: string) => (
  <Button asChild variant="link" className="self-start px-0">
    <Link to="/login">
      <ArrowLeft />
      {label}
    </Link>
  </Button>
)

/** "Forgot password?": emails a one-time reset link (§2.1). */
export function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState((useLocation().state as { email?: string } | null)?.email ?? '')
  const [sent, setSent] = useState<{ devLink?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    setError(null)
    setPending(true)
    try {
      setSent(await send<{ devLink?: string }>('POST', '/admin/auth/password/forgot', { email: email.trim() }))
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? t.auth.throttled : t.auth.generic)
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <MailCheck className="size-10 text-primary" />
          <h1 className="text-xl font-semibold">{t.auth.sentTitle}</h1>
          <p className="text-sm text-muted-foreground">{fill(t.auth.sentBody, { email: email.trim() })}</p>
          {/* No email provider yet: outside production the API hands back the link. */}
          {sent.devLink && (
            <div className="w-full rounded-lg border border-dashed bg-muted p-3 text-left text-xs text-muted-foreground">
              <p>{t.auth.devLink}</p>
              <Link to={new URL(sent.devLink).pathname + new URL(sent.devLink).search} className="mt-1 inline-block font-medium text-primary hover:underline">
                {t.auth.openLink}
              </Link>
            </div>
          )}
          {back(t.auth.backToSignIn)}
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t.auth.forgotTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.auth.forgotSubtitle}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" required>{t.auth.email}</Label>
          <Input id="email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          {t.auth.sendLink}
        </Button>
        {back(t.auth.backToSignIn)}
      </form>
    </AuthShell>
  )
}

/** Lands from the emailed link: `?token=`. */
export function ResetPasswordPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const token = useSearchParams()[0].get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    if (password !== confirm) return setError(t.auth.mismatch)
    setError(null)
    setPending(true)
    try {
      await send('POST', '/admin/auth/password/reset', { token, password })
      toast.success(t.auth.resetDone)
      navigate('/login', { replace: true })
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'RESET_LINK_INVALID' ? t.auth.RESET_LINK_INVALID : e instanceof ApiError && e.status === 429 ? t.auth.throttled : t.auth.generic,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t.auth.resetTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{fill(t.auth.resetSubtitle, { n: PASSWORD_MIN })}</p>
        </div>
        {!token ? (
          <p role="alert" className="text-sm text-destructive">
            {t.auth.RESET_LINK_INVALID}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password" required>{t.auth.newPassword}</Label>
              <Input id="new-password" type="password" autoComplete="new-password" autoFocus required minLength={PASSWORD_MIN} maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password" required>{t.auth.confirmPassword}</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}{' '}
                {error === t.auth.RESET_LINK_INVALID && (
                  <Link to="/forgot-password" className="font-medium underline">
                    {t.auth.forgot}
                  </Link>
                )}
              </p>
            )}
            <Button type="submit" size="lg" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              {t.auth.savePassword}
            </Button>
          </>
        )}
        {back(t.auth.backToSignIn)}
      </form>
    </AuthShell>
  )
}
