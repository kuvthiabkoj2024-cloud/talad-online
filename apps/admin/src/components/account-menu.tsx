import type { Locale } from '@talad/shared'
import { Avatar, AvatarFallback } from '@talad/ui/components/avatar'
import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@talad/ui/components/dropdown-menu'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Languages, LoaderCircle, LogOut, ShieldCheck, SunMoon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { toast } from 'sonner'
import { ME_KEY, useAuth } from '@/auth/context'
import { CodeInput } from '@/components/code-input'
import { useI18n } from '@/i18n/context'
import { ApiError, send } from '@/lib/api'
import { fill } from '@/lib/format'
import type { Admin } from '@/lib/types'

/** Matches ADMIN_PASSWORD_MIN in services/api. */
export const PASSWORD_MIN = 10

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: 'lo', label: 'ລາວ' },
  { value: 'en', label: 'English' },
]

export function AdminAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials}</AvatarFallback>
    </Avatar>
  )
}

export function AccountMenu({ trigger, side }: { trigger: React.ReactNode; side?: 'top' | 'bottom' | 'right' }) {
  const { admin, signOut } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  const [password, setPassword] = useState(false)
  const [twoFactor, setTwoFactor] = useState(false)
  if (!admin) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" side={side} className="w-64">
          <DropdownMenuLabel className="flex items-center gap-3 py-2">
            <AdminAvatar name={admin.name} className="size-9" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">{admin.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {admin.email} · {t.roles[admin.role]}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages />
              {t.account.language}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                {LANGUAGES.map((l) => (
                  <DropdownMenuRadioItem key={l.value} value={l.value}>
                    {l.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SunMoon />
              {t.account.theme}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light">{t.account.light}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t.account.dark}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">{t.account.system}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => setPassword(true)}>
            <KeyRound />
            {t.account.changePassword}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTwoFactor(true)}>
            <ShieldCheck />
            {t.account.twoFactor}
            <span className={`ml-auto text-xs ${admin.twoFactor ? 'text-primary' : 'text-muted-foreground'}`}>{admin.twoFactor ? '✓' : '—'}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
            <LogOut />
            {t.account.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={password} onOpenChange={setPassword}>
        <DialogContent className="sm:max-w-md">{password && <PasswordForm onDone={() => setPassword(false)} />}</DialogContent>
      </Dialog>
      <Dialog open={twoFactor} onOpenChange={setTwoFactor}>
        <DialogContent className="sm:max-w-sm">{twoFactor && <TwoFactorForm admin={admin} onDone={() => setTwoFactor(false)} />}</DialogContent>
      </Dialog>
    </>
  )
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const change = useMutation({
    mutationFn: () => send('POST', '/admin/auth/password', { current, next }),
    onSuccess: () => {
      toast.success(t.account.passwordChanged)
      onDone()
    },
    onError: (e) => setError(e instanceof ApiError && e.code === 'WRONG_PASSWORD' ? t.account.WRONG_PASSWORD : t.common.saveError),
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        change.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.account.changePassword}</DialogTitle>
        <DialogDescription>{fill(t.account.passwordHint, { n: PASSWORD_MIN })}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current" required>{t.account.current}</Label>
        <Input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="next" required>{t.account.newPassword}</Label>
        <Input id="next" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={change.isPending}>
          {change.isPending && <LoaderCircle className="animate-spin" />}
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Turn the authenticator app on (scan + confirm) or off (confirm with a code). */
function TwoFactorForm({ admin, onDone }: { admin: Admin; onDone: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const start = useMutation({
    mutationFn: () => send<{ secret: string; qr: string }>('POST', '/admin/auth/2fa/setup'),
    onSuccess: setSetup,
    onError: () => setError(t.common.saveError),
  })
  const confirm = useMutation({
    mutationFn: (value: string) => send<Admin>('POST', admin.twoFactor ? '/admin/auth/2fa/disable' : '/admin/auth/2fa/enable', { code: value }),
    onSuccess: (saved) => {
      queryClient.setQueryData(ME_KEY, saved)
      toast.success(saved.twoFactor ? t.account.enabled : t.account.disabled)
      onDone()
    },
    onError: (e) => {
      setError(e instanceof ApiError && e.code === 'TWO_FACTOR_INVALID' ? t.account.TWO_FACTOR_INVALID : t.common.saveError)
      setCode('')
    },
  })
  const submit = (value = code) => value.length === 6 && !confirm.isPending && confirm.mutate(value)
  const askCode = admin.twoFactor || setup

  return (
    <form
      className="flex flex-col items-center gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader className="w-full">
        <DialogTitle>{t.account.twoFactor}</DialogTitle>
        <DialogDescription>{admin.twoFactor ? t.account.turnOffBody : setup ? t.account.scanBody : t.account.twoFactorOff}</DialogDescription>
      </DialogHeader>
      {setup && (
        <>
          <img src={setup.qr} alt="" className="size-48 rounded-lg border bg-white p-1" />
          <div className="w-full text-center">
            <p className="text-xs text-muted-foreground">{t.account.setupKey}</p>
            <p className="font-mono text-sm tracking-wider break-all select-all">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
          </div>
        </>
      )}
      {askCode && <CodeInput value={code} onChange={setCode} onComplete={(v) => submit(v)} disabled={confirm.isPending} label={t.account.twoFactor} />}
      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="w-full">
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        {askCode ? (
          <Button type="submit" variant={admin.twoFactor ? 'destructive' : 'default'} disabled={confirm.isPending || code.length !== 6}>
            {confirm.isPending && <LoaderCircle className="animate-spin" />}
            {admin.twoFactor ? t.account.turnOff : t.account.turnOn}
          </Button>
        ) : (
          <Button type="button" disabled={start.isPending} onClick={() => start.mutate()}>
            {start.isPending && <LoaderCircle className="animate-spin" />}
            {t.account.setUp}
          </Button>
        )}
      </DialogFooter>
    </form>
  )
}
