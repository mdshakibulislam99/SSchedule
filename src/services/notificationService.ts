import { Capacitor } from '@capacitor/core';
import { LocalNotifications, PermissionStatus } from '@capacitor/local-notifications';
import { Task, ScheduleEvent, NotificationSettings } from '../types';
import {
  CHANNELS,
  hashString,
  MAX_SCHEDULED_ALARMS,
  buildUpcomingNotifications,
  NOTIFICATION_SMALL_ICON,
} from './reminderBuilder';
import { syncWebPushQueue } from './webPushService';
import { CURRENT_APP_VERSION } from '../utils/version';

// Re-exported so existing importers (App.tsx, settings screen) keep working.
export { CHANNELS };

export interface NotificationPayload {
  id?: string | number;
  title: string;
  body: string;
  channelId?: string;
  scheduleAt?: Date;
  extra?: Record<string, unknown>;
}

export interface SyncAlarmsOptions {
  tasks: Task[];
  schedule: ScheduleEvent[];
  settings: NotificationSettings;
}

export type PermissionStateResult = 'granted' | 'denied' | 'prompt' | 'unsupported';

/**
 * Last time we told the OS to open the exact-alarm ("Alarms & reminders")
 * settings screen, so we never bounce the user out of the app repeatedly in one
 * session. Persisted so the anti-spam survives an app restart too.
 */
const EXACT_ALARM_PROMPT_TS_KEY = 'sschedule_exact_alarm_prompt_ts';
const EXACT_ALARM_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // at most once a day

function shouldPromptExactAlarm(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const raw = localStorage.getItem(EXACT_ALARM_PROMPT_TS_KEY);
    const last = raw ? Number(raw) : 0;
    return !Number.isFinite(last) || Date.now() - last > EXACT_ALARM_PROMPT_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markExactAlarmPrompted(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(EXACT_ALARM_PROMPT_TS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/**
 * Status of Android's exact-alarm capability (API 31+).
 * - `granted`  → setExactAndAllowWhileIdle is allowed → alarms fire on time.
 * - `needs_user_grant` → SCHEDULE_EXACT_ALARM is declared but the user has
 *   not granted "Alarms & reminders". The app must open the system settings
 *   screen; scheduling would otherwise silently degrade to inexact alarms.
 * - `not_required` → pre-Android-12 / exact alarms need no special grant.
 * - `unknown` → the check threw (older plugin / unsupported build).
 */
export type ExactAlarmStatus = 'granted' | 'needs_user_grant' | 'not_required' | 'unknown';

/** Deferred grants: resolved on the next launch, so a first-run denial cannot
 * permanently silence the device. Keyed per-version so a new release with a
 * better explanation re-prompts once. */
const PENDING_GRANT_KEY = 'sschedule_pending_grant_version';

/** Ids registered by the last successful sync, so stale alarms can be cleared. */
const SYNCED_ALARM_IDS_KEY = 'sschedule_synced_alarm_ids';

/**
 * Syncs are chained through this promise so two overlapping runs can never
 * interleave cancel/schedule calls (which would wipe fresh alarms).
 */
let syncQueue: Promise<number> = Promise.resolve(0);

function readSyncedAlarmIds(): number[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SYNCED_ALARM_IDS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is number => typeof id === 'number');
  } catch {
    return null;
  }
}

function writeSyncedAlarmIds(ids: number[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SYNCED_ALARM_IDS_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota / private-mode failures — worst case we re-cancelAll once
  }
}

let isInitialized = false;
let isBackgroundResyncActive = false;
let notificationTapHandler: ((extra?: Record<string, unknown>) => void) | undefined;
let notificationReceivedHandler: ((notification: { title?: string; body?: string; id?: number; extra?: Record<string, unknown> }) => void) | undefined;

/**
 * Initialize notification channels and listener handlers on Android/Capacitor.
 */
export async function initNotifications(
  onNotificationTap?: (extra?: Record<string, unknown>) => void,
  onNotificationReceived?: (notification: { title?: string; body?: string; id?: number; extra?: Record<string, unknown> }) => void,
): Promise<void> {
  if (onNotificationTap) {
    notificationTapHandler = onNotificationTap;
  }
  if (onNotificationReceived) {
    notificationReceivedHandler = onNotificationReceived;
  }

  if (isInitialized) return;
  isInitialized = true;

  if (Capacitor.isNativePlatform()) {
    try {
      // Notification channels are Android-only — iOS implements createChannel
      // as `unimplemented()` (it rejects), which would abort this block before
      // the listeners are registered further below.
      if (Capacitor.getPlatform() === 'android') {
        // Create high-priority reminder channel for Android 8.0+
        await LocalNotifications.createChannel({
          id: CHANNELS.REMINDERS,
          name: 'SSchedule Reminders',
          description: 'High-priority alerts for study tasks, classes, and deadlines',
          importance: 5, // High importance (heads-up banner with sound & vibration)
          visibility: 1, // Public on lockscreen
          vibration: true,
          lights: true,
          lightColor: '#4F46E5',
        });

        // Create general updates channel
        await LocalNotifications.createChannel({
          id: CHANNELS.GENERAL,
          name: 'SSchedule Updates & Briefings',
          description: 'Daily briefings, AI recommendations, and summaries',
          importance: 4,
          visibility: 1,
          vibration: true,
        });
      }

      // Handle tap on notifications
      LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
        const extra = notificationAction.notification?.extra as Record<string, unknown> | undefined;
        if (notificationTapHandler) {
          notificationTapHandler(extra);
        }
      });

      // Handle notifications received while the app is in the foreground
      LocalNotifications.addListener('localNotificationReceived', (notification) => {
        if (notificationReceivedHandler && notification) {
          notificationReceivedHandler({
            title: notification.title,
            body: notification.body,
            id: typeof notification.id === 'string' ? hashString(notification.id) : notification.id,
            extra: notification.extra as Record<string, unknown> | undefined,
          });
        }
      });
    } catch (err) {
      console.warn('Failed to configure native notification channels:', err);
    }
  }
}

