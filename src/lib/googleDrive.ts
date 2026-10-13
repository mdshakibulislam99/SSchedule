import { getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { app, auth } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { GoogleDriveSyncState } from '../types';
import { GoogleApiError, GoogleAuthError, loadGis } from './googleCalendar';

const OAUTH_CLIENT_ID = (firebaseConfig as { oAuthClientId?: string }).oAuthClientId || '';
const TOKEN_CACHE_KEY = 'chrono_gdrive_token';
/** Set before a native Drive redirect OAuth; cleared once the connect resumes. */
export const DRIVE_CONNECT_PENDING_KEY = 'sschedule_gdrive_connect_pending';

/** Root folder created in the user's Drive that holds all app data. */
export const DRIVE_FOLDER_NAME = 'SScheduleData';
/**
 * Root folder name used by the earlier foundation build.
 * Reused (never duplicated) when it already exists.
 */
export const LEGACY_DRIVE_FOLDER_NAME = 'SSfilesdata';

export const GOOGLE_DRIVE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  // Least-privilege Drive scope: the app can only read/write files it
  // created itself — the "SSfilesdata" folder tree — and nothing else
  // in the user's Drive. Unlike full-drive access it is not a sensitive
  // scope, so it works without Google's verification process.
  'https://www.googleapis.com/auth/drive.file',
];

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

/** A Drive file/folder as returned by the Drive v3 API. */
export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
  /**
   * Firebase UID that obtained this token. Enforced on every read so
   * one account can never reuse another account's Drive token after
   * an account switch on the same device.
   */
  uid?: string;
}

let memoryCachedToken: CachedToken | null = null;

function readCachedToken(): CachedToken | null {
  if (memoryCachedToken && memoryCachedToken.expiresAt > Date.now()) {
    if (tokenUidMatchesCurrentUser(memoryCachedToken)) return memoryCachedToken;
    // A different account signed in on this device — never reuse.
    clearCachedToken();
    return null;
  }
  try {
    const raw = sessionStorage.getItem(TOKEN_CACHE_KEY) || localStorage.getItem(TOKEN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedToken;
    if (parsed?.token && Number(parsed.expiresAt) > Date.now()) {
      if (!tokenUidMatchesCurrentUser(parsed)) {
        clearCachedToken();
        return null;
      }
      memoryCachedToken = parsed;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * A cached token is only usable by the exact Firebase account that
 * obtained it. Legacy tokens without a bound uid are rejected while
 * any user is signed in — a one-time reconnect per account, and never
 * a cross-account Drive write.
 */
function tokenUidMatchesCurrentUser(cached: CachedToken): boolean {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) return false;
  return cached.uid === currentUid;
}

function writeCachedToken(token: string, expiresInSeconds: number) {
  const cached: CachedToken = {
    token,
    expiresAt: Date.now() + Math.max(300, expiresInSeconds) * 1000,
    uid: auth.currentUser?.uid,
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
 * Caches a Drive OAuth access token obtained outside this module —
 * the native redirect flow finishes after a page reload, where the
 * original request is no longer waiting.
 */
export function cacheDriveToken(token: string, expiresInSeconds = 3600): void {
  writeCachedToken(token, expiresInSeconds);
}

/**
 * Requests a Google OAuth access token for the Drive API.
 * 1. Checks memory + localStorage/sessionStorage cache.
 * 2. Firebase Auth Google sign-in popup.
 * 3. Google Identity Services (GIS) token client.
 * On native, OAuth runs as a full-page WebView redirect because
 * popups cannot postMessage their result back inside a WebView.
 */
export async function requestDriveToken(opts: { silent?: boolean } = {}): Promise<string> {
  const cached = readCachedToken();
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.token;
  }

  if (opts.silent) {
    if (cached?.token) return cached.token;
    throw new GoogleAuthError('silent_token_unavailable', 'No valid Google Drive access token available.');
  }

  if (Capacitor.isNativePlatform()) {
    // Just landed back from an OAuth redirect — give completeGoogleRedirect()
    // a moment to cache the token so a quick re-tap doesn't bounce through
    // Google a second time.
    const pageAgeMs = typeof performance !== 'undefined' ? performance.now() : Number.MAX_SAFE_INTEGER;
    if (pageAgeMs < 20_000) {
      for (let i = 0; i < 25 && !readCachedToken(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const fresh = readCachedToken();
      if (fresh) return fresh.token;
    }

    const provider = new GoogleAuthProvider();
    GOOGLE_DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));
    provider.setCustomParameters({ prompt: 'consent' });
    try {
      localStorage.setItem(DRIVE_CONNECT_PENDING_KEY, 'true');
      // The WebView navigates to Google here and never returns from this call.
      await signInWithRedirect(auth, provider);
    } catch (err) {
      localStorage.removeItem(DRIVE_CONNECT_PENDING_KEY);
      throw new GoogleAuthError('redirect_failed', (err as Error)?.message || 'Google redirect failed.');
    }
    // Only reached if navigation never started — don't hang the caller.
    throw new GoogleAuthError('redirect_pending', 'Google sign-in is opening — reconnect once it returns.');
  }

  // 1. Firebase Auth GoogleAuthProvider popup (Firebase's official OAuth
  // handler domain avoids origin_mismatch in Google Cloud).
  let popupToken: string | null = null;
  try {
    const firebaseAuth = getAuth(app);
    const provider = new GoogleAuthProvider();
    GOOGLE_DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(firebaseAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      popupToken = credential.accessToken;
      writeCachedToken(popupToken, 3600);
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
    console.warn('Firebase Drive popup attempt failed, falling back to GIS client:', firebaseErr);
  }
  if (popupToken) return popupToken;

  // 2. Google Identity Services (GIS) Token Client — real account selector.
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: OAUTH_CLIENT_ID,
        scope: GOOGLE_DRIVE_SCOPES.join(' '),
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
                `Google OAuth rejected this origin (${typeof window !== 'undefined' ? window.location.origin : 'unknown'}). ` +
                  'Add it under "Authorized JavaScript origins" of the Web OAuth client in Google Cloud Console → APIs & Services → Credentials.',
              ),
            );
          } else {
            reject(new GoogleAuthError(err?.type || 'popup_failed', msg || 'Popup request failed.'));
          }
        },
      });
      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      reject(new GoogleAuthError('init_failed', (err as Error)?.message));
    }
  });
}

