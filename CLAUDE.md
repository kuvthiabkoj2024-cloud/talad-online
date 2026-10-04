# Taladonline

pnpm + Turborepo monorepo. See README.md for layout and setup; product scope in
marketplace-project-scope.md (code comments cite its sections as §x.y).

## Commands (repo root, Node 24)

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`: run before declaring work done
- `pnpm --filter @talad/<web|admin|shop|mobile|api|ui|shared> <script>`: one package
- `pnpm db:generate` after editing `services/api/prisma/schema.prisma`; `pnpm db:migrate` to create a migration

## Rules

- Accounts: one `Customer` row is a platform account. Everyone buys with it, and it may own one
  `Shop` (`Shop.ownerId`). Shops have no credentials — owners sign in to the Seller Center with the
  same account. A shop can't buy its own products (`OWN_PRODUCT`, enforced in cart and checkout).

- These are the latest majors (Next 16, NestJS 12, Prisma 7, Vite 8, Expo SDK 57, React Router 8,
  TypeScript 6, pnpm 12). Check package docs/types before relying on older APIs.
  `apps/web/AGENTS.md` and `apps/mobile/AGENTS.md` have framework-specific rules.
- API code is ESM: relative imports need `.js` extensions. The Prisma client is generated into
  `services/api/src/generated/prisma` (gitignored).
- `@talad/shared` compiles to `dist/`; Turbo builds it before dependents. Keep its enums in sync with Prisma.
- Admin/shop use `erasableSyntaxOnly`: no TS enums or parameter properties.
- Add shadcn components with `pnpm dlx shadcn@latest add <name> -c packages/ui`.
- Add mobile deps with `npx expo install <pkg>` (from `apps/mobile`).
