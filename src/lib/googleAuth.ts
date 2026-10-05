import { SocialLogin } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';
import {
  auth,
  googleProvider,
  FIREBASE_CONFIG,
} from './firebase';
import {
  GoogleAuthProvider,
  signInWithCredential,
  User as FirebaseUser,
} from 'firebase/auth';
import { loadGis } from './googleCalendar';

const GOOGLE_WEB_CLIENT_ID = FIREBASE_CONFIG.oAuthClientId;

let initPromise: Promise<void> | null = null;

// Generous enough for a slow connection, but bounded: without it a blocked
// AuthorizationClient leaves the UI spinning indefinitely with no error.
const NATIVE_LOGIN_TIMEOUT_MS = 45_000;

/**
 * Reject with `message` if `promise` has not settled within `ms`.
 *
 * The native Google plugin can leave its Capacitor promise permanently pending
 * (never resolving and never rejecting), so a plain `await` would hang the
 * caller forever. A timer is the only way out.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/**
 * Initialize the native Google Sign-In plugin exactly once per app launch.
 *
 * Android needs the *web* client ID here: the native SDK returns a Google ID
 * token, and Firebase verifies that token against the web OAuth client.
 */
function ensureNativeGoogleInit(): Promise<void> {
  if (initPromise) return initPromise;

  if (!GOOGLE_WEB_CLIENT_ID) {
    return Promise.reject(
      new Error('Missing Google OAuth client id. Check oAuthClientId in firebase-applet-config.json.')
    );
  }

  initPromise = SocialLogin.initialize({
    google: {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      mode: 'online',
    },
  }).catch((err) => {
    // Allow a later retry if a transient native failure occurs.
    initPromise = null;
    throw err;
  });

  return initPromise;
}

function isUserCancellation(err: any): boolean {
  const code = String(err?.code || '');
  const message = String(err?.message || err || '').toLowerCase();
  return (
    code === 'USER_CANCELLED' ||
    code === 'CANCELLED' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    message.includes('cancel') ||
    message.includes('popup window closed') ||
    message.includes('popup_closed') ||
    message.includes('window closed') ||
    message.includes('closed')
  );
}

/**
 * Sign in with Google on a native (Android/iOS) build.
 *
 * Why this exists: the packaged app is a Capacitor WebView. Google refuses to
 * run its OAuth consent screen inside an embedded WebView, so the web popup
 * flow (`signInWithPopup`) is always blocked there. The native SDK opens the
 * system account picker instead, which Google does allow.
 *
 * The Google-signed ID token it returns is what establishes identity — we
 * exchange it for a Firebase session and never trust a client-supplied email.
 */
export async function signInWithGoogleNative(): Promise<FirebaseUser> {
  await ensureNativeGoogleInit();

  let idToken: string | null = null;
  let accessToken: string | null = null;

  try {
    // NOTE: do NOT pass `scopes` here. The Android plugin unconditionally
    // requests userinfo.email / userinfo.profile / openid, and passing a custom
    // `scopes` array makes it reject the call with "You CANNOT use scopes
    // without modifying the main activity" unless MainActivity implements
    // ModifiedMainActivityForSocialLoginPlugin. Those default scopes are exactly
    // what Firebase needs, so the extra option bought us nothing.
    //
    // The timeout is load-bearing. After the account picker returns a valid ID
    // token, the plugin blocks on GoogleClient's AuthorizationClient using a
    // bare future.get() with no deadline (GoogleProvider.java:724 — unlike its
    // own refresh() path, which uses a 60s bound at line 1386). That call needs
    // network access, so on a blocked/filtered connection it never resolves and
    // never fails: the Capacitor promise stays pending forever and the button
    // spins with no error. We only need the ID token, so bounding the wait
    // turns an indefinite hang into a retryable error.
    const login = await withTimeout(
      SocialLogin.login({
        provider: 'google',
        options: {
          style: 'standard',
          filterByAuthorizedAccounts: false,
          autoSelectEnabled: false,
          forcePrompt: true,
        },
      }),
      NATIVE_LOGIN_TIMEOUT_MS,
      'Google took too long to respond.'
    );

    // The plugin returns a union: online mode yields tokens, offline mode
    // yields only a server auth code (which is useless for Firebase Auth).
    const result: any = login?.result;
    if (result) {
      if ('idToken' in result && result.idToken) {
        idToken = result.idToken;
      }
      if (result.accessToken) {
        accessToken = typeof result.accessToken === 'string'
          ? result.accessToken
          : result.accessToken.token || null;
      }
    }
  } catch (err: any) {
    if (isUserCancellation(err)) {
      throw new Error('Google Sign-In was cancelled.');
    }
    console.warn('Native Google login failed:', err);
    const detail = String(err?.message || '').trim();
    throw new Error(
      detail || 'Google Sign-In failed on this device. Please try again.'
    );
  }

  if (!idToken) {
    throw new Error('Google did not return an identity token. Please try signing in again.');
  }

  const credential = GoogleAuthProvider.credential(idToken);
  const cred = await signInWithCredential(auth, credential);

  if (accessToken && typeof window !== 'undefined') {
    try {
      const payload = JSON.stringify({
        token: accessToken,
        expiresAt: Date.now() + 3500 * 1000,
      });
      localStorage.setItem('chrono_gcal_token', payload);
      sessionStorage.setItem('chrono_gcal_token', payload);
    } catch {}
  }

  return cred.user;
}


/**
 * Sign in with Google on the web build.
 *
 * Popup is tried first because it keeps the user in the page. When the browser
 * blocks it, the GIS token client is used, and finally a full-page redirect
 * (which survives popup blocking because it never calls window.open).
 */