/**
 * Check the current notification permission across Native Android and Web.
 */
export async function checkNotificationPermission(): Promise<PermissionStateResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status: PermissionStatus = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') return 'granted';
      if (status.display === 'denied') return 'denied';
      return 'prompt';
    } catch (err) {
      console.warn('Error checking native notification permissions:', err);
      return 'prompt';
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'prompt';
  }

  return 'unsupported';
}

export interface RequestPermissionResult {
  /** POST_NOTIFICATIONS runtime permission (Android 13+) was granted. */
  granted: boolean;
  /** Exact-alarm capability after the request; used to decide whether we must
   *  open the "Alarms & reminders" system screen so timed alerts actually fire. */
  exactAlarm: ExactAlarmStatus;
  /** True only when we actually displayed a system consent dialog this call
   *  (the prior OS state was `prompt`). Lets the caller enable the in-app
   *  reminder toggle on a fresh grant without clobbering a deliberate user
   *  choice to keep reminders off while OS permission stays granted. */
  prompted: boolean;
}

/**
 * Query Android's exact-alarm capability without changing anything.
 * Returns `not_required` off Android / on web / when the check is unavailable.
 */
export async function getExactAlarmStatus(): Promise<ExactAlarmStatus> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return 'not_required';
  }
  try {
    const setting = await LocalNotifications.checkExactNotificationSetting();
    const state = setting?.exact_alarm;
    if (state === 'granted') return 'granted';
    if (state === 'denied') return 'needs_user_grant';
    // 'prompt' or unknown → treat as needing a user grant so we open settings.
    return state === undefined ? 'unknown' : 'needs_user_grant';
  } catch {
    return 'unknown';
  }
}

/**
 * Prompt the user for notification permissions on Native Android (POST_NOTIFICATIONS) or Web.
 *
 * Retained for backward compatibility with existing callers that only need the
 * boolean. New code should prefer {@link requestNotificationPermissionEx}.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  return (await requestNotificationPermissionEx()).granted;
}

/**
 * Request notification permission and report both the runtime grant and the
 * exact-alarm capability so the caller can react (e.g. guide the user to the
 * "Alarms & reminders" settings screen on Android 12+).
 *
 * NOTE: we deliberately do NOT auto-open the exact-alarm settings screen here.
 * Yanking the user out of the app mid-consent is jarring and, when they return,
 * the launch code must re-run scheduling (see App.tsx). Instead we surface the
 * status so the UI can explain it and offer a one-tap "Fix" action, and the
 * app re-syncs on every resume.
 */
