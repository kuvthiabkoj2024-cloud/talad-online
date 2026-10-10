# @talad/shop — Seller Center

Vendor tools (scope §3). Shop owners sign in with the same Taladonline account they shop
with (phone + SMS code); the account must own a shop (`Shop.ownerId`).

Vite 8 + React 19 + TypeScript, React Router 8, TanStack Query, and the shared
shadcn/ui design system in `packages/ui` (brand colours in `src/styles.css`).

```bash
cp .env.example .env.local
pnpm dev        # http://localhost:5174
```

Demo shop owner: **020 8888 0000** (`pnpm db:seed`). Outside production the API returns the
SMS code, and the sign-in page shows it.

- Built: sign-in, home (phone home screen / desktop dashboard), products (list + editor with
  photos, video and options), coupons. Other sections show "coming soon" (`COMING_SOON` in `src/nav.ts`).
- Layout: desktop has a collapsible sidebar (`components/app-sidebar.tsx`, Ctrl/⌘+B, state in the
  `sidebar_state` cookie); phones get native-style screens with a back arrow and the home tool grid.
- Strings: `src/i18n/en.ts` and `lo.ts` (Lao default; `lo.ts` is type-checked against `en.ts`).
- Session: the API token is kept in `localStorage` and sent as a Bearer header (`src/lib/api.ts`).
- API: shop-owner endpoints live under `/me/shop/*` (`ShopOwnerGuard` in services/api).
- Add shadcn components to the shared package: `pnpm dlx shadcn@latest add <component> -c packages/ui`

## Installable app (PWA)

- Manifest `public/manifest.webmanifest`, icons `public/icons/`, iOS tags in `index.html`.
- Service worker `public/sw.js`, registered in `src/main.tsx` for production builds only. The app
  shell opens offline (screens then ask to check the connection); API calls are never cached.
  Bump `VERSION` in `sw.js` when its caching rules change.
- Install prompt: `src/components/install-banner.tsx`, shown inside the signed-in dashboard.
- Try it: `pnpm build && pnpm preview`. Installing needs HTTPS (or localhost).
