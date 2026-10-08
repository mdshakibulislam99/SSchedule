import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { app } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TOKEN_CACHE_KEY = 'chrono_gcal_token';

export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

const OAUTH_CLIENT_ID = (firebaseConfig as { oAuthClientId?: string }).oAuthClientId || '';

declare global {
  interface Window {
    google?: any;
  }
}

/** Raised when a Google API call fails with a non-2xx status. */
export class GoogleApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GoogleApiError';
    this.status = status;
  }
}

/**
 * Raised when we cannot obtain a Google access token without the user
 * explicitly reconnecting (revoked access, blocked cookies, denied consent...).
 */
export class GoogleAuthError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

export function isReconnectError(err: unknown): boolean {
  return err instanceof GoogleAuthError || (err instanceof GoogleApiError && err.status === 401);
}

let gisPromise: Promise<void> | null = null;

export function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    // A previously inserted tag may have already fired load/error, in which case
    // re-binding onload would never settle and the caller would hang forever.
    // Probe the existing tag before deciding whether to reuse it.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing && existing.dataset.gisState === 'ready') {
      resolve();
      return;
    }

    const script = existing || document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.gisState = 'ready';
      resolve();
    };
    script.onerror = () => {
      script.dataset.gisState = 'error';
      gisPromise = null;
      reject(new GoogleAuthError('gis_load_failed', 'Could not load Google Identity Services'));
    };
    if (!existing) document.head.appendChild(script);

    // index.html ships a static <script src=...gsi/client> tag, so the load
    // event may already have fired before we got here and onload would never
    // run again. Poll for the global so the promise always settles.
    if (existing) {
      const started = Date.now();
      const poll = window.setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          window.clearInterval(poll);
          script.dataset.gisState = 'ready';
          resolve();
        } else if (Date.now() - started > 10_000) {
          window.clearInterval(poll);
          gisPromise = null;
          reject(new GoogleAuthError('gis_load_timeout', 'Google Identity Services did not load in time.'));
        }
      }, 100);
    }
  });
  return gisPromise;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let memoryCachedToken: CachedToken | null = null;

function readCachedToken(): CachedToken | null {
  if (memoryCachedToken && memoryCachedToken.expiresAt > Date.now()) {
    return memoryCachedToken;
  }
  try {
    const raw = sessionStorage.getItem(TOKEN_CACHE_KEY) || localStorage.getItem(TOKEN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedToken;
    if (parsed?.token && Number(parsed.expiresAt) > Date.now()) {
      memoryCachedToken = parsed;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedToken(token: string, expiresInSeconds: number) {
  const cached: CachedToken = {
    token,
    expiresAt: Date.now() + Math.max(300, expiresInSeconds) * 1000,
  };
  memoryCachedToken = cached;
  try {
    sessionStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cached));
  } catch {}
  try {
    localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cached));
  } catch {}
}

export function clearCachedToken() {
  memoryCachedToken = null;
  try {
    sessionStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {}
  try {
    localStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {}
}

/**
 * Requests a Google OAuth access token for the Calendar API.
 * 1. Checks memory, localStorage, and sessionStorage cache.
 * 2. Attempts Firebase Auth Google sign-in popup (uses Firebase auth domain, avoiding origin_mismatch).
 * 3. Falls back to Google Identity Services (GIS).
 */
export async function requestCalendarToken(opts: { silent?: boolean } = {}): Promise<string> {
  const cached = readCachedToken();
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.token;
  }

  if (opts.silent) {
    if (cached?.token) return cached.token;
    throw new GoogleAuthError('silent_token_unavailable', 'No valid Google access token available.');
  }

  // 1. First attempt: Firebase Auth GoogleAuthProvider popup
  // This uses Firebase's official OAuth handler domain (which avoids origin_mismatch in Google Cloud)
  try {
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    GOOGLE_CALENDAR_SCOPES.forEach((scope) => provider.addScope(scope));
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      writeCachedToken(credential.accessToken, 3600);
      return credential.accessToken;
    }
  } catch (firebaseErr: any) {
    const code = String(firebaseErr?.code || '');
    const msg = String(firebaseErr?.message || firebaseErr || '').toLowerCase();
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      msg.includes('popup window closed') ||
      msg.includes('popup_closed') ||
      msg.includes('window closed') ||
      msg.includes('closed') ||
      msg.includes('cancel')
    ) {
      throw new GoogleAuthError('cancelled', 'Sign-in popup was closed.');
    }
    console.warn('Firebase popup attempt failed, falling back to GIS client:', firebaseErr);
  }

  // 2. Second attempt: Google Identity Services (GIS) Token Client
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: OAUTH_CLIENT_ID,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
        callback: (resp: any) => {
          if (resp?.access_token) {
            writeCachedToken(resp.access_token, Number(resp.expires_in) || 3600);
            resolve(resp.access_token);
          } else {
            reject(new GoogleAuthError(resp?.error || 'access_denied', resp?.error_description));
          }
        },
        error_callback: (err: any) => {
          const msg = String(err?.message || err || '').toLowerCase();
          const type = String(err?.type || '').toLowerCase();
          if (
            type === 'popup_closed' ||
            msg.includes('popup window closed') ||
            msg.includes('popup_closed') ||
            msg.includes('window closed') ||
            msg.includes('closed') ||
            msg.includes('cancel')
          ) {
            reject(new GoogleAuthError('cancelled', 'Sign-in popup was closed.'));
            return;
          }
          if (msg.includes('origin') || type === 'origin_mismatch') {
            reject(
              new GoogleAuthError(
                'origin_mismatch',
                'Google Cloud OAuth origin mismatch: Please register this origin in Google Cloud Console or authorize OAuth in AI Studio.',
              ),
            );
          } else {
            reject(new GoogleAuthError(err?.type || 'popup_failed', msg || 'Popup request failed.'));
          }
        },
      });
      client.requestAccessToken({ prompt: opts.silent ? '' : 'consent' });
    } catch (err) {
      reject(new GoogleAuthError('init_failed', (err as Error)?.message));
    }
  });
}

