# @talad/api — Marketplace API

NestJS 12 (ESM) modular monolith with Prisma 7 on PostgreSQL (scope §8.2).

```bash
cp .env.example .env
pnpm db:migrate     # create/apply migrations (needs `pnpm infra:up` from repo root)
pnpm db:seed        # super admin, units, categories, CMS stubs, settings
pnpm dev            # http://localhost:4000/api/v1 · Swagger UI at /docs
```

| Path | Purpose |
|---|---|
| `prisma/schema.prisma` | Data model for the MVP (Phase 1) |
| `src/config/env.validation.ts` | Validates environment at boot |
| `src/prisma/` | Global `PrismaService` (driver adapter `@prisma/adapter-pg`) |
| `src/health/` | `GET /api/health/live`, `GET /api/health/ready` |
| `src/modules/*` | One Nest module per domain: auth, shops, catalog, orders, payments … |

`src/modules/catalog/categories` is the reference slice (controller → service → Prisma,
with a unit test). Follow its shape when filling in other modules.

Tests: `pnpm test` (unit, Vitest) · `pnpm test:e2e`.
