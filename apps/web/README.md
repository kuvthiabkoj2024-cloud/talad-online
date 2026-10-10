# @talad/web — Customer storefront

Next.js 16 (App Router, React Compiler, Tailwind CSS 4). SEO-indexable landing page and
catalog for customers and guests (scope §4, §5).

- Locale-prefixed routes: `/lo`, `/th`, `/en` (`src/app/[lang]`). `src/proxy.ts` redirects
  locale-less URLs using the `NEXT_LOCALE` cookie, then `Accept-Language`.
- Translations: `src/app/[lang]/dictionaries/*.json`, loaded server-side with `getDictionary()`.
- Data: server components call the API through `src/lib/api.ts` (`API_URL`).
- Installable as a PWA via `src/app/manifest.ts`.

```bash
cp .env.example .env.local
pnpm dev        # http://localhost:3000
```

> Next.js 16 differs from older versions — see `AGENTS.md` and `node_modules/next/dist/docs/`.

## Installable app (PWA)

- Manifest: `src/app/manifest.ts` (served at `/manifest.webmanifest`); icons in `public/icons/`.
- Service worker: `public/sw.js`, registered by `<InstallBanner>` in production builds only (dev keeps
  Next's HMR). Pages always come from the network and fall back to `public/offline.html`; build
  files and images are cached. Bump `VERSION` in `sw.js` when its caching rules change.
- Install prompt: `src/components/pwa/install-banner.tsx` — the browser's install dialog where
  supported, Add to Home Screen steps on iPhone; "Not now" hides it for 14 days.
- Try it: `pnpm build && pnpm start`, then Chrome DevTools → Application → Manifest / Service workers.
  Installing needs HTTPS (or localhost).