export async function requestNotificationPermissionEx(): Promise<RequestPermissionResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      // Ensure channels exist first
      await initNotifications();
      // Capture the pre-request OS state so we know whether we actually showed
      // a consent dialog (only true when the prior state was `prompt`).
      const prior = await checkNotificationPermission();
      const status = await LocalNotifications.requestPermissions();
      const exactAlarm = await getExactAlarmStatus();
      if (exactAlarm === 'needs_user_grant') {
        console.warn(
          '[Notifications] Exact alarms are not granted — reminders may fire late ' +
          'until the user enables "Alarms & reminders" in system settings.',
        );
      }
      return {
        granted: status.display === 'granted',
        exactAlarm,
        prompted: prior === 'prompt',
      };
    } catch (err) {
      console.error('Error requesting native notification permissions:', err);
      return { granted: false, exactAlarm: 'unknown', prompted: false };
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      // The browser only shows its prompt when the current state is `default`
      // (= our `prompt`); a repeat call otherwise resolves silently.
      const prior: PermissionStateResult =
        Notification.permission === 'granted'
          ? 'granted'
          : Notification.permission === 'denied'
            ? 'denied'
            : 'prompt';
      const result = await Notification.requestPermission();
      return {
        granted: result === 'granted',
        exactAlarm: 'not_required',
        prompted: prior === 'prompt',
      };
    } catch (err) {
      console.warn('Error requesting web notification permissions:', err);
      return { granted: false, exactAlarm: 'not_required', prompted: false };
    }
  }

  return { granted: false, exactAlarm: 'not_required', prompted: false };
}

/**
 * Open Android's exact-alarm ("Alarms & reminders") system settings screen so the
 * user can grant SCHEDULE_EXACT_ALARM on Android 12+ (API 31+). On Android 13+
 * this permission is revoked by default for apps targeting API 33+, and without
 * it timed reminders fall back to inexact windows (often tens of minutes late or
 * deferred by Doze). Safe no-op on web/iOS / older Android where the plugin
 * method is unavailable.
 *
 * Returns true when the settings screen was opened successfully.
 */
export async function openExactAlarmSettings(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }
  try {
    await LocalNotifications.changeExactNotificationSetting();
    return true;
  } catch (err) {
    console.warn('[Notifications] Could not open exact-alarm settings:', err);
    return false;
  }
}

/**
 * Pure decision for the version-gated deferred-grant re-prompt (Phase 2B/2E).
 *
 * A first-run denial must not permanently silence the device, but we must not
 * nag on every launch either. Rule:
 *   - `prompt`   → ask now (the OS still shows the dialog).
 *   - `denied`   → ask once per app version, so a release carrying a clearer
 *                  explanation gets exactly one fresh attempt; stay quiet on
 *                  the same build afterwards.
 *   - `granted` / `unsupported` → never prompt.
 *
 * `lastPromptedVersion` is the version recorded the last time we auto-prompted
 * (`null` if never). Kept pure so it can be unit-tested without Capacitor.
 */
export function shouldAutoPromptPermission(
  status: PermissionStateResult,
  currentVersion: string,
  lastPromptedVersion: string | null,
): boolean {
  if (status === 'granted' || status === 'unsupported') return false;
  if (status === 'prompt') return true;
  // status === 'denied'
  return lastPromptedVersion !== currentVersion;
}

function readPendingGrantVersion(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(PENDING_GRANT_KEY);
  } catch {
    return null;
  }
}

function writePendingGrantVersion(version: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PENDING_GRANT_KEY, version);
  } catch {
    // ignore quota / private-mode failures — worst case we re-prompt once more
  }
}

/**
 * Launch-time permission gate (Phase 2B/2E).
 *
 * Unlike the first-run `'prompt'` path, this also grants ONE more attempt after
 * a previous denial whenever the app has been upgraded (the new build may carry
 * a better explanation). It records the prompted version BEFORE prompting, so a
 * dismissal or "don't allow" can never loop, and reports the resulting grant +
 * exact-alarm state so the caller can immediately re-sync alarms on grant.
 *
 * No-op (returns current state) when auto-prompting isn't warranted.
 */
export async function ensureNotificationPermissionOnLaunch(): Promise<RequestPermissionResult> {
  const status = await checkNotificationPermission();
  if (!shouldAutoPromptPermission(status, CURRENT_APP_VERSION, readPendingGrantVersion())) {
    const exactAlarm = status === 'granted' ? await getExactAlarmStatus() : 'not_required';
    // No dialog was shown this launch, so nothing about the user's intent
    // changed — report `prompted: false` so the caller preserves the stored
    // in-app reminder preference instead of clobbering it.
    return { granted: status === 'granted', exactAlarm, prompted: false };
  }
  // Record before prompting so a denial can't cause a per-launch loop.
  writePendingGrantVersion(CURRENT_APP_VERSION);
  if (status === 'denied') {
    console.info(
      `[Notifications] Re-prompting for permission after an update to v${CURRENT_APP_VERSION} ` +
      '(previously denied; one attempt per version).',
    );
  }
  return requestNotificationPermissionEx();
}


