import firebaseConfig from '../../firebase-applet-config.json';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TOKEN_CACHE_KEY = 'chrono_gcal_token';

export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
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
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing || document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new GoogleAuthError('gis_load_failed', 'Could not load Google Identity Services'));
    };
    if (!existing) document.head.appendChild(script);
  });
  return gisPromise;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

function readCachedToken(): CachedToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedToken) : null;
  } catch {
    return null;
  }
}

function writeCachedToken(token: string, expiresInSeconds: number) {
  try {
    sessionStorage.setItem(
      TOKEN_CACHE_KEY,
      JSON.stringify({ token, expiresAt: Date.now() + expiresInSeconds * 1000 }),
    );
  } catch {
    // sessionStorage unavailable — keep working in-memory for this request cycle
  }
}

export function clearCachedToken() {
  try {
    sessionStorage.removeItem(TOKEN_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Requests a Google OAuth access token for the Calendar API.
 * `silent: true` attempts a refresh with no consent prompt.
 */
export function requestCalendarToken(opts: { silent?: boolean } = {}): Promise<string> {
  return loadGis().then(
    () =>
      new Promise<string>((resolve, reject) => {
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
              reject(new GoogleAuthError(err?.type || 'popup_failed', err?.message));
            },
          });
          client.requestAccessToken({ prompt: opts.silent ? '' : 'consent' });
        } catch (err) {
          reject(new GoogleAuthError('init_failed', (err as Error)?.message));
        }
      }),
  );
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
