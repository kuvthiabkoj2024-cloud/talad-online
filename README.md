# Taladonline

A multi-vendor marketplace for Laos: customers buy from many shops in one cart, shops run
their business from a Seller Center, and Taladonline staff run the platform from an admin
console. Product scope lives in [`marketplace-project-scope.md`](marketplace-project-scope.md)
(code comments cite its sections as `§x.y`).

| App | What it is | Users | Dev URL |
|---|---|---|---|
| `apps/web` | Customer storefront (Next.js, Lao / English) | Shoppers | http://localhost:3000 |
| `apps/shop` | Seller Center (React SPA) | Shop owners | http://localhost:5174 |
| `apps/admin` | Admin console (React SPA) | Taladonline staff | http://localhost:5173 |
| `apps/mobile` | Customer app (Expo / React Native) | Shoppers | Expo, http://localhost:8081 on web |
| `services/api` | REST API for all of the above (NestJS) | — | http://localhost:4000/api/v1 · docs at `/docs` |

---

## Contents

- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Commands](#commands)
- [Build commands](#build-commands)
- [Configuration](#configuration)
- [How it fits together](#how-it-fits-together)
- [Deployment](#deployment)

---

## Tech stack

| Area | Tools |
|---|---|
| Monorepo | pnpm 12 workspaces, Turborepo, Node 24 (`.nvmrc`), TypeScript 6 |
| API | NestJS 12 (ESM), Prisma 7 + PostgreSQL 18, class-validator, Swagger |
| Storefront | Next.js 16 (App Router, server actions), Tailwind CSS 4 |
| Seller Center & admin | Vite 8, React 19, React Router 8, TanStack Query, shadcn/ui |
| Mobile | Expo SDK 57, expo-router, NativeWind |
| Media | Bunny Storage + Bunny CDN (images, videos, private files) |
| AI | Anthropic Claude (shop chat bot, shopping assistant, photo search keywords), local CLIP model (photo search) |
| Quality | oxlint / ESLint, Vitest, GitHub Actions CI |

---

## Repository layout

```text
talad-online/
├── apps/
│   ├── web/          Customer storefront (Next.js)
│   ├── shop/         Seller Center (Vite SPA)
│   ├── admin/        Admin console (Vite SPA)
│   └── mobile/       Customer mobile app (Expo)
├── services/
│   └── api/          NestJS REST API + Prisma schema, migrations and seed
├── packages/
│   ├── shared/       Types, enums and rules shared by every app (compiled to dist/)
│   └── ui/           shadcn/ui components, hooks and the shared Tailwind theme
├── infra/
│   └── docker/       docker-compose.yml for local Postgres, Redis, Meilisearch, Mailpit
├── .github/workflows/ci.yml   lint → typecheck → test → build on every push / PR
├── marketplace-project-scope.md   Product scope (§ references in code)
├── turbo.json        Task pipeline (builds @talad/shared before its dependents)
└── pnpm-workspace.yaml
```

### `services/api` — the API

```text
services/api/
├── prisma/
│   ├── schema.prisma        Data model (Customer, Shop, Product, ShopOrder, Coupon, AdminRole…)
│   ├── migrations/          SQL migrations, applied with `prisma migrate deploy`
│   ├── seed.ts              Admin roles + accounts, categories, units, demo shop & products
│   └── demo-*.ts            Demo content used by the seed
└── src/
    ├── main.ts              Bootstrap: /api prefix, URI versioning (/v1), CORS, validation, Swagger
    ├── app.module.ts        Wires the modules below
    ├── config/              Environment validation (env.validation.ts)
    ├── prisma/              PrismaService
    ├── health/              /api/health/live and /api/health/ready
    ├── generated/prisma/    Generated Prisma client (gitignored; `pnpm db:generate`)
    └── modules/
        ├── auth/            Customer sign-in (SMS code, password, Google/Apple), sessions, 2FA,
        │                    shop-owner and admin guards, admin permissions
        ├── admins/          Admin accounts, roles & permissions, admin sign-in
        ├── customers/       Profiles, addresses, admin customer management
        ├── shops/           Shop applications (KYC), approval, shop profile, admin shop review
        ├── catalog/         Categories, units, products & variants, feed videos, photo search,
        │                    shopping assistant chat
        ├── cart/            Multi-shop cart (flash-sale prices applied here)
        ├── orders/          Checkout, coupons, shop order workflow, payment slips, deadlines,
        │                    buy-by-chat order cards, admin orders, payouts
        ├── payments/        Payment methods (QR bank transfer, cash on delivery)
        ├── promotions/      Shop coupons & coupon batches, flash sales, banners, platform coupons
        ├── messages/        Customer ↔ shop chat, read receipts, the shop chat bot
        ├── notifications/   In-app notifications (customer, shop, admin), announcements
        ├── realtime/        Server-sent events, fan-out through Postgres LISTEN/NOTIFY
        ├── reviews/         Product reviews and shop replies
        ├── reports/         Shop statistics & finance, admin dashboard & reports
        ├── delivery/        Couriers and shipping zones
        ├── disputes/        Returns escalated to admins
        ├── loyalty/         Loyalty points
        ├── cms/             Pages (About, Terms…, rich text), platform settings
        ├── media/           Uploads to Bunny Storage, public / private URLs
        ├── ai/              Anthropic client
        └── audit/           Audit log of admin actions
```

### `apps/web` — customer storefront

```text
apps/web/src/
├── app/
│   ├── [lang]/                  Every page is under /lo or /en
│   │   ├── (store)/             Home, category (/c), product (/p/[shop]/[slug]), shop (/s/[slug]),
│   │   │                        search, photo scan, feed (videos), cart & checkout, account &
│   │   │                        orders, messages, notifications, CMS pages, login/register
│   │   └── dictionaries/        lo.json / en.json translations
│   └── api/                     Route handlers: live events (SSE proxy), private images
│                                (payment QR, slips, chat photos, avatars)
├── components/                  UI by feature (cart, chat, feed, product, account, …)
└── lib/                         API client, session cookie, server actions (*-actions.ts)
public/sw.js                     Service worker (caches immutable assets only)
```

### `apps/shop` — Seller Center

```text
apps/shop/src/
├── pages/        home (phone hub) / stats (desktop home), products & product editor, videos,
│                 orders & order detail, messages, coupons, marketing (flash sales), customers,
│                 finance, reviews, chat bot, shop profile, security, register (shop application)
├── components/   App shell & sidebar, video viewer, order chat cards, notification bell…
├── lib/          API client, printing (bills, stickers, coupons), barcode, formatting
├── hooks/        Shared queries (summary, badges, unread…)
├── i18n/         lo.ts / en.ts
└── nav.ts        Sidebar menu (also the phone home grid)
```

### `apps/admin` — admin console

```text
apps/admin/src/
├── pages/        dashboard, reports, shops, products, customers, orders, disputes, payouts,
│                 platform coupons, categories, units, banners, pages (rich text editor),
│                 announcements, delivery, settings, admins (roles & permissions), audit log
├── components/   App shell & sidebar, payout detail, rich text editor, confirm dialogs…
├── auth/         Session context and `can(admin, permission)`
├── i18n/         lo.ts / en.ts
└── nav.ts        Sidebar menu with the permission each item needs
```

### `apps/mobile` — customer app

```text
apps/mobile/src/
├── app/          expo-router screens (home, categories, cart, account…)
├── components/   Native UI
└── lib/          API client
```

### `packages/`

- **`shared`** — order statuses, coupon and flash-sale rules, admin permissions and roles,
  notification types, phone formatting… Used by the API and every app. It compiles to
  `dist/`, and Turbo builds it first. Keep its enums in sync with the Prisma schema.
- **`ui`** — shadcn/ui components (`src/components`), hooks, and `globals.css` (theme tokens,
  the sidebar tab style). Add components with `pnpm dlx shadcn@latest add <name> -c packages/ui`.

---

## Getting started

### Requirements

- Node 24 (`nvm use` reads `.nvmrc`) and pnpm 12 (`corepack enable`)
- Docker, for the local database and services

### First run

```bash
pnpm install                     # also generates the Prisma client
pnpm infra:up                    # Postgres :5433, Redis :6379, Meilisearch :7700, Mailpit :8025

# Settings for each app (defaults work locally; see Configuration)
cp services/api/.env.example services/api/.env
cp apps/web/.env.example     apps/web/.env.local
cp apps/shop/.env.example    apps/shop/.env.local
cp apps/admin/.env.example   apps/admin/.env.local
cp apps/mobile/.env.example  apps/mobile/.env

pnpm db:migrate                  # apply migrations
pnpm db:seed                     # roles, admins, categories, units, demo shop & products

pnpm dev                         # API, storefront, Seller Center and admin together
```

Uploads (product photos, videos, logos) need a Bunny storage zone: fill the `BUNNY_*` values
in `services/api/.env`. The rest of the app works without it.

### Seeded accounts

| Where | Account | Password |
|---|---|---|
| Admin console | `admin@talad.local` (Super Admin) | `SEED_ADMIN_PASSWORD`, default `ChangeMe123!` |
| Admin console | `support@talad.local`, `finance@talad.local` | same |
| Storefront | Demo Customer, phone `020 9999 0000` | SMS code: printed in the API log and shown on screen in development |
| Seller Center | Demo Shop Owner (owns "Taladonline Demo Shop"), phone `020 8888 0000` | same |

---

## Commands

Run from the repository root.

| Command | Does |
|---|---|
| `pnpm dev` | Every app in watch mode |
| `pnpm --filter @talad/<web\|shop\|admin\|mobile\|api> dev` | One app |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | The full check (same as CI) — run before calling work done |
| `pnpm db:migrate` | Create / apply a migration after editing `schema.prisma` (dev) |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:seed` | Seed roles, admins, catalog and demo data |
| `pnpm db:studio` | Browse the database |
| `pnpm --filter @talad/api db:deploy` | Apply migrations without prompts (production) |
| `pnpm infra:up` / `pnpm infra:down` | Start / stop local Docker services |
| `cd apps/mobile && npx expo install <pkg>` | Add a mobile dependency |

---

## Build commands

Run from the repository root. `@talad/shared` is always built first (Turbo handles the order).

### Without Docker

| Build | Command | Output |
|---|---|---|
| Everything | `NODE_ENV=production pnpm build` | all of the below |
| API | `pnpm turbo run build --filter=@talad/api` | `services/api/dist/` |
| Storefront | `NODE_ENV=production pnpm turbo run build --filter=@talad/web` | `apps/web/.next/` |
| Seller Center | `NODE_ENV=production pnpm turbo run build --filter=@talad/shop` | `apps/shop/dist/` |
| Admin | `NODE_ENV=production pnpm turbo run build --filter=@talad/admin` | `apps/admin/dist/` |
| Shared package only | `pnpm --filter @talad/shared build` | `packages/shared/dist/` |

With `NODE_ENV=production`, the storefront, Seller Center and admin read their
`.env.production` and bake those URLs into the build.

### With Docker

All images come from `infra/docker/Dockerfile`, one target per app:

```bash
# One image at a time
docker build -f infra/docker/Dockerfile --target api   -t talad/api   .
docker build -f infra/docker/Dockerfile --target web   -t talad/web   .
docker build -f infra/docker/Dockerfile --target shop  -t talad/shop  .
docker build -f infra/docker/Dockerfile --target admin -t talad/admin .

# Or the whole production stack through compose
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod build
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod build web   # one service

# Build without cache (after changing a .env.production, or if a build looks stale)
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod build --no-cache web
```

| Image | Target | Runs | Port inside |
|---|---|---|---|
| `talad/api` | `api` | `node dist/main.js` | 4000 |
| `talad/web` | `web` | `next start` | 3000 |
| `talad/shop` | `shop` | nginx serving the Seller Center | 80 |
| `talad/admin` | `admin` | nginx serving the admin console | 80 |

Building an image for a server with a different CPU (for example on an Apple Silicon Mac for
an Intel/AMD server): add `--platform linux/amd64` to `docker build`.

### Mobile

```bash
cd apps/mobile
npx eas-cli build --platform android    # or ios, or all
```

---

## Configuration

Every app reads its own env file. The `.env.example` files list every value with comments.

### API — `services/api/.env`

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | | `production` in production: hides `/docs` and stops returning dev sign-in codes |
| `PORT` | | Default `4000` |
| `DATABASE_URL` | ✅ | PostgreSQL. Must be a **direct** connection (not a transaction-mode pooler): live updates use `LISTEN` |
| `REDIS_URL` | ✅ | Validated at start-up |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ✅ | Long random strings: `openssl rand -base64 48` |
| `CORS_ORIGINS` | ✅ | Comma-separated origins of the storefront, Seller Center, admin (and Expo web) |
| `ADMIN_APP_URL` | | Admin console URL, for password-reset links |
| `BUNNY_STORAGE_ZONE`, `BUNNY_API_KEY`, `BUNNY_BASE_HOSTNAME`, `BUNNY_CDN_HOST` | for uploads | Storage zone name and password, its region endpoint, and the pull-zone URL |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | optional | Smart chat-bot replies, shopping assistant, photo-search keywords. Without a key the bot uses built-in replies |
| `IMAGE_SEARCH_ENABLED`, `MODEL_CACHE_DIR` | | Photo search downloads a ~90 MB model once into `MODEL_CACHE_DIR` |
| `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID` | optional | Social sign-in audiences (comma-separated for web + mobile) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | | The first Super Admin created by the seed |
| `MEILI_URL`, `MEILI_MASTER_KEY` | optional | Reserved for search; not used yet |

### Storefront — `apps/web/.env.local`

| Variable | Notes |
|---|---|
| `API_URL` | API base URL used by the Next.js server, e.g. `https://api.taladonline.la/api/v1` |
| `NEXT_PUBLIC_SHOP_URL` | Seller Center URL ("Sell on Taladonline" links) |
| `NEXT_PUBLIC_MEDIA_HOST` | Bunny pull-zone hostname (no `https://`), for optimised images |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_APPLE_CLIENT_ID`, `NEXT_PUBLIC_APPLE_REDIRECT_URI` | Optional social sign-in |

### Seller Center and admin — `apps/shop/.env.local`, `apps/admin/.env.local`

| Variable | Notes |
|---|---|
| `VITE_API_URL` | API base URL as the browser reaches it |
| `VITE_STOREFRONT_URL` | Storefront URL, for "view shop / view product" links |
| `VITE_DEV_ADMIN_EMAIL`, `VITE_DEV_ADMIN_PASSWORD` | Admin only, development only: pre-fills the sign-in form |

### Mobile — `apps/mobile/.env`

| Variable | Notes |
|---|---|
| `EXPO_PUBLIC_API_URL` | API base URL. On a physical device use your computer's LAN IP, not `localhost` |

`NEXT_PUBLIC_*`, `VITE_*` and `EXPO_PUBLIC_*` values are **baked in at build time**: rebuild the
app after changing them.

---

## How it fits together

- **One account, two roles.** A `Customer` row is a platform account. Everyone buys with it,
  and it may own one `Shop`. Shop owners sign in to the Seller Center with the same account,
  and a shop can't buy its own products.
- **Sessions.** Opaque tokens stored hashed in `Session`. The storefront keeps the token in an
  httpOnly cookie and calls the API from the server. The Seller Center and admin send it as a
  `Bearer` header.
- **Admin permissions.** `AdminRole` holds a named set of permissions (see
  `packages/shared/src/roles.ts`). An admin can also have their own list instead of the role's.
  The API checks a permission on every admin route (`@Permission`), and only Super Admins
  manage admins and roles.
- **Orders.** A checkout splits into one `ShopOrder` per shop. Each order goes
  `PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED → COMPLETED`. It completes when the
  customer taps "I received it", or automatically after the shop's confirmation window. Unpaid
  orders are cancelled when their payment window ends. These sweeps run inside the API every
  5 minutes.
- **Money.**
  - Customers pay each shop directly, by QR bank transfer (with a slip upload) or cash on delivery.
  - Flash sales lower the item price. Coupons lower the order total.
  - Each item stores its regular price and its commission.
  - A shop is owed what the customer paid, plus any platform-coupon discount, minus commission.
  - Admins settle completed orders with shops through **Payouts**.
- **Live updates.** Changes call Postgres `pg_notify('talad_realtime', …)` inside their
  transaction. `RealtimeService` listens and pushes them as server-sent events (`/me/events`,
  `/me/shop/events`, `/admin/events`). The storefront proxies its stream at `/api/events`.
- **Media.** Public images and videos are served from Bunny CDN. Private files (KYC documents,
  payment QR codes, slips, chat photos) are only streamed through the API to whoever may see them.
- **Not wired yet.** Email and SMS only write to the API log (`EmailService`, `SmsService`), and
  there is no online payment gateway. See the deployment checklist.

---

## Deployment

### What runs where

```text
                    ┌──────────────── Bunny CDN (images, videos) ────────────────┐
                    │                                                             │
 Shoppers ─► www.taladonline.la ──► Next.js storefront (node) ──┐                 │
 Sellers ──► shop.taladonline.la ─► static files (Seller Center) │                │
 Staff ────► admin.taladonline.la ► static files (admin)         ├─► api.taladonline.la ─► NestJS API (node)
 Mobile app ─────────────────────────────────────────────────────┘                    │
                                                                          PostgreSQL · Redis · Bunny Storage
```

- **Two Node processes:** the API (`node dist/main.js`) and the storefront (`next start`).
- **Two folders of static files:** `apps/shop/dist` and `apps/admin/dist`, served by any web
  server or CDN with a fallback to `index.html`.
- **Managed services:** PostgreSQL 18, Redis, and a Bunny storage zone with a pull zone.

The example domains below are placeholders; use your own.

### 1. Prepare the services

1. **PostgreSQL 18.** Create a database and a user. Use a direct connection string, or a
   session-mode pooler. Transaction-mode poolers break `LISTEN`, so live updates would stop.
2. **Redis.**
3. **Bunny.** Create a storage zone (note its password and region endpoint) and a pull zone
   linked to it. Private files share the zone under unguessable names and are only handed
   out through the API. For extra safety, add pull-zone edge rules that block:
   - `*/kyc/*` (shop documents)
   - `*/payments/*` (payment slips and refund QR codes)
   - `*/payment-qr-*` (shops' payment QR codes)
   - `/c-*/profile/*` (uploaded avatars)
   - `/m-*` (chat photos)

   The folder layout is in `services/api/src/modules/media/storage-keys.ts`.
4. **DNS and TLS** for the storefront, Seller Center, admin and API domains.
5. **Secrets.** Generate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` with
   `openssl rand -base64 48`. Pick a strong `SEED_ADMIN_PASSWORD`.

### 2. Build

Production settings live in a **`.env.production`** file in each app. Git ignores these files
(`.gitignore`): copy them to the server yourself, never commit them.

| File | Domain |
|---|---|
| `services/api/.env.production` | api.taladonline.la (read when `NODE_ENV=production`, before `.env`) |
| `apps/web/.env.production` | taladonline.la and www.taladonline.la |
| `apps/shop/.env.production` | shop.taladonline.la |
| `apps/admin/.env.production` | admin.taladonline.la |
| `apps/mobile/.env.production` | the mobile app's API address |

Fill in every `CHANGE_ME` value: database, Redis, and Bunny. The JWT secrets and the first
admin password are already generated. Then, on the server or in CI, with Node 24 and pnpm 12:

```bash
pnpm install --frozen-lockfile
NODE_ENV=production pnpm build   # @talad/shared first, then the API, storefront, Seller Center and admin
```

Don't keep the development `apps/web/.env.local` on the build machine. Next.js lets `.env.local`
override `.env.production`, so its `localhost` addresses would be used. Vite apps prefer
`.env.production`, so `.env.local` is harmless there.

Outputs:

| App | Output | Run with |
|---|---|---|
| API | `services/api/dist/` | `node dist/main.js` (from `services/api`, with its `.env`) |
| Storefront | `apps/web/.next/` | `pnpm --filter @talad/web start -- -p 3010` (pick a free port) |
| Seller Center | `apps/shop/dist/` | static files |
| Admin | `apps/admin/dist/` | static files |

### 3. Configure and migrate the API

```bash
cd services/api                 # .env.production is in place (see step 2)
NODE_ENV=production pnpm db:deploy   # apply all migrations (safe to run on every release)
NODE_ENV=production pnpm db:seed     # FIRST DEPLOY ONLY: roles, the first Super Admin, categories, units
```

The seed also adds a demo shop and products. On a real launch, remove or hide them afterwards:
in the admin console, suspend the demo shop.

`CORS_ORIGINS` already lists taladonline.la, www.taladonline.la, shop.taladonline.la and
admin.taladonline.la, and `ADMIN_APP_URL` points at the admin console.

### 4. Run the API and storefront

Keep both processes running with your process manager (systemd, PM2, Docker…), for example:

```bash
# API
cd services/api && NODE_ENV=production node dist/main.js

# Storefront
cd apps/web && NODE_ENV=production pnpm start -- -p 3010
```

- **Health checks:** `GET /api/health/live` (process up) and `GET /api/health/ready`
  (database reachable).
- **Photo-search model:** keep `MODEL_CACHE_DIR` on persistent disk so the model downloads only
  once.
- **Running several API instances:** they can share the work. Live events reach every instance
  through Postgres, and the order-deadline sweeps use conditional updates, so an order is
  never moved twice.

### Running with Docker (recommended on a shared server)

Never use `pnpm dev` on a server: it starts development servers on fixed ports (3000, 5173,
5174, 8081…) that other apps may already use. Everything is built and run with Docker instead:

| File | What it does |
|---|---|
| `infra/docker/Dockerfile` | One image per app: `api`, `web` (Node), `shop`, `admin` (nginx serving the built files) |
| `infra/docker/Dockerfile.dockerignore` | Keeps `node_modules`, `.env`, `.env.local` and the API's `.env.production` out of every image |
| `infra/docker/nginx-spa.conf` | nginx inside the Seller Center / admin images (app routes, long caching of hashed assets) |
| `infra/docker/docker-compose.prod.yml` | The whole stack: Postgres, Redis, API, storefront, Seller Center, admin |

Every container listens on **127.0.0.1 only**, on ports chosen to avoid other apps. The
server's own nginx handles TLS and sends each domain to its port:

| Domain | Container | Local port |
|---|---|---|
| api.taladonline.la | `api` | 127.0.0.1:4000 |
| taladonline.la, www.taladonline.la | `web` | 127.0.0.1:3010 |
| shop.taladonline.la | `shop` | 127.0.0.1:8110 |
| admin.taladonline.la | `admin` | 127.0.0.1:8120 |
| (backups, admin tools) | `postgres`, `redis` | 127.0.0.1:5433, 127.0.0.1:6380 |

Change a port in `docker-compose.prod.yml` (and in nginx) if it's taken; `ss -tlnp` lists what's
in use. Inside the stack the API reaches Postgres and Redis by service name. Compose sets
`DATABASE_URL`, `REDIS_URL` and `TRUST_PROXY` itself, over the values in `.env.production`.

**First deploy**, from the repository root on the server:

```bash
# 0. Files that are not in git: copy the .env.production files to the server
#    (services/api, apps/web, apps/shop, apps/admin), then create the database passwords:
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > infra/docker/.env.prod

# A shortcut for the commands below
alias talad='docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod'

# 1. Build the images and start Postgres + Redis
talad build
talad up -d postgres redis

# 2. Create the tables, then the first Super Admin, roles and catalog (seed: first deploy only)
talad run --rm api pnpm db:deploy
talad run --rm api pnpm db:seed

# 3. Start everything
talad up -d
talad ps                                   # all "healthy" / "running"
curl http://127.0.0.1:4000/api/health/ready
```

**Updating:**

```bash
git pull
talad build
talad run --rm api pnpm db:deploy          # new migrations, if any
talad up -d                                # recreates only the containers that changed
docker image prune -f                      # remove old image layers
```

**Logs and backups:**

```bash
talad logs -f api                          # or web, shop, admin
talad exec postgres pg_dump -U talad talad | gzip > talad-$(date +%F).sql.gz
```

Notes:
- **Build-time settings.** The storefront, Seller Center and admin bake their public URLs
  (from their `.env.production`) into the build. Rebuild those images after changing them.
- **Memory.** Building the storefront needs about 2–3 GB of RAM. On a small server, build when
  traffic is low, or build on another machine and push the images to a registry.
- **Don't run the development stack here.** The development `infra/docker/docker-compose.yml`
  publishes Postgres, Meilisearch and Mailpit on all interfaces with dev passwords. Stop it on a
  server: `docker compose -f infra/docker/docker-compose.yml down`.

### 5. Reverse proxy

Product videos upload through the API (up to ~200 MB), and live updates are long-lived
server-sent event streams. The proxy must allow large bodies and long requests, and must not
buffer the event streams. An nginx example:

```nginx
# API
server {
  server_name api.taladonline.la;
  client_max_body_size 250m;            # product videos
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1800s;           # long uploads
    proxy_send_timeout 1800s;
  }
  location ~ /events$ {                 # live updates (SSE)
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_read_timeout 1h;
  }
}

# Storefront
server {
  server_name taladonline.la www.taladonline.la;
  client_max_body_size 20m;             # payment slips, photo search
  location / { proxy_pass http://127.0.0.1:3010; proxy_set_header Host $host; }
  location /api/events {                # storefront live updates (SSE proxy)
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_read_timeout 1h;
  }
}

# Seller Center and admin (Docker containers serve the built files)
server {
  server_name shop.taladonline.la;
  location / { proxy_pass http://127.0.0.1:8110; proxy_set_header Host $host; }
}
server {
  server_name admin.taladonline.la;
  location / { proxy_pass http://127.0.0.1:8120; proxy_set_header Host $host; }
}
```

Without Docker, the Seller Center and admin can be served straight from `apps/shop/dist` and
`apps/admin/dist` by nginx (`try_files $uri /index.html;`) or any static host. Add TLS with
`certbot --nginx -d taladonline.la -d www.taladonline.la -d api.taladonline.la -d shop.taladonline.la -d admin.taladonline.la`.

### 6. Mobile app

Set `EXPO_PUBLIC_API_URL` to the production API, then build and submit with
[EAS](https://docs.expo.dev/build/introduction/):

```bash
cd apps/mobile
npx eas-cli build --platform all        # creates eas.json on first run
npx eas-cli submit --platform all
```

### 7. Launch checklist

- [ ] Sign in to the admin console as the seeded Super Admin, **change the password** and
      **turn on two-step verification**.
- [ ] **Settings:**
  - [ ] product review mode
  - [ ] default commission
  - [ ] payment methods
  - [ ] loyalty points
- [ ] **Catalog and content:**
  - [ ] categories and units
  - [ ] couriers and shipping zones (Delivery)
  - [ ] the About / Terms / Privacy / FAQ pages
- [ ] **Staff:** create admin accounts and give each a role (Admin users → Roles & permissions).
- [ ] **SMS and email providers.** `SmsService` and `EmailService` currently only log messages,
      and customers and shops sign in with SMS codes. Connect a gateway before going live.
- [ ] Hide or suspend the demo shop from the seed.
- [ ] Check `CORS_ORIGINS`, the Bunny keys, and `NODE_ENV=production` (which also hides `/docs`).
- [ ] **Database backups:** schedule daily PostgreSQL dumps and test a restore. Uploaded files
      live in Bunny Storage, so back up or replicate that zone too.

### 8. Releasing an update

```bash
git pull
pnpm install --frozen-lockfile
NODE_ENV=production pnpm build                          # uses the .env.production files
NODE_ENV=production pnpm --filter @talad/api db:deploy  # new migrations, if any
# restart the API and storefront; upload the new apps/shop/dist and apps/admin/dist
```

Visitors with an old Seller Center, admin or storefront tab open pick up the new version on
their next page load. The storefront's service worker only caches files with hashed names, so
it never serves stale pages.

### Continuous integration

`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` on
every push to `main` and on pull requests.


## build command:
cd /var/www/talad-online
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod build