/** Returns a valid access token, silently refreshing when possible. */
export async function getAccessToken(): Promise<string> {
  const cached = readCachedToken();
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  return requestCalendarToken({ silent: true });
}

export async function revokeCalendarToken(): Promise<void> {
  const cached = readCachedToken();
  clearCachedToken();
  if (!cached) return;
  await loadGis().catch(() => undefined);
  await new Promise<void>((resolve) => {
    try {
      window.google.accounts.oauth2.revoke(cached.token, () => resolve());
    } catch {
      resolve();
    }
  });
}

export async function fetchGoogleEmail(): Promise<string | undefined> {
  try {
    const res = await authedFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    const data = await res.json();
    return data?.email as string | undefined;
  } catch {
    return undefined;
  }
}

async function authedFetch(url: string, init: RequestInit = {}, allowRetry = true): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && allowRetry) {
    clearCachedToken();
    const fresh = await requestCalendarToken({ silent: true });
    const retry = await fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${fresh}` },
    });
    if (!retry.ok) throw new GoogleApiError(retry.status, await safeText(retry));
    return retry;
  }
  if (!res.ok) throw new GoogleApiError(res.status, await safeText(res));
  return res;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}

export interface GoogleCalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  etag?: string;
  updated?: string;
  colorId?: string;
  recurrence?: string[];
  excludedDates?: { date: string }[];
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export interface ListEventsResult {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export async function listEvents(opts: {
  calendarId: string;
  syncToken?: string;
  timeMin?: string;
  timeMax?: string;
  pageToken?: string;
}): Promise<ListEventsResult> {
  const params = new URLSearchParams();
  params.set('maxResults', '2500');
  params.set('singleEvents', 'true');
  params.set('showDeleted', 'true');
  if (opts.syncToken) {
    params.set('syncToken', opts.syncToken);
  } else {
    if (opts.timeMin) params.set('timeMin', opts.timeMin);
    if (opts.timeMax) params.set('timeMax', opts.timeMax);
  }
  if (opts.pageToken) params.set('pageToken', opts.pageToken);

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    opts.calendarId,
  )}/events?${params.toString()}`;
  const res = await authedFetch(url);
  const data = await res.json();
  return {
    items: (data.items as GoogleCalendarEvent[]) || [],
    nextPageToken: data.nextPageToken,
    nextSyncToken: data.nextSyncToken,
  };
}

export async function insertEvent(
  calendarId: string,
  body: Partial<GoogleCalendarEvent>,
): Promise<GoogleCalendarEvent> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await authedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function patchEvent(
  calendarId: string,
  eventId: string,
  body: Partial<GoogleCalendarEvent>,
): Promise<GoogleCalendarEvent> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId,
  )}/events/${encodeURIComponent(eventId)}`;
  const res = await authedFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId,
  )}/events/${encodeURIComponent(eventId)}`;
  await authedFetch(url, { method: 'DELETE' });
}
