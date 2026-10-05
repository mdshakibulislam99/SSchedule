import { AIProviderConfig, AIProviderType } from '../types';

declare global {
  interface Window {
    puter?: {
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

export const AIService = {
  async signInPuter(): Promise<{ username: string; email?: string } | null> {
    if (typeof window !== 'undefined' && window.puter?.auth) {
      try {
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
        if (msg.includes('closed') || msg.includes('cancel')) {
          console.info('Puter sign-in popup closed by user.');
          return null;
        }
        console.warn('Puter login error:', err);
        return null;
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
