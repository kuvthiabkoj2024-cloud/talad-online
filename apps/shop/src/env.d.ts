interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Customer storefront (apps/web), for "View shop" links. */
  readonly VITE_STOREFRONT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
