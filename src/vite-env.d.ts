/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the hosted AI backend used by the packaged mobile builds. */
  readonly VITE_API_BASE_URL?: string;
  /** GitHub repo hosting app releases, as `owner/name`. Defaults to the project repo. */
  readonly VITE_GITHUB_REPO?: string;
}
