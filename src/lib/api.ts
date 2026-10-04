/**
 * Base URL of the hosted AI backend.
 *
 * On the web the app and the Express server share an origin, so this stays
 * empty and requests go out as relative paths. The packaged Android/iOS bundle
 * ships without a server of its own, so `VITE_API_BASE_URL` must be set to the
 * deployed API origin (e.g. https://chronopulse-api.example.com) at build time:
 *
 *   VITE_API_BASE_URL=https://chronopulse-api.example.com npm run apk:release
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export const apiUrl = (path: string): string =>
  `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
