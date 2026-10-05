import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Task, NotificationSettings } from '../types';
import { getLocalDateKey } from '../utils/dates';
import { isNativeApp } from '../lib/native';

/**
 * OS-level (native) notification scheduling.
 *
 * Web pages can only notify while they are alive, so to alert the user when
 * the app is closed — or right after the phone reboots — every reminder is
 * handed to the OS (Android AlarmManager / iOS UNUserNotificationCenter) via
 * @capacitor/local-notifications days in advance. The plugin persists pending
 * notifications and ships a BOOT_COMPLETED receiver that re-arms them after a
 * reboot, so the schedule survives restarts.
 *
 * On the web this module is a no-op: the foreground pipeline in App.tsx
 * (service-worker notification + in-app toast) covers the browser.
 */

/** How many days ahead OS-level notifications are armed. */
const SCHEDULE_HORIZON_DAYS = 14;
/** Deadline alerts fire this long before the deadline. */
const DEADLINE_LEAD_MS = 24 * 60 * 60 * 1000;
/** Ignore fire times closer than this (already in the past). */
const MIN_FUTURE_MS = 5 * 1000;
/** Trailing debounce so rapid task edits don't thrash cancel+reschedule. */
const SYNC_DEBOUNCE_MS = 400;

/** Quiet hours check for an arbitrary future timestamp (handles overnight wrap). */
function isQuietAt(settings: NotificationSettings, date: Date): boolean {
  if (!settings.quietHoursEnabled) return false;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const [startH, startM] = (settings.quietHoursStart || '22:00').split(':').map(Number);
  const [endH, endM] = (settings.quietHoursEnd || '07:00').split(':').map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

/** Stable positive 31-bit id for a logical notification key (Android int range). */
function numericId(key: string): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  const id = hash & 0x7fffffff;
  return id === 0 ? 1 : id;
}

/** Build every OS notification the current tasks/settings imply. */
export function collectScheduledNotifications(
  tasks: Task[],
  settings: NotificationSettings
): LocalNotificationSchema[] {
  const items: LocalNotificationSchema[] = [];
  const seen = new Set<number>();
  const nowMs = Date.now();

  const push = (
    key: string,
    title: string,
    body: string,
    fireAt: Date,
    extra: Record<string, unknown>
  ) => {
    if (fireAt.getTime() < nowMs + MIN_FUTURE_MS) return;
    if (isQuietAt(settings, fireAt)) return;
    const id = numericId(key);
    if (seen.has(id)) return;
    seen.add(id);
    items.push({
      id,
      title,
      body,
      schedule: { at: fireAt, allowWhileIdle: true },
      extra: { notificationKey: key, ...extra },
    });
  };

  // Planned study-session start reminders (mirrors the foreground rules).
  if (settings.taskReminders) {
    for (let d = 0; d < SCHEDULE_HORIZON_DAYS; d++) {
      const day = new Date(nowMs + d * 24 * 60 * 60 * 1000);
      const dateKey = getLocalDateKey(day);
      const dayNumber = new Date(`${dateKey}T12:00:00`).getDay();

      tasks.forEach((task) => {
        if (task.completed || !task.reminder?.enabled || !task.scheduledDate || !task.scheduledStartTime) return;

        const runsOnDate =
          task.scheduledDate === dateKey ||
          (task.scheduledDate < dateKey && task.recurrence === 'daily') ||
          (task.scheduledDate < dateKey && task.recurrence === 'weekdays' && dayNumber > 0 && dayNumber < 6) ||
          (task.scheduledDate < dateKey &&
            task.recurrence === 'weekly' &&
            new Date(`${task.scheduledDate}T12:00:00`).getDay() === dayNumber);
        if (!runsOnDate) return;

        const scheduled = new Date(`${dateKey}T${task.scheduledStartTime}:00`);
        const leadTime = task.reminder.minutesBefore || settings.advanceNoticeMinutes || 15;
        const fireAt = new Date(scheduled.getTime() - leadTime * 60 * 1000);
        push(
          `task-reminder-${task.id}-${dateKey}`,
          `Reminder: ${task.title}`,
          `Your planned study time is ${task.scheduledStartTime}.`,
          fireAt,
          { taskId: task.id }
        );
      });
    }
  }

  // Deadline alerts (fires 24h before the deadline while the app is closed).
  if (settings.deadlineAlerts) {
    tasks.forEach((task) => {
      if (task.completed) return;
      const deadline = new Date(task.deadline);
      if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= nowMs) return;

      const fireAt = new Date(deadline.getTime() - DEADLINE_LEAD_MS);
      const fireKey = `deadline-${task.id}-${getLocalDateKey(fireAt)}`;
      const formatted = deadline.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      push(fireKey, `Deadline soon: ${task.title}`, `Due ${formatted}.`, fireAt, { taskId: task.id });
    });
  }

  return items;
}

async function doSync(tasks: Task[], settings: NotificationSettings): Promise<void> {
  if (!isNativeApp()) return;
  try {
    if (!settings.browserNotifications) {
      // The user turned system notifications off — disarm everything.
      await LocalNotifications.cancelAll();
      return;
    }
    const notifications = collectScheduledNotifications(tasks, settings);
    // Stateless sync: clear everything and re-arm from the current truth so
    // completed/deleted/edited tasks never leave stale alarms behind.
    await LocalNotifications.cancelAll();
    if (notifications.length > 0) {
      const result = await LocalNotifications.schedule({ notifications });
      if (result.warning) {
        console.warn('Local notification scheduling warning:', result.warning.message);
      }
    }
  } catch (err) {
    console.warn('OS notification sync failed:', err);
  }
}

let syncDebounceHandle: ReturnType<typeof setTimeout> | null = null;

/** Re-arm all OS notifications (debounced; no-op on the web). */
export function syncScheduledNotifications(tasks: Task[], settings: NotificationSettings): void {
  if (!isNativeApp()) return;
  if (syncDebounceHandle) clearTimeout(syncDebounceHandle);
  syncDebounceHandle = setTimeout(() => {
    syncDebounceHandle = null;
    void doSync(tasks, settings);
  }, SYNC_DEBOUNCE_MS);
}

/** Check the OS-level notification permission (native only). */
export async function checkNativePermission(): Promise<'granted' | 'denied' | 'unknown'> {
  if (!isNativeApp()) return 'unknown';
  try {
    const status = await LocalNotifications.checkPermissions();
    return status.display === 'granted' ? 'granted' : status.display === 'denied' ? 'denied' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Request the OS-level notification permission (native only). */
export async function ensureNativePermission(): Promise<'granted' | 'denied'> {
  if (!isNativeApp()) return 'denied';
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return 'granted';
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    console.warn('Notification permission request failed:', err);
    return 'denied';
  }
}

/** Show a notification immediately through the OS (native test button). */
export async function showNativeNotificationNow(title: string, body: string): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: numericId(`instant-${Date.now()}-${title}`),
          title,
          body,
          extra: { notificationKey: 'manual-test' },
        },
      ],
    });
  } catch (err) {
    console.warn('Immediate native notification failed:', err);
  }
}

