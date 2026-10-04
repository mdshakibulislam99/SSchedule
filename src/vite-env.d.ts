/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the hosted AI backend used by the packaged mobile builds. */
  readonly VITE_API_BASE_URL?: string;
}
