# @talad/admin — Admin dashboard

Platform administration: shops, customers, catalog moderation, delivery, promotions, disputes, reports and CMS (scope §2).

Vite 8 + React 19 + TypeScript, React Router 8, TanStack Query, and the shared
shadcn/ui design system in `packages/ui`.

```bash
cp .env.example .env.local
pnpm dev        # http://localhost:5173
```

Sign in with the seeded staff accounts (password `SEED_ADMIN_PASSWORD` from `services/api/.env`,
`ChangeMe123!` by default): `admin@talad.local` (Super admin), `support@talad.local` (Support) and
`finance@talad.local` (Finance).

## Accounts & sign-in (§2.1)

- There is no public sign-up: a Super admin creates staff under **Admin users** with a temporary password.
- **Forgot password?** emails a one-time link (`/reset-password?token=…`, valid 30 minutes; set
  `ADMIN_APP_URL` in `services/api/.env`). No email provider is connected yet, so outside production the
  link is logged and shown on screen.
- **Two-step verification**: staff turn on an authenticator app from the account menu. A Super admin can
  clear it (**Reset 2FA**) for someone who lost their phone.

## Roles (§2.1)

What each role can open is in `src/auth/context.ts` (`ACCESS`) and mirrors the API's `@Roles` guards.
Super admin can open everything. Support handles shops, products, customers, orders and disputes.
Finance handles payouts, reports and commission rates, and can view shops and orders. Areas without
an entry are Super admin only.

## Layout

- Routes: `src/router.tsx` (lazy pages, each wrapped in `RequireArea`) · sidebar: `src/nav.ts`
- API client: `src/lib/api.ts` (Bearer token in `localStorage.talad_admin_token`)
- Strings: `src/i18n/en.ts` and `lo.ts` (same shape, checked by the `Dict` type)
- Moderation decisions use one `ConfirmDialog` (`src/components/confirm-dialog.tsx`)
- Add shadcn components to the shared package: `pnpm dlx shadcn@latest add <component> -c packages/ui`