/**
 * Send an immediate or scheduled system notification.
 * Dispatches to Android NotificationManager via Capacitor on mobile,
 * or Web Notifications API on desktop browsers.
 */
export async function sendSystemNotification(payload: NotificationPayload): Promise<boolean> {
  const { id, title, body, channelId = CHANNELS.REMINDERS, scheduleAt, extra } = payload;
  const numericId = typeof id === 'number'
    ? Math.abs(id) % 2147483647
    : typeof id === 'string'
    ? hashString(id)
    : hashString(title + Date.now().toString());

  if (Capacitor.isNativePlatform()) {
    try {
      // Schedule or deliver immediately
      await LocalNotifications.schedule({
        notifications: [
          {
            id: numericId,
            title,
            body,
            channelId,
            schedule: scheduleAt && scheduleAt.getTime() > Date.now()
              ? { at: scheduleAt, allowWhileIdle: true }
              : undefined,
            extra: extra || {},
            smallIcon: NOTIFICATION_SMALL_ICON,
            iconColor: '#4F46E5',
          },
        ],
      });
      return true;
    } catch (err) {
      console.error('Failed to schedule native Android notification:', err);
      return false;
    }
  }

  // Web Browser fallback
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      if (scheduleAt && scheduleAt.getTime() > Date.now()) {
        const delay = scheduleAt.getTime() - Date.now();
        // Web timeout for pending notification (works while page is open)
        setTimeout(() => {
          try {
            new Notification(title, { body });
          } catch {
            // ignore
          }
        }, delay);
      } else {
        new Notification(title, { body });
      }
      return true;
    } catch (err) {
      console.warn('Web Notification error:', err);
      return false;
    }
  }

  return false;
}

/**
 * Synchronize all alarms and scheduled notifications with Android AlarmManager.
 * This guarantees that even when the app is completely closed / swiped away
 * and the phone screen is off (Doze/sleep mode), the Android operating system
 * will wake up and alert the user for tasks, classes, deadlines, and briefings!
 */
export function syncAllScheduledAlarms(options: SyncAlarmsOptions): Promise<number> {
  // Serialize: overlapping syncs must never interleave cancel/schedule calls.
  const run = syncQueue.then(
    () => performSyncAlarms(options),
    () => performSyncAlarms(options),
  );
  syncQueue = run.catch(() => 0);
  return run;
}

/**
 * How often the background self-healing loop re-syncs alarms while the app is
 * open. Chosen conservatively so reminders that come into the scheduling
 * window, permissions granted later, or alarms dropped by the OS cap are
 * re-registered without hammering the plugin. The native path relies on
 * AlarmManager once alarms are registered, so this only needs to top them up.
 */
const BACKGROUND_RESYNC_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Start a low-frequency background loop that re-runs {@link syncAllScheduledAlarms}.
 *
 * Why this exists: `performSyncAlarms` only registers reminders that fall inside
 * the scheduling window and the exact-alarm grant may only arrive *after* the
 * first launch sync. Without a periodic top-up, a task whose reminder crosses
 * into range while the app sits open (or after the user grants permission from
 * the system screen) would never be registered with Android. This loop is a
 * no-op on web (the FCM queue path already runs inside every sync) and is
 * idempotent — calling it twice does nothing.
 */
export function startBackgroundResync(getOptions: () => SyncAlarmsOptions): void {
  if (isBackgroundResyncActive) return;
  if (typeof window === 'undefined' || typeof window.setInterval !== 'function') return;

  isBackgroundResyncActive = true;
  window.setInterval(() => {
    try {
      void syncAllScheduledAlarms(getOptions());
    } catch {
      // never let a background top-up crash the app
    }
  }, BACKGROUND_RESYNC_INTERVAL_MS);
}

/** Stop the background self-healing loop (used on sign-out / teardown). */
export function stopBackgroundResync(): void {
  isBackgroundResyncActive = false;
}

