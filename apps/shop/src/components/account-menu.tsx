import { formatPhone, type Locale } from '@talad/shared'
import { Avatar, AvatarFallback, AvatarImage } from '@talad/ui/components/avatar'
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
import { ExternalLink, Languages, LogOut, SunMoon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useAuth } from '@/auth/context'
import { useI18n } from '@/i18n/context'
import { storefrontUrl } from '@/lib/format'
import type { Account } from '@/lib/types'

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: 'lo', label: 'ລາວ' },
  { value: 'en', label: 'English' },
]

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function AccountAvatar({ account, className }: { account: Account; className?: string }) {
  const API = import.meta.env.VITE_API_URL
  const src = account.avatarVersion ? `${API}/avatars/${account.id}?v=${account.avatarVersion}` : account.avatarUrl
  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
        {initials(account.name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** Signed-in account: language, theme, storefront link and sign out. `trigger` is the visible button. */
export function AccountMenu({
  trigger,
  align = 'end',
  side,
}: {
  trigger: React.ReactNode
  align?: 'start' | 'end'
  side?: 'top' | 'bottom' | 'right'
}) {
  const { account, signOut } = useAuth()
  const { t, locale, setLocale } = useI18n()
  const { theme, setTheme } = useTheme()
  if (!account) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <AccountAvatar account={account} className="size-9" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{account.name}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {account.phone ? formatPhone(account.phone) : account.email}
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
        {account.shop?.status === 'APPROVED' && (
          <DropdownMenuItem asChild>
            <a href={storefrontUrl.shop(locale, account.shop.slug)} target="_blank" rel="noreferrer">
              <ExternalLink />
              {t.account.openStore}
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut />
          {t.account.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
