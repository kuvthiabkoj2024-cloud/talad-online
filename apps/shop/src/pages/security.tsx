import { ACCOUNT_PASSWORD, formatPhone, OTP_LENGTH } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@talad/ui/components/input-otp'
import { Label } from '@talad/ui/components/label'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LoaderCircle, LogOut, MessageSquareText, Monitor, ShieldCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate } from '@/lib/format'
import type { AccountSession } from '@/lib/types'

const KEY = ['me', 'sessions'] as const
const SECURITY_KEY = ['me', 'security'] as const

interface SecurityStatus {
  hasPassword: boolean
  twoFactor: 'NONE' | 'TOTP' | 'SMS'
  phone: string | null
  email: string | null
}

type SecurityErrorKey = keyof Dict['security']['errors']
const errorText = (e: unknown, t: Dict) =>
  e instanceof ApiError && e.code && e.code in t.security.errors ? t.security.errors[e.code as SecurityErrorKey] : t.common.saveError

/** "Chrome on Mac", "Safari on iPhone"… from a user-agent string. */
function deviceName(ua: string | null): { name: string | null; mobile: boolean } {
  if (!ua) return { name: null, mobile: false }
  const os = /iPhone|iPad/.test(ua)
    ? /iPad/.test(ua) ? 'iPad' : 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X|Macintosh/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Expo|okhttp|CFNetwork/.test(ua)
            ? 'Taladonline app'
            : null
  const name = [browser, os].filter(Boolean).join(' · ') || null
  return { name, mobile: /iPhone|Android|Mobile/.test(ua) }
}

