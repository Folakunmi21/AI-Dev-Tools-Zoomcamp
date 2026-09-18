/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the API URL; development defaults to the Vite /api proxy. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
