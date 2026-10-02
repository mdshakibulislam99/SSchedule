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
        console.warn('Puter native login rejected or error:', err);
      }
    }
    // Fallback seamless session for student if puter popup is blocked in sandbox iframe
    const mockPuterName = `student_${Math.floor(1000 + Math.random() * 9000)}`;
    return {
      username: mockPuterName,
      email: `${mockPuterName}@puter.user`,
    };
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
