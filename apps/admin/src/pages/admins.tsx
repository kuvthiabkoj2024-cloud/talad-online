import { ADMIN_ROLES, type AdminRole } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { AdminAvatar, PASSWORD_MIN } from '@/components/account-menu'
import { FlagBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { Field } from '@/components/field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { useAuth } from '@/auth/context'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate } from '@/lib/format'
import type { Admin } from '@/lib/types'

const KEY = ['admin', 'admins'] as const
type ErrorKey = keyof Dict['admins']['errors']
const errorText = (e: unknown, t: Dict) => (e instanceof ApiError && e.code && e.code in t.admins.errors ? t.admins.errors[e.code as ErrorKey] : t.common.saveError)

/** Staff accounts and roles (§2.1). */
export function AdminsPage() {
  const { t, locale } = useI18n()
  const { admin: me } = useAuth()
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: () => api<Admin[]>('/admin/admins') })
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY })
  const patch = (a: Admin, body: Partial<Admin> & { password?: string; resetTwoFactor?: boolean }) => send<Admin>('PATCH', `/admin/admins/${a.id}`, body)
  const changeRole = useMutation({
    mutationFn: ({ a, role }: { a: Admin; role: AdminRole }) => patch(a, { role }),
    onSuccess: () => {
      toast.success(t.common.saved)
      refresh()
    },
    onError: (e) => toast.error(errorText(e, t)),
  })

  return (
    <>
      <TopBar title={t.admins.title} />
      <PageBody className="max-w-5xl">
        <PageIntro
          title={t.admins.title}
          description={t.admins.description}
          actions={
            <Button onClick={() => setAdding(true)}>
              <Plus />
              {t.admins.add}
            </Button>
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {ADMIN_ROLES.map((r) => (
            <Card key={r} className="gap-1 py-4">
              <CardContent className="px-4">
                <p className="text-sm font-semibold">{t.roles[r]}</p>
                <p className="text-xs text-muted-foreground">{t.admins.roleHelp[r]}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t.admins.name}</TableHead>
                  <TableHead>{t.admins.role}</TableHead>
                  <TableHead>{t.customers.joined}</TableHead>
                  <TableHead>{t.common.status}</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((a) => {
                  const self = a.id === me?.id
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="pl-4">
                        <span className="flex items-center gap-2">
                          <AdminAvatar name={a.name} />
                          <span>
                            <span className="block font-medium">
                              {a.name} {self && <span className="text-xs font-normal text-muted-foreground">({t.admins.you})</span>}
                            </span>
                            <span className="block text-xs text-muted-foreground">{a.email}</span>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select value={a.role} disabled={self || changeRole.isPending} onValueChange={(role) => changeRole.mutate({ a, role: role as AdminRole })}>
                          <SelectTrigger size="sm" className="w-36" aria-label={t.admins.role}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ADMIN_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {t.roles[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(a.createdAt, locale)}</TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {a.isActive ? <FlagBadge tone="good">{t.common.active}</FlagBadge> : <FlagBadge tone="bad">{t.admins.disabled}</FlagBadge>}
                          {a.twoFactor && <FlagBadge tone="info">{t.admins.twoFactorOn}</FlagBadge>}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfirm({
                                title: `${t.admins.resetPassword} · ${a.name}`,
                                description: fill(t.admins.passwordHint, { n: PASSWORD_MIN }),
                                confirmLabel: t.admins.resetPassword,
                                field: { label: t.admins.newPassword, required: true },
                                errorText: (e) => (e instanceof ApiError ? errorText(e, t) : fill(t.admins.passwordHint, { n: PASSWORD_MIN })),
                                onConfirm: async ({ field }) => {
                                  if ((field ?? '').length < PASSWORD_MIN) throw new Error('short')
                                  await patch(a, { password: field })
                                  toast.success(t.common.saved)
                                },
                              })
                            }
                          >
                            <KeyRound />
                            {t.admins.resetPassword}
                          </Button>
                          {!self && a.twoFactor && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirm({
                                  title: `${t.admins.resetTwoFactor} · ${a.name}`,
                                  description: t.admins.resetTwoFactorBody,
                                  confirmLabel: t.admins.resetTwoFactor,
                                  destructive: true,
                                  errorText: (e) => errorText(e, t),
                                  onConfirm: async () => {
                                    await patch(a, { resetTwoFactor: true })
                                    refresh()
                                    toast.success(t.admins.twoFactorReset)
                                  },
                                })
                              }
                            >
                              {t.admins.resetTwoFactor}
                            </Button>
                          )}
                          {!self && (
                            <Button
                              variant="outline"
                              size="sm"
                              className={a.isActive ? 'text-destructive hover:text-destructive' : ''}
                              onClick={() =>
                                setConfirm({
                                  title: `${a.isActive ? t.admins.disable : t.admins.enable} · ${a.name}`,
                                  description: a.email,
                                  confirmLabel: a.isActive ? t.admins.disable : t.admins.enable,
                                  destructive: a.isActive,
                                  errorText: (e) => errorText(e, t),
                                  onConfirm: async () => {
                                    await patch(a, { isActive: !a.isActive })
                                    refresh()
                                  },
                                })
                              }
                            >
                              {a.isActive ? t.admins.disable : t.admins.enable}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">{adding && <AddAdminForm onDone={() => (setAdding(false), refresh())} />}</DialogContent>
      </Dialog>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function AddAdminForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ name: '', email: '', role: 'SUPPORT' as AdminRole, password: '' })
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => send('POST', '/admin/admins', form),
    onSuccess: () => {
      toast.success(t.common.saved)
      onDone()
    },
    onError: (e) => setError(errorText(e, t)),
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.admins.add}</DialogTitle>
        <DialogDescription className="sr-only">{t.admins.description}</DialogDescription>
      </DialogHeader>
      <Field required id="aname" label={t.admins.name}>
        <Input id="aname" required minLength={2} maxLength={100} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </Field>
      <Field required id="aemail" label={t.admins.email}>
        <Input id="aemail" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </Field>
      <Field required id="arole" label={t.admins.role} hint={t.admins.roleHelp[form.role]}>
        <Select value={form.role} onValueChange={(role) => setForm((f) => ({ ...f, role: role as AdminRole }))}>
          <SelectTrigger id="arole" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {t.roles[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field required id="apass" label={t.admins.password} hint={fill(t.admins.passwordHint, { n: PASSWORD_MIN })}>
        <Input id="apass" type="text" autoComplete="off" required minLength={PASSWORD_MIN} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}