export async function signInWithGoogleWeb(): Promise<FirebaseUser> {
  const { signInWithPopup, signInWithRedirect } = await import('firebase/auth');

  // A bound on the popup step. On browsers that block third-party cookies
  // (Safari ITP, Chrome's upcoming third-party-cookie phase-out, etc.),
  // Firebase's popup can't post its result back to the opener, so
  // signInWithPopup stays pending forever after the user picks an account:
  // the spinner never resolves, the catch (with the GIS/redirect fallbacks)
  // never runs, and the button spins indefinitely. The same class of hang is
  // already guarded for the native flow with `withTimeout`; we replicate it
  // here so a silent popup hang degrades to the GIS / redirect fallbacks.
  const POPUP_TIMEOUT_MS = 15_000;
  const POPUP_FALLBACK_CODES = [
    'auth/popup-blocked',
    'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment',
    'auth/internal-error',
    'auth/unauthorized-domain',
    // Coded onto the timeout rejection below so the redirect fallback
    // (decided by POPUP_FALLBACK_CODES) covers the hung-popup case too.
    'auth/popup-timeout',
  ];

  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });

    const popupPromise = signInWithPopup(auth, googleProvider);
    // Swallow a late settlement once the timeout has won the race, so a
    // popup that resolves/rejects after we've moved on can't surface as an
    // unhandled rejection.
    popupPromise.catch(() => {});
    const result = await Promise.race([
      popupPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              Object.assign(
                new Error('Google Sign-In popup timed out.'),
                { code: 'auth/popup-timeout' },
              ),
            ),
          POPUP_TIMEOUT_MS,
        ),
      ),
    ]);

    try {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken && typeof window !== 'undefined') {
        localStorage.setItem('chrono_gcal_token', JSON.stringify({
          token: credential.accessToken,
          expiresAt: Date.now() + 3500 * 1000,
        }));
      }
    } catch (tokenErr) {
      console.warn('Could not cache Google access token:', tokenErr);
    }

    return result.user;
  } catch (popupErr: any) {
    const code = String(popupErr?.code || '');
    const popupErrMsg = String(popupErr?.message || popupErr || '').toLowerCase();
    console.warn('Firebase signInWithPopup failed:', code, popupErr);

    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      popupErrMsg.includes('popup window closed') ||
      popupErrMsg.includes('popup_closed') ||
      popupErrMsg.includes('window closed') ||
      popupErrMsg.includes('closed')
    ) {
      throw new Error('Google Sign-In was cancelled.');
    }

    // Fallback: Google Identity Services token client (real account selector).
    let gisFailure: any = null;
    try {
      await loadGis();

      if (typeof window !== 'undefined' && window.google?.accounts?.oauth2 && GOOGLE_WEB_CLIENT_ID) {
        const tokenResult = await new Promise<{ accessToken: string; idToken?: string }>((resolve, reject) => {
          try {
            const client = window.google.accounts.oauth2.initTokenClient({
              client_id: GOOGLE_WEB_CLIENT_ID,
              scope: 'openid email profile https://www.googleapis.com/auth/userinfo.email',
              callback: (resp: any) => {
                if (resp?.access_token) {
                  resolve({ accessToken: resp.access_token, idToken: resp.id_token });
                } else if (resp?.error === 'access_denied') {
                  reject(new Error('Google Sign-In was cancelled.'));
                } else {
                  reject(new Error(resp?.error_description || resp?.error || 'Google Sign-In failed'));
                }
              },
              error_callback: (err: any) => {
                const errType = String(err?.type || '').toLowerCase();
                const errMsg = String(err?.message || err || '').toLowerCase();
                if (
                  errType === 'popup_closed' ||
                  errMsg.includes('closed') ||
                  errMsg.includes('popup window closed') ||
                  errMsg.includes('cancel')
                ) {
                  reject(new Error('Google Sign-In was cancelled.'));
                } else {
                  reject(new Error(err?.message || 'Google account selector failed to open.'));
                }
              },
            });

            client.requestAccessToken({ prompt: 'select_account' });
          } catch (initErr) {
            reject(initErr);
          }
        });

        // The ID token is the only trustworthy link between the Google account
        // and Firebase Auth: it is signed by Google and verified server-side.
        if (tokenResult?.idToken) {
          const credential = GoogleAuthProvider.credential(tokenResult.idToken, tokenResult.accessToken);
          const cred = await signInWithCredential(auth, credential);
          return cred.user;
        }
      }
    } catch (gisErr: any) {
      console.warn('GIS Token Client failed:', gisErr);
      if (String(gisErr?.message || '').includes('cancelled')) {
        throw gisErr;
      }
      gisFailure = gisErr;
    }

    // Last resort: full-page redirect. It does not depend on window.open, so it
    // still works when popups are blocked. The page navigates away, so this
    // never returns; `completeGoogleRedirect()` picks the result up on load.
    if (POPUP_FALLBACK_CODES.includes(code) || gisFailure) {
      await signInWithRedirect(auth, googleProvider);
      throw gisFailure || popupErr;
    }

    throw popupErr;
  }
}

/**
 * Platform-aware Google sign-in entry point.
 *
 * Native builds use Google's native SDK (required: OAuth is blocked inside an
 * embedded WebView). Web builds use the popup -> GIS -> redirect chain.
 */
export async function signInWithGooglePlatform(): Promise<FirebaseUser> {
  if (Capacitor.isNativePlatform()) {
    return signInWithGoogleNative();
  }
  return signInWithGoogleWeb();
}
