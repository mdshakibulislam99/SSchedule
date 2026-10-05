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
  const message = String(err?.message || '').toLowerCase();
  return (
    code === 'USER_CANCELLED' ||
    code === 'CANCELLED' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    message.includes('cancel')
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

  try {
    const login = await SocialLogin.login({
      provider: 'google',
      options: {
        scopes: ['email', 'profile'],
      },
    });

    // The plugin returns a union: online mode yields tokens, offline mode
    // yields only a server auth code (which is useless for Firebase Auth).
    const result: any = login?.result;
    if (result && 'idToken' in result) {
      idToken = result.idToken ?? null;
    }
  } catch (err: any) {
    if (isUserCancellation(err)) {
      throw new Error('Google Sign-In was cancelled.');
    }
    console.warn('Native Google login failed:', err);
    throw new Error(
      'Google Sign-In is not available on this device. Please make sure the app is installed from the ' +
        'same build you tested, then try again.'
    );
  }

  if (!idToken) {
    throw new Error('Google did not return an identity token. Please try signing in again.');
  }

  const credential = GoogleAuthProvider.credential(idToken);
  const cred = await signInWithCredential(auth, credential);
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

  const POPUP_FALLBACK_CODES = [
    'auth/popup-blocked',
    'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment',
    'auth/internal-error',
    'auth/unauthorized-domain',
  ];

  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, googleProvider);

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
    console.warn('Firebase signInWithPopup failed:', code, popupErr);

    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
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
                if (err?.type === 'popup_closed') {
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
