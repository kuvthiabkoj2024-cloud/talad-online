interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Cloudflare Turnstile site key: robot check on sign-in (unset = off). */
  readonly VITE_TURNSTILE_SITE_KEY?: string
  /** Customer storefront (apps/web), for "View shop" links. */
  readonly VITE_STOREFRONT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