/** Where the account is signed in, and recent sign-ins (§3.1 login/device history). */
export function SecurityPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const sessions = useQuery({ queryKey: KEY, queryFn: () => api<AccountSession[]>('/me/sessions') })
  const revoke = useMutation({
    mutationFn: (id: string) => send('DELETE', `/me/sessions/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
    onError: () => toast.error(t.common.saveError),
  })
  const revokeOthers = useMutation({
    mutationFn: () => send<{ revoked: number }>('POST', '/me/sessions/revoke-others'),
    onSuccess: (r) => {
      toast.success(fill(t.security.signedOutOthers, { n: r.revoked }))
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
    onError: () => toast.error(t.common.saveError),
  })

  const active = sessions.data?.filter((s) => s.active) ?? []
  const past = sessions.data?.filter((s) => !s.active) ?? []
  const others = active.filter((s) => !s.current)

  return (
    <>
      <TopBar title={t.security.title} backTo="/" />
      <PageBody className="max-w-3xl">
        <PageIntro title={t.security.title} description={t.security.description} />
        <SecuritySettings />
        {sessions.isPending ? (
          <LoadingState />
        ) : sessions.isError ? (
          <ErrorState onRetry={() => void sessions.refetch()} />
        ) : (
          <>
            <Card className="gap-3">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle>{t.security.devices}</CardTitle>
                <Button variant="outline" size="sm" disabled={others.length === 0 || revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
                  {revokeOthers.isPending ? <LoaderCircle className="animate-spin" /> : <LogOut />}
                  {t.security.signOutOthers}
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {active.map((s) => (
                  <SessionRow key={s.id} s={s}>
                    {s.current ? (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-primary">{t.security.thisDevice}</span>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
                        {t.security.signOut}
                      </Button>
                    )}
                  </SessionRow>
                ))}
                {others.length === 0 && <p className="pt-3 text-sm text-muted-foreground">{t.security.noOthers}</p>}
              </CardContent>
            </Card>

            {past.length > 0 && (
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle>{t.security.history}</CardTitle>
                  <CardDescription>{formatDate(past[past.length - 1].createdAt, locale)} – {formatDate(past[0].createdAt, locale)}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col divide-y">
                  {past.map((s) => (
                    <SessionRow key={s.id} s={s}>
                      <span className="text-xs text-muted-foreground">{s.revokedAt ? t.security.ended : t.security.expired}</span>
                    </SessionRow>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </PageBody>
    </>
  )
}

function SessionRow({ s, children }: { s: AccountSession; children: React.ReactNode }) {
  const { t, locale } = useI18n()
  const device = deviceName(s.userAgent)
  const Icon = device.mobile ? Smartphone : Monitor
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{device.name ?? t.security.unknownDevice}</span>
        <span className="block text-xs text-muted-foreground">
          {fill(t.security.signedIn, { date: formatDate(s.createdAt, locale, true) })}
          {s.ipAddress && ` · ${s.ipAddress}`}
          {s.active && ` · ${fill(t.security.expires, { date: formatDate(s.expiresAt, locale) })}`}
        </span>
      </span>
      {children}
    </div>
  )
}

/** Password and two-step verification (§3.1). */
function SecuritySettings() {
  const security = useQuery({ queryKey: SECURITY_KEY, queryFn: () => api<SecurityStatus>('/me/security') })
  if (security.isPending) return <LoadingState />
  if (security.isError) return <ErrorState onRetry={() => void security.refetch()} />
  return (
    <>
      <PasswordCard status={security.data} />
      <TwoFactorCard status={security.data} />
    </>
  )
}

function PasswordCard({ status }: { status: SecurityStatus }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => send<SecurityStatus>('PUT', '/me/security/password', { ...(status.hasPassword && { current }), password: next }),
    onSuccess: (saved) => {
      queryClient.setQueryData(SECURITY_KEY, saved)
      void queryClient.invalidateQueries({ queryKey: KEY })
      toast.success(t.security.passwordSaved)
      setOpen(false)
    },
    onError: (e) => setError(errorText(e, t)),
  })
  const close = (o: boolean) => {
    setOpen(o)
    if (o) return
    setCurrent('')
    setNext('')
    setError(null)
  }

  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <KeyRound className="size-5" />
          </span>
          <div>
            <CardTitle>{t.security.password}</CardTitle>
            <CardDescription className="mt-1">{status.hasPassword ? t.security.passwordOn : t.security.passwordOff}</CardDescription>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {status.hasPassword ? t.security.changePassword : t.security.setPassword}
        </Button>
      </CardHeader>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-sm">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              save.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>{status.hasPassword ? t.security.changePassword : t.security.setPassword}</DialogTitle>
              <DialogDescription>{fill(t.security.passwordHint, { n: ACCOUNT_PASSWORD.min })}</DialogDescription>
            </DialogHeader>
            {/* Lets password managers link the new password to this account. */}
            <input type="text" autoComplete="username" value={status.phone ?? status.email ?? ''} readOnly hidden />
            {status.hasPassword && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="current-password" required>{t.security.currentPassword}</Label>
                <Input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password" required>{t.security.newPassword}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={ACCOUNT_PASSWORD.min}
                maxLength={ACCOUNT_PASSWORD.max}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <LoaderCircle className="animate-spin" />}
                {t.common.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

type Dialogs = { kind: 'totp'; secret: string; qr: string } | { kind: 'off'; devCode?: string } | null

function TwoFactorCard({ status }: { status: SecurityStatus }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<Dialogs>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const saved = (s: SecurityStatus) => {
    queryClient.setQueryData(SECURITY_KEY, s)
    toast.success(s.twoFactor === 'NONE' ? t.security.disabled : t.security.enabled)
    setDialog(null)
    setCode('')
  }
  const fail = (e: unknown) => {
    setError(errorText(e, t))
    setCode('')
  }
  const setupTotp = useMutation({
    mutationFn: () => send<{ secret: string; qr: string }>('POST', '/me/security/totp/setup'),
    onSuccess: (r) => (setError(null), setCode(''), setDialog({ kind: 'totp', ...r })),
    onError: (e) => toast.error(errorText(e, t)),
  })
  const enableSms = useMutation({
    mutationFn: () => send<SecurityStatus>('POST', '/me/security/sms/enable'),
    onSuccess: saved,
    onError: (e) => toast.error(errorText(e, t)),
  })
  const startOff = useMutation({
    // SMS needs a fresh code to confirm; the authenticator already has one.
    mutationFn: async (): Promise<{ devCode?: string }> => (status.twoFactor === 'SMS' ? send<{ devCode?: string }>('POST', '/me/security/code') : {}),
    onSuccess: (r) => (setError(null), setCode(''), setDialog({ kind: 'off', devCode: r.devCode })),
    onError: (e) => toast.error(errorText(e, t)),
  })
  const confirm = useMutation({
    mutationFn: (value: string) =>
      send<SecurityStatus>('POST', dialog?.kind === 'totp' ? '/me/security/totp/enable' : '/me/security/2fa/disable', { code: value }),
    onSuccess: saved,
    onError: fail,
  })
  const submit = (value = code) => value.length === OTP_LENGTH && !confirm.isPending && confirm.mutate(value)

  const options = [
    { key: 'TOTP' as const, icon: ShieldCheck, title: t.security.totp, body: t.security.totpBody, action: t.security.setUpTotp, run: () => setupTotp.mutate(), busy: setupTotp.isPending },
    {
      key: 'SMS' as const,
      icon: MessageSquareText,
      title: t.security.sms,
      body: fill(t.security.smsBody, { phone: status.phone ? formatPhone(status.phone) : '—' }),
      action: t.security.useSms,
      run: () => enableSms.mutate(),
      busy: enableSms.isPending,
    },
  ]

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t.security.twoFactor}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              status.twoFactor === 'NONE' ? 'bg-muted text-muted-foreground' : 'bg-brand-soft text-primary',
            )}
          >
            {status.twoFactor === 'NONE' ? t.security.off : t.security.on}
          </span>
        </CardTitle>
        <CardDescription>{t.security.twoFactorHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {options.map((o) => {
          const active = status.twoFactor === o.key
          const other = status.twoFactor !== 'NONE' && !active
          return (
            <div key={o.key} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', active ? 'bg-brand-soft text-primary' : 'bg-muted text-muted-foreground')}>
                <o.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{other ? t.security.switchHint : o.body}</span>
              </span>
              {active ? (
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={startOff.isPending} onClick={() => startOff.mutate()}>
                  {startOff.isPending && <LoaderCircle className="animate-spin" />}
                  {t.security.turnOff}
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled={other || o.busy || (o.key === 'SMS' && !status.phone)} onClick={o.run}>
                  {o.busy && <LoaderCircle className="animate-spin" />}
                  {o.action}
                </Button>
              )}
            </div>
          )
        })}
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <form
            className="flex flex-col items-center gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <DialogHeader className="w-full">
              <DialogTitle>{dialog?.kind === 'totp' ? t.security.scanTitle : t.security.turnOffTitle}</DialogTitle>
              <DialogDescription>
                {dialog?.kind === 'totp' ? t.security.scanBody : status.twoFactor === 'TOTP' ? t.security.turnOffTotp : t.security.turnOffSms}
              </DialogDescription>
            </DialogHeader>
            {dialog?.kind === 'totp' && (
              <>
                <img src={dialog.qr} alt="" className="size-48 rounded-lg border bg-white p-1" />
                <div className="w-full text-center">
                  <p className="text-xs text-muted-foreground">{t.security.setupKey}</p>
                  <p className="font-mono text-sm tracking-wider break-all select-all">{dialog.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
                </div>
              </>
            )}
            {dialog?.kind === 'off' && dialog.devCode && (
              <p className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{fill(t.auth.devCode, { code: dialog.devCode })}</p>
            )}
            <InputOTP maxLength={OTP_LENGTH} value={code} onChange={setCode} onComplete={(v: string) => submit(v)} autoFocus disabled={confirm.isPending} aria-label={t.security.code}>
              <InputOTPGroup>
                {Array.from({ length: OTP_LENGTH }, (_, i) => (
                  <InputOTPSlot key={i} index={i} className="size-10 text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && (
              <p role="alert" className="text-center text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter className="w-full">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {t.common.cancel}
              </Button>
              <Button
                type="submit"
                variant={dialog?.kind === 'off' ? 'destructive' : 'default'}
                disabled={confirm.isPending || code.length !== OTP_LENGTH}
              >
                {confirm.isPending && <LoaderCircle className="animate-spin" />}
                {dialog?.kind === 'totp' ? t.security.turnOn : t.security.turnOff}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
