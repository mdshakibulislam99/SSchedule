import { Capacitor } from '@capacitor/core';

declare global {
  interface Window {
    puter?: {
      key?: string;
      authToken?: string | null;
      auth: {
        signIn: () => Promise<any>;
        signOut: () => Promise<void>;
        getUser: () => Promise<any>;
        isSignedIn: () => boolean;
      };
      ai: {
        chat: (prompt: string, options?: any) => Promise<any>;
      };
    };
  }
}

/** Key stored in sessionStorage to detect a Puter redirect callback on reload. */
const puterAuthPendingKey = 'puter_auth_pending_redirect';

export const AIService = {
  /**
   * Sign in to Puter via the Puter.js SDK v2.
   *
   * On the web, `auth.signIn()` opens a popup — this works fine.
   * On native (Capacitor WebView on Android/iOS), the OS intercepts
   * `window.open()` and opens an external browser tab. The OAuth callback
   * in that tab can't `postMessage` back to the WebView, so the user sees
   * a blank page and the promise never resolves.
   *
   * Fix: on native we intercept `window.open` and redirect the *entire*
   * WebView to the OAuth URL. After the OAuth redirects back to the app
   * origin, the page reloads and `completePuterRedirect()` (called from
   * App.tsx on mount) detects that the user is now signed in.
   */
  async signInPuter(): Promise<{ username: string; email?: string } | null> {
    if (typeof window !== 'undefined' && window.puter?.auth) {
      try {
        if (Capacitor.isNativePlatform()) {
          // Mark that a redirect-based auth flow has started
          sessionStorage.setItem(puterAuthPendingKey, 'true');

          const originalOpen = window.open;
          // Intercept any window.open call the SDK makes for the OAuth popup
          // and turn it into a full-page redirect within the WebView.
          window.open = (url?: string | URL, ..._rest: any[]): any => {
            if (url && typeof url === 'string') {
              window.location.href = url;
            }
            return null;
          };

          try {
            // The SDK will call window.open(url) which we've intercepted.
            // In most cases the WebView navigates away before signIn()
            // resolves, so we wrap in a race with a short timeout.
            await Promise.race([
              window.puter.auth.signIn(),
              new Promise((_, rej) =>
                setTimeout(() => rej(new Error('redirect started')), 3000)
              ),
            ]);
          } catch {
            // Expected — the page is redirecting to the OAuth URL.
          } finally {
            window.open = originalOpen;
          }

          // If the SDK somehow completed in-page (no redirect), check result.
          if (window.puter?.auth?.isSignedIn?.()) {
            const user = await window.puter.auth.getUser();
            sessionStorage.removeItem(puterAuthPendingKey);
            if (user) {
              return {
                username: user?.username || 'puter_student',
                email: user?.email,
              };
            }
          }

          // Page should be navigating away to the OAuth URL.
          // If not, fall through and let the caller handle null.
          return null;
        }

        const res = await window.puter.auth.signIn();
        if (res) {
          const user = await window.puter.auth.getUser();
          return {
            username: user?.username || 'puter_student',
            email: user?.email,
          };
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '').toLowerCase();
        if (msg.includes('closed') || msg.includes('cancel') || msg.includes('redirect')) {
          // On native the redirect is expected; the callback is handled on reload.
          // On web, the user closed the popup.
          if (!Capacitor.isNativePlatform()) {
            console.info('Puter sign-in popup closed by user.');
          }
          return null;
        }
        console.warn('Puter login error:', err);
        return null;
      }
    }
    return null;
  },

  /**
   * Called on app mount to detect whether the user returned from a Puter
   * OAuth redirect. Returns the user object if the redirect completed
   * successfully, or null otherwise.
   */
  async completePuterRedirect(): Promise<{ username: string; email?: string } | null> {
    if (!Capacitor.isNativePlatform()) return null;
    if (typeof window === 'undefined' || !window.puter?.auth) return null;

    const pending = sessionStorage.getItem(puterAuthPendingKey);
    if (!pending) return null;

    sessionStorage.removeItem(puterAuthPendingKey);

    // Give the Puter SDK a moment to initialise after the redirect.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (window.puter?.auth?.isSignedIn?.()) {
      const user = await window.puter.auth.getUser();
      if (user) {
        return {
          username: user?.username || 'puter_student',
          email: user?.email,
        };
      }
    }

    return null;
  },

  async signOutPuter(): Promise<void> {
    if (typeof window !== 'undefined' && window.puter?.auth?.signOut) {
      try {
        await window.puter.auth.signOut();
      } catch (e) {
        console.warn('Puter sign out error:', e);
      }
    }
  },

  isPuterSignedIn(): boolean {
    if (typeof window !== 'undefined' && window.puter?.auth?.isSignedIn) {
      return window.puter.auth.isSignedIn();
    }
    return false;
  },
};