/** Returns a valid Drive access token, silently refreshing when possible. */
export async function getDriveAccessToken(): Promise<string> {
  const cached = readCachedToken();
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  return requestDriveToken({ silent: true });
}

async function authedFetch(url: string, init: RequestInit = {}, allowRetry = true): Promise<Response> {
  const token = await getDriveAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && allowRetry) {
    clearCachedToken();
    const fresh = await requestDriveToken({ silent: true });
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

export async function fetchDriveEmail(): Promise<string | undefined> {
  try {
    const res = await authedFetch('https://www.googleapis.com/oauth2/v3/userinfo');
    const data = await res.json();
    return data?.email as string | undefined;
  } catch {
    return undefined;
  }
}

/** Finds a folder by exact name in the app's Drive scope. */
export async function findDriveFolder(name = DRIVE_FOLDER_NAME): Promise<GoogleDriveFile | null> {
  const params = new URLSearchParams({
    q: `name = '${name}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
    fields: 'files(id, name, mimeType, webViewLink)',
    spaces: 'drive',
  });
  const res = await authedFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  const data = await res.json();
  const files = (data.files || []) as GoogleDriveFile[];
  return files.length > 0 ? files[0] : null;
}

/** Creates the root data folder at the top level of the user's Drive. */
export async function createDriveFolder(name = DRIVE_FOLDER_NAME): Promise<GoogleDriveFile> {
  const res = await authedFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE }),
  });
  return res.json();
}

/**
 * Resolves the root "SScheduleData" folder — finds the
 * existing one (or the legacy "SSfilesdata" root from the
 * earlier build) or creates it on first connect.
 * Reconnecting always lands in the same folder.
 */
export async function ensureDriveFolder(name = DRIVE_FOLDER_NAME): Promise<GoogleDriveFile> {
  const existing = await findDriveFolder(DRIVE_FOLDER_NAME);
  if (existing) return existing;
  const legacy = await findDriveFolder(LEGACY_DRIVE_FOLDER_NAME);
  if (legacy) return legacy;
  return createDriveFolder(DRIVE_FOLDER_NAME);
}

/**
 * Connects Google Drive: authenticates, then finds (or creates) the
 * "SSfilesdata" root folder. Returns the persisted connection state.
 */
export async function connectDrive(): Promise<GoogleDriveSyncState> {
  await requestDriveToken();
  const [email, folder] = await Promise.all([fetchDriveEmail(), ensureDriveFolder()]);
  return {
    connected: true,
    email,
    folderId: folder.id,
    folderName: folder.name,
    connectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reconnects to the existing "SSfilesdata" folder — resolves by name,
 * so it attaches to the folder created on the first connect.
 */
export async function reconnectDrive(): Promise<GoogleDriveSyncState> {
  return connectDrive();
}

/**
 * Disconnects Drive: clears the cached token and local connection
 * state. The Google grant and the Drive folder itself are left intact
 * so a later connect re-attaches to the same folder.
 */
export async function disconnectDrive(): Promise<void> {
  clearCachedToken();
  try {
    localStorage.removeItem(DRIVE_CONNECT_PENDING_KEY);
  } catch {}
}