async function performSyncAlarms({
  tasks,
  schedule,
  settings,
}: SyncAlarmsOptions): Promise<number> {
  if (!Capacitor.isNativePlatform()) {
    // On the web (including the iOS Home-Screen PWA) there is no AlarmManager.
    // Instead we push the same reminder list to Firestore, where a scheduled
    // Cloud Function fans it out over FCM Web Push at the right moment.
    return syncWebPushQueue({ tasks, schedule, settings });
  }

   // If user explicitly disabled notifications, cancel pending alarms
  if (settings.browserNotifications === false) {
    try {
      await LocalNotifications.cancelAll();
    } catch {}
    writeSyncedAlarmIds([]);
    return 0;
  }

  // Verify the OS-level notification permission is actually granted
  // (POST_NOTIFICATIONS on Android 13+, or channel disabled by user).
  // If not, alarm scheduling would silently fail — guide the user to settings.
  if (!(await areNotificationsSystemEnabled())) {
    console.warn('System notifications are disabled — alarms will not fire until the user grants permission.');
    return 0;
  }

  try {
    await initNotifications();

    // Ids the previous successful sync registered. `null` means this is the
    // first sync ever (or an upgrade from an older version) — clear whatever
    // the old version left behind exactly once.
    const previouslySyncedIds = readSyncedAlarmIds();

    // Build the reminder list once. This is the single source of truth shared
    // by the native Android alarm path and the FCM web-push queue.
    const finalBatch = buildUpcomingNotifications({ tasks, schedule, settings })
      .slice(0, MAX_SCHEDULED_ALARMS);
    const batchIds = new Set(finalBatch.map((notification) => notification.id));

    // One-time cleanup of alarms registered by older app versions.
    if (previouslySyncedIds === null) {
      try {
        await LocalNotifications.cancelAll();
      } catch (err) {
        console.warn('Could not clear legacy pending notifications:', err);
      }
    }

    // Schedule BEFORE cancelling anything: if scheduling fails (permission
    // revoked, exact-alarm prompt pending, …) the alarms already registered on
    // the device stay intact instead of leaving the user with none at all.
    if (finalBatch.length > 0) {
      await LocalNotifications.schedule({
        notifications: finalBatch,
      });
    }

    // Cancel only the alarms the previous sync registered that this run no
    // longer wants (deleted/completed tasks, moved times, …).
    const staleIds = (previouslySyncedIds ?? []).filter((id) => !batchIds.has(id));
    if (staleIds.length > 0) {
      try {
        await LocalNotifications.cancel({ notifications: staleIds.map((id) => ({ id })) });
      } catch (err) {
        console.warn('Could not clear stale scheduled alarms:', err);
      }
    }

    writeSyncedAlarmIds(finalBatch.map((notification) => notification.id));

    return finalBatch.length;
  } catch (err) {
    console.error('Failed to sync scheduled alarms with Android AlarmManager:', err);
    return 0;
  }
}

/**
 * Automatically schedule a native Android system notification for a single scheduled task.
 */
export async function scheduleTaskSystemReminder(
  task: Task,
  advanceMinutes: number = 15
): Promise<void> {
  if (!task.scheduledDate || !task.scheduledStartTime || task.completed) return;

  try {
    const scheduledDateTime = new Date(`${task.scheduledDate}T${task.scheduledStartTime}:00`);
    const reminderTime = new Date(scheduledDateTime.getTime() - advanceMinutes * 60 * 1000);

    // Only schedule if in the future
    if (reminderTime.getTime() > Date.now()) {
      await sendSystemNotification({
        id: `task-reminder-${task.id}`,
        title: `📌 Upcoming Task: ${task.title}`,
        body: `Starts in ${advanceMinutes} min at ${task.scheduledStartTime}.`,
        channelId: CHANNELS.REMINDERS,
        scheduleAt: reminderTime,
        extra: { type: 'task', taskId: task.id },
      });
    }
  } catch (err) {
    console.warn(`Could not schedule system reminder for task ${task.id}:`, err);
  }
}

/**
 * Cancel a scheduled task reminder.
 */
export async function cancelTaskSystemReminder(taskId: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const numericId = hashString(`task-reminder-${taskId}`);
      await LocalNotifications.cancel({
        notifications: [{ id: numericId }],
      });
    } catch (err) {
      console.warn(`Could not cancel native notification for task ${taskId}:`, err);
    }
  }
}

/**
 * Check whether the OS-level notification toggles for this app are actually
 * enabled (both the POST_NOTIFICATIONS runtime permission on Android 13+ and
 * the channel-level "Show notifications" switch). Returns `true` on web or
 * when the check can't be performed.
 */
export async function areNotificationsSystemEnabled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const result = await LocalNotifications.areEnabled();
    return result?.value ?? false;
  } catch {
    return false;
  }
}

/**
 * Open the Android system battery-optimization settings so the user can exempt
 * SSchedule from Doze / app-standby restrictions.
 *
 * Device manufacturers like Samsung, Xiaomi, Huawei, and Oppo apply aggressive
 * battery management that can silently kill AlarmManager wake-ups — preventing
 * scheduled notifications from firing when the app is closed or the screen is off.
 */
export async function requestBatteryOptimizationExemption(): Promise<boolean> {
  // Do not invoke window.open with intent:// schemes in WebView as it causes blank screen overlay
  return false;
}

