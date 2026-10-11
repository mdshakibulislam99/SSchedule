import { Capacitor } from '@capacitor/core';
import {
  getMessaging,
  getToken,
  deleteToken,
  isSupported,
  Messaging,
} from 'firebase/messaging';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth, db } from '../lib/firebase';
import { Task, ScheduleEvent, NotificationSettings } from '../types';
import { buildUpcomingNotifications, hashString } from './reminderBuilder';

/** Public VAPID key from Firebase Console → Cloud Messaging → Web Push certificates. */
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

/** How many upcoming reminders we hand to the Cloud Function dispatcher. */
const WEB_PUSH_QUEUE_LIMIT = 120;

let messagingPromise: Promise<Messaging | null> | null = null;

/**
 * Lazily initialize FCM messaging. Returns null when the browser has no Web
 * Push support (older Safari/Firefox) or when the VAPID key is not configured,
 * so callers can no-op instead of crashing the app.
 */
function getMessagingInstance(): Promise<Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      if (Capacitor.isNativePlatform()) return null;
      if (!VAPID_KEY) {
        console.warn('[WebPush] VITE_FIREBASE_VAPID_KEY is not set — Web Push disabled.');
        return null;
      }
      const supported = await isSupported();
      if (!supported) {
        console.warn('[WebPush] Firebase messaging is not supported in this browser.');
        return null;
      }
      return getMessaging(app);
    })();
  }
  return messagingPromise;
}

/** True when this environment can receive FCM Web Push at all. */
export async function isWebPushSupported(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return false;
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false;
  if (!('PushManager' in window)) return false;
  return VAPID_KEY.length > 0;
}

/** Detect an iPhone/iPad user agent. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * True when running as an installed Home-Screen app (iOS `navigator.standalone`
 * or the standard display-mode media query used by Android/desktop PWAs).
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iOSStandalone = (window.navigator as { standalone?: boolean }).standalone;
  if (typeof iOSStandalone === 'boolean') return iOSStandalone;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

/** Deterministic, filesystem-safe doc id for an FCM registration token. */
function tokenDocId(token: string): string {
  // Same djb2-style hash as the reminder ids, rendered as an unsigned hex id.
  const h = hashString(token);
  return `t${(h >>> 0).toString(16)}`;
}

export interface WebPushStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  /** True when we have a stored registration token for this browser. */
  registered: boolean;
  /** iOS requires the app to be installed to the Home Screen to get push. */
  needsHomeScreen: boolean;
}

/** Read the current permission + registration state without prompting. */
export async function getWebPushStatus(): Promise<WebPushStatus> {
  const supported = await isWebPushSupported();
  const permission =
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported';

  let registered = false;
  const uid = auth.currentUser?.uid;
  if (supported && uid) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        registered = !!sub;
      }
    } catch {
      registered = false;
    }
  }

  return {
    supported,
    permission,
    registered,
    needsHomeScreen: supported && isIos() && !isStandalone(),
  };
}

/**
 * Register this browser for FCM Web Push and persist the token so the Cloud
 * Function dispatcher can find it. Returns the token, or null on
 * failure/unsupported.
 *
 * On iOS this only succeeds when the PWA is installed to the Home Screen
 * (iOS 16.4+); otherwise the permission prompt is unavailable.
 */
export async function enableWebPush(): Promise<string | null> {
  const supported = await isWebPushSupported();
  if (!supported) return null;

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  // iOS blocks Notification.requestPermission outside a Home-Screen install.
  if (isIos() && !isStandalone()) {
    console.warn('[WebPush] iOS requires the app to be added to the Home Screen.');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    // Register (or reuse) our own service worker so the push + notificationclick
    // handlers in public/sw.js receive the messages.
    const registration = await navigator.serviceWorker.register('/sw.js');

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    await persistToken(token);
    return token;
  } catch (err) {
    console.error('[WebPush] enableWebPush failed:', err);
    return null;
  }
}

