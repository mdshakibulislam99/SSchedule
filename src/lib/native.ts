import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { initNotifications } from '../services/notificationService';

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
      // targetSdk 35+ (Android 15) forces edge-to-edge: the system bars turn
      // transparent and the window is laid out behind them. `overlay: false`
      // re-adds a solid band on top, which is what produced the black gaps at
      // the top and bottom of the app. Let the WebView own the whole window.
      await StatusBar.setOverlaysWebView({ overlay: true });
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

  // Initialize Android notification channels
  try {
    await initNotifications();
  } catch {
    // Non-blocking notification setup
  }
}

/**
 * Synchronize Android native status bar with the current Bright/Night mode.
 */
export async function updateNativeTheme(isDark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    // Deliberately no setBackgroundColor() here. On targetSdk 35+ the window is
    // edge-to-edge, so the status bar is transparent and the app background
    // shows through. Tinting the bar would put a coloured band back at the top
    // instead of letting the app run edge to edge.
  } catch {
    // Non-blocking status bar update
  }
}
