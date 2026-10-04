import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/** True only when running inside the packaged Android/iOS shell. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

type BackHandler = () => boolean;

const backHandlers: BackHandler[] = [];

/**
 * Give a screen/sheet first refusal on the Android hardware back button.
 * Return `true` when the press was consumed (a sheet was closed, a sub-screen
 * was popped), or `false` to hand the press to the next handler and finally to
 * the OS (which exits the app).
 */
export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const index = backHandlers.indexOf(handler);
    if (index >= 0) backHandlers.splice(index, 1);
  };
}

/** Runs handlers newest-first; the first one to return true wins. */
const consumeBackPress = (): boolean => {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    try {
      if (backHandlers[i]()) return true;
    } catch {
      // A misbehaving handler must never trap the user inside the app.
    }
  }
  return false;
};

/**
 * One-time native bootstrap. Safe to call unconditionally: on the web every
 * branch below is skipped.
 */
export async function initNativeApp(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#4F46E5' });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    // The status bar is cosmetic — never let it block app startup.
  }

  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (consumeBackPress()) return;
    if (canGoBack && window.history.length > 1) {
      window.history.back();
      return;
    }
    void CapacitorApp.exitApp();
  });

  try {
    await SplashScreen.hide();
  } catch {
    // Already hidden, or the plugin is unavailable — nothing to do.
  }
}