/** Store the registration token under users/{uid}/fcmTokens/{hash}. */
async function persistToken(token: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid, 'fcmTokens', tokenDocId(token)), {
      token,
      platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      createdAt: Timestamp.now(),
      lastSeenAt: Timestamp.now(),
    });
  } catch (err) {
    console.warn('[WebPush] Failed to persist token:', err);
  }
}

/**
 * Unregister this browser: drop the FCM token and delete the stored record so
 * the dispatcher stops targeting it. Safe to call repeatedly.
 */
export async function disableWebPush(): Promise<void> {
  const uid = auth.currentUser?.uid;
  try {
    const messaging = await getMessagingInstance();
    if (messaging) {
      await deleteToken(messaging).catch(() => {});
    }
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.pushManager
      .getSubscription()
      .then((sub) => sub?.unsubscribe())
      .catch(() => {});
  } catch (err) {
    console.warn('[WebPush] disableWebPush token teardown failed:', err);
  }

  if (!uid) return;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'fcmTokens'));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (err) {
    console.warn('[WebPush] Failed to clear stored tokens:', err);
  }
}

/** Shape of a queued reminder as stored for the Cloud Function dispatcher. */
export interface SyncWebPushQueueOptions {
  tasks: Task[];
  schedule: ScheduleEvent[];
  settings: NotificationSettings;
}

/**
 * Mirror the computed reminder list into Firestore so a scheduled Cloud
 * Function can deliver them over FCM Web Push while the PWA is closed.
 *
 * Called on web from `syncAllScheduledAlarms`. It reuses the exact same
 * `buildUpcomingNotifications` builder as the native Android path, so both
 * channels stay in lock-step. Docs are idempotent (`{uid}_{reminderId}`), so
 * repeated syncs upsert rather than duplicate; stale entries are pruned.
 *
 * Returns the number of queued reminders (0 when push is off/unsupported).
 */
export async function syncWebPushQueue({
  tasks,
  schedule,
  settings,
}: SyncWebPushQueueOptions): Promise<number> {
  // Respect the same master toggle the native path honours.
  if (settings.browserNotifications === false) return 0;
  const supported = await isWebPushSupported();
  if (!supported) return 0;
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;

  // Only queue when the user actually granted permission.
  if (typeof window === 'undefined' || Notification.permission !== 'granted') return 0;

  try {
    const upcoming = buildUpcomingNotifications({ tasks, schedule, settings })
      .slice(0, WEB_PUSH_QUEUE_LIMIT);

    const colRef = collection(db, 'scheduledPushes');
    const now = Timestamp.now();

    // Upsert the current batch.
    const batch = writeBatch(db);
    for (const n of upcoming) {
      const ref = doc(colRef, `${uid}_${n.id}`);
      batch.set(ref, {
        uid,
        reminderId: n.id,
        title: n.title,
        body: n.body,
        extra: n.extra,
        fireAt: Timestamp.fromDate(n.schedule.at),
        sent: false,
        updatedAt: now,
      }, { merge: true });
    }
    await batch.commit();

    // Prune anything previously queued for this user that is no longer wanted
    // (task completed/deleted, time moved, reminder disabled, …).
    const existing = await getDocs(query(colRef, where('uid', '==', uid)));
    const wanted = new Set(upcoming.map((n) => `${uid}_${n.id}`));
    const stale = existing.docs.filter((d) => !wanted.has(d.id) && d.data().sent === false);
    if (stale.length > 0) {
      const del = writeBatch(db);
      stale.forEach((d) => del.delete(d.ref));
      await del.commit();
    }

    return upcoming.length;
  } catch (err) {
    console.warn('[WebPush] syncWebPushQueue failed:', err);
    return 0;
  }
}

/**
 * Ask the backend to send a one-off test push to every token registered for the
 * signed-in user. Used by the settings screen to verify the pipeline end-to-end
 * without waiting for a scheduled reminder.
 */
export async function sendTestPush(): Promise<{ sent: number }> {
  const fn = httpsCallable(getFunctions(app), 'sendTestPush');
  const res = await fn();
  return res.data as { sent: number };
}


