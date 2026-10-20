interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Customer storefront (apps/web), for "open in store" links. */
  readonly VITE_STOREFRONT_URL?: string
  /** Dev only: prefill the sign-in form (the seeded admin). Not read in production builds. */
  readonly VITE_DEV_ADMIN_EMAIL?: string
  readonly VITE_DEV_ADMIN_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
