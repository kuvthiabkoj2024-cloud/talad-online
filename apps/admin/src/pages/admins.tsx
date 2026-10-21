import { ADMIN_PERMISSION_GROUPS, type AdminPermission } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, UserCog, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { AdminAvatar, PASSWORD_MIN } from '@/components/account-menu'
import { FlagBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { Field } from '@/components/field'
import { FilterTabs } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { useAuth } from '@/auth/context'
import { useUrlParams } from '@/hooks/use-url-params'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate } from '@/lib/format'
import { roleName } from '@/lib/roles'
import type { Admin, AdminRoleInfo } from '@/lib/types'

const ADMINS = ['admin', 'admins'] as const
const ROLES = ['admin', 'roles'] as const
type ErrorKey = keyof Dict['admins']['errors']
const errorText = (e: unknown, t: Dict) => (e instanceof ApiError && e.code && e.code in t.admins.errors ? t.admins.errors[e.code as ErrorKey] : t.common.saveError)

const useRoles = () => useQuery({ queryKey: ROLES, queryFn: () => api<AdminRoleInfo[]>('/admin/roles') })

/** Staff accounts, their roles and permissions, and the roles themselves (§2.1 RBAC). Super Admin only. */
export function AdminsPage() {
  const { t } = useI18n()
  const { params, set } = useUrlParams()
  const tab = params.get('tab') === 'roles' ? 'roles' : 'admins'
  const [adding, setAdding] = useState(false)
  const [editingRole, setEditingRole] = useState<AdminRoleInfo | 'new' | null>(null)

  return (
    <>
      <TopBar title={t.admins.title} />
      <PageBody>
        <PageIntro
          title={t.admins.title}
          description={t.admins.description}
          actions={
            tab === 'roles' ? (
              <Button onClick={() => setEditingRole('new')}>
                <Plus />
                {t.admins.addRole}
              </Button>
            ) : (
              <Button onClick={() => setAdding(true)}>
                <Plus />
                {t.admins.add}
              </Button>
            )
          }
        />
        <FilterTabs
          tabs={[
            { key: 'admins', label: t.admins.usersTab },
            { key: 'roles', label: t.admins.rolesTab },
          ]}
          active={tab}
          onSelect={(k) => set({ tab: k === 'roles' ? 'roles' : undefined })}
        />
        {tab === 'admins' ? <AdminsTab adding={adding} onCloseAdd={() => setAdding(false)} /> : <RolesTab onEdit={setEditingRole} />}
      </PageBody>
      <Dialog open={editingRole !== null} onOpenChange={(o) => !o && setEditingRole(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
          {editingRole && <RoleForm key={editingRole === 'new' ? 'new' : editingRole.id} role={editingRole === 'new' ? null : editingRole} onDone={() => setEditingRole(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ── Admins ── */

function AdminsTab({ adding, onCloseAdd }: { adding: boolean; onCloseAdd: () => void }) {
  const { t, locale } = useI18n()
  const { admin: me } = useAuth()
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: ADMINS, queryFn: () => api<Admin[]>('/admin/admins') })
  const [editing, setEditing] = useState<Admin | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin'] })
  const patch = (a: Admin, body: Record<string, unknown>) => send<Admin>('PATCH', `/admin/admins/${a.id}`, body)

  if (list.isPending) return <LoadingState />
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t.admins.name}</TableHead>
              <TableHead>{t.admins.role}</TableHead>
              <TableHead>{t.admins.permissionsCol}</TableHead>
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
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {a.role.isSuper && <ShieldCheck className="size-4 text-primary" />}
                      {roleName(a.role, t)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {a.role.isSuper ? (
                      <FlagBadge tone="good">{t.admins.all}</FlagBadge>
                    ) : a.customPermissions ? (
                      <FlagBadge tone="warn">{fill(t.admins.custom, { n: a.can.length })}</FlagBadge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t.admins.roleDefault} · {fill(t.admins.permissionsCount, { n: a.can.length })}
                      </span>
                    )}
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
                      <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                        <UserCog />
                        {t.admins.editAccess}
                      </Button>
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
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">{editing && <AccessForm key={editing.id} admin={editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={adding} onOpenChange={(o) => !o && onCloseAdd()}>
        <DialogContent className="sm:max-w-md">{adding && <AddAdminForm onDone={onCloseAdd} />}</DialogContent>
      </Dialog>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function RoleSelect({ id, value, onChange }: { id: string; value: string; onChange: (id: string) => void }) {
  const { t } = useI18n()
  const roles = useRoles()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t.admins.role} />
      </SelectTrigger>
      <SelectContent>
        {roles.data?.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {roleName(r, t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Role for an admin, and optionally their own permissions instead of the role's. */
function AccessForm({ admin, onDone }: { admin: Admin; onDone: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const roles = useRoles()
  const [roleId, setRoleId] = useState(admin.role.id)
  const [custom, setCustom] = useState(admin.customPermissions)
  const [permissions, setPermissions] = useState<AdminPermission[]>(admin.customPermissions ? admin.permissions : admin.role.permissions)
  const [error, setError] = useState<string | null>(null)
  const role = roles.data?.find((r) => r.id === roleId) ?? admin.role
  const save = useMutation({
    mutationFn: () => send('PATCH', `/admin/admins/${admin.id}`, { roleId, customPermissions: custom && !role.isSuper, ...(custom && { permissions }) }),
    onSuccess: () => {
      toast.success(t.common.saved)
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
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
        <DialogTitle>{fill(t.admins.accessTitle, { name: admin.name })}</DialogTitle>
        <DialogDescription>{t.admins.accessBody}</DialogDescription>
      </DialogHeader>
      <Field required id="access-role" label={t.admins.role} hint={role.isSuper ? t.permissions.superNote : (role.description ?? undefined)}>
        <RoleSelect
          id="access-role"
          value={roleId}
          onChange={(id) => {
            setRoleId(id)
            // Starting from the new role's permissions when customising.
            if (!custom) setPermissions(roles.data?.find((r) => r.id === id)?.permissions ?? [])
          }}
        />
      </Field>
      {role.isSuper ? (
        <p className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2.5 text-sm text-primary">
          <ShieldCheck className="size-4 shrink-0" />
          {t.admins.superHasAll}
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {([false, true] as const).map((c) => (
              <button
                key={String(c)}
                type="button"
                aria-pressed={custom === c}
                onClick={() => {
                  setCustom(c)
                  if (c && !custom) setPermissions(role.permissions)
                }}
                className={cn('flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-colors', custom === c ? 'border-primary bg-brand-soft font-medium text-primary ring-1 ring-primary' : 'hover:bg-muted')}
              >
                {c ? <UserCog className="size-4 shrink-0" /> : <Users className="size-4 shrink-0" />}
                {c ? t.admins.useCustom : t.admins.useRole}
              </button>
            ))}
          </div>
          <PermissionPicker value={custom ? permissions : role.permissions} onChange={setPermissions} disabled={!custom} />
        </>
      )}
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
          {save.isPending && <LoaderCircle className="animate-spin" />}
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Permissions as checkboxes, grouped like the sidebar, with "all" per group. */
function PermissionPicker({ value, onChange, disabled }: { value: AdminPermission[]; onChange: (v: AdminPermission[]) => void; disabled?: boolean }) {
  const { t } = useI18n()
  const has = new Set(value)
  const toggle = (list: AdminPermission[], on: boolean) => onChange(on ? [...new Set([...value, ...list])] : value.filter((p) => !list.includes(p)))
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', disabled && 'opacity-70')}>
      {ADMIN_PERMISSION_GROUPS.map((g) => {
        const all = g.permissions.every((p) => has.has(p))
        return (
          <fieldset key={g.key} disabled={disabled} className="flex flex-col gap-1.5 rounded-xl border p-3">
            <legend className="sr-only">{t.permissions.groups[g.key]}</legend>
            <label className="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t.permissions.groups[g.key]}
              <span className="flex items-center gap-1.5 font-normal normal-case">
                {t.admins.all}
                <input type="checkbox" className="size-4 accent-primary" checked={all} onChange={(e) => toggle(g.permissions, e.target.checked)} />
              </span>
            </label>
            {g.permissions.map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted/60">
                <input type="checkbox" className="size-4 accent-primary" checked={has.has(p)} onChange={(e) => toggle([p], e.target.checked)} />
                {t.permissions.names[p]}
              </label>
            ))}
          </fieldset>
        )
      })}
    </div>
  )
}

function AddAdminForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const roles = useRoles()
  const [form, setForm] = useState({ name: '', email: '', roleId: '', password: '' })
  const roleId = form.roleId || roles.data?.find((r) => r.key === 'SUPPORT')?.id || ''
  const role = roles.data?.find((r) => r.id === roleId)
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => send('POST', '/admin/admins', { ...form, roleId }),
    onSuccess: () => {
      toast.success(t.common.saved)
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
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
      <Field required id="arole" label={t.admins.role} hint={role?.isSuper ? t.permissions.superNote : (role?.description ?? undefined)}>
        <RoleSelect id="arole" value={roleId} onChange={(id) => setForm((f) => ({ ...f, roleId: id }))} />
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
        <Button type="submit" disabled={save.isPending || !roleId}>
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

/* ── Roles ── */

function RolesTab({ onEdit }: { onEdit: (role: AdminRoleInfo) => void }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const roles = useRoles()
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  if (roles.isPending) return <LoadingState />
  if (roles.isError) return <ErrorState onRetry={() => void roles.refetch()} />

  return (
    <>
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {roles.data.map((r) => (
          <li key={r.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', r.isSuper ? 'bg-primary text-primary-foreground' : 'bg-brand-soft text-primary')}>
                <ShieldCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {roleName(r, t)}
                  {r.key && <FlagBadge tone="muted">{t.admins.builtIn}</FlagBadge>}
                </p>
                <p className="text-sm text-muted-foreground">{r.isSuper ? t.permissions.superNote : r.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fill(t.admins.adminsCount, { n: (r.adminCount ?? 0).toLocaleString(locale) })} ·{' '}
                  {r.isSuper ? t.admins.all : fill(t.admins.permissionsCount, { n: r.permissions.length })}
                </p>
              </div>
              {!r.isSuper && (
                <span className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={t.admins.editRole} onClick={() => onEdit(r)}>
                    <Pencil />
                  </Button>
                  {!r.key && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t.common.delete}
                      disabled={(r.adminCount ?? 0) > 0}
                      onClick={() =>
                        setConfirm({
                          title: fill(t.admins.deleteRole, { name: r.name }),
                          description: t.admins.deleteRoleBody,
                          confirmLabel: t.common.delete,
                          destructive: true,
                          errorText: (e) => errorText(e, t),
                          onConfirm: async () => {
                            await send('DELETE', `/admin/roles/${r.id}`)
                            void queryClient.invalidateQueries({ queryKey: ROLES })
                            toast.success(t.admins.roleDeleted)
                          },
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </span>
              )}
            </div>
            {!r.isSuper && (
              <div className="flex flex-col gap-1.5 border-t pt-3">
                {ADMIN_PERMISSION_GROUPS.map((g) => {
                  const granted = g.permissions.filter((p) => r.permissions.includes(p))
                  if (!granted.length) return null
                  return (
                    <p key={g.key} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="w-20 shrink-0 font-medium text-muted-foreground">{t.permissions.groups[g.key]}</span>
                      {granted.map((p) => (
                        <span key={p} className="rounded-full bg-muted px-2 py-0.5">
                          {t.permissions.names[p]}
                        </span>
                      ))}
                    </p>
                  )
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function RoleForm({ role, onDone }: { role: AdminRoleInfo | null; onDone: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [permissions, setPermissions] = useState<AdminPermission[]>(role?.permissions ?? ['dashboard'])
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || null, permissions }
      return role ? send('PUT', `/admin/roles/${role.id}`, body) : send('POST', '/admin/roles', body)
    },
    onSuccess: () => {
      toast.success(t.common.saved)
      // Admins on this role see the change too.
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
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
        <DialogTitle>{role ? t.admins.editRole : t.admins.addRole}</DialogTitle>
        <DialogDescription className="sr-only">{t.admins.rolesTab}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field required id="rname" label={t.admins.roleName}>
          <Input id="rname" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="rdesc" label={t.admins.roleDescription}>
          <Textarea id="rdesc" rows={1} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-9" />
        </Field>
      </div>
      <PermissionPicker value={permissions} onChange={setPermissions} />
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
          {save.isPending && <LoaderCircle className="animate-spin" />}
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}
