/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Point the app at a real Evenly API. Unset means the mock backend. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
