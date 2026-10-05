/**
 * Safe cross-platform system notifications.
 *
 * The Notification() constructor throws a TypeError on nearly all mobile
 * browsers (Android Chrome, Capacitor WebView, iOS Safari), so the reliable
 * mobile path is a service worker's showNotification(). We try the service
 * worker first and fall back to the constructor for desktop browsers.
 * This module NEVER throws — callers receive a result code instead.
 */

export type SystemNotifyResult = 'shown' | 'denied' | 'unsupported' | 'failed';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showSystemNotification(
  title: string,
  options?: { body?: string; tag?: string }
): Promise<SystemNotifyResult> {
  if (!isNotificationSupported()) return 'unsupported';
  if (Notification.permission !== 'granted') return 'denied';

  // 1) Service-worker path — required on mobile. Registration happens at app
  //    startup (main.tsx); register() here as well so the very first
  //    notification after a cold start does not race the worker install.
  try {
    if ('serviceWorker' in navigator) {
      const registration =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register('/sw.js'));
      await registration.showNotification(title, {
        body: options?.body,
        tag: options?.tag,
      });
      return 'shown';
    }
  } catch {
    // Fall through to the constructor path (desktop browsers).
  }

  // 2) Constructor path — works on desktop, throws on mobile (caught below).
  try {
    new Notification(title, {
      body: options?.body,
      tag: options?.tag,
    });
    return 'shown';
  } catch {
    return 'failed';
  }
}
