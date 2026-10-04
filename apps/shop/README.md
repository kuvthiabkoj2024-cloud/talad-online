# @talad/shop — Shop dashboard (Seller Center)

Vendor tools: products, orders, promotions, customers, finance and reviews (scope §3).

Vite 8 + React 19 + TypeScript, React Router 8, TanStack Query, and the shared
shadcn/ui design system in `packages/ui`.

```bash
cp .env.example .env.local
pnpm dev        # http://localhost:5174
```

- Routes: `src/router.tsx` · sidebar: `src/nav.ts` · API client: `src/lib/api.ts`
- Add shadcn components to the shared package: `pnpm dlx shadcn@latest add <component> -c packages/ui`
