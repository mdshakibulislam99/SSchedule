import { Capacitor } from '@capacitor/core';
import { LocalNotifications, PermissionStatus } from '@capacitor/local-notifications';
import { Task, ScheduleEvent, NotificationSettings } from '../types';
import { getLocalDateKey } from '../utils/dates';

export const CHANNELS = {
  REMINDERS: 'chronopulse_reminders',
  GENERAL: 'chronopulse_general',
} as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % 2147483647 || 1;
}

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

/** How far ahead reminders are registered with Android AlarmManager. */
const SCHEDULE_WINDOW_MS = 30 * 86400000;
/** Android caps pending alarms — keep the closest ones and re-sync regularly. */
const MAX_SCHEDULED_ALARMS = 64;
const DAY_MS = 86400000;
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

/**
 * Prompt the user for notification permissions on Native Android (POST_NOTIFICATIONS) or Web.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      // Ensure channels exist first
      await initNotifications();
      const status = await LocalNotifications.requestPermissions();
      // On Android 12+ (API 31+), check exact alarm setting for background notifications
      try {
        const exactSetting = await LocalNotifications.checkExactNotificationSetting();
        if (exactSetting && exactSetting.exact_alarm !== 'granted') {
          await LocalNotifications.changeExactNotificationSetting();
        }
      } catch {
        // Non-blocking exact alarm setting check
      }
      return status.display === 'granted';
    } catch (err) {
      console.error('Error requesting native notification permissions:', err);
      return false;
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch (err) {
      console.warn('Error requesting web notification permissions:', err);
      return false;
    }
  }

  return false;
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
            smallIcon: 'ic_launcher_round',
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

async function performSyncAlarms({
  tasks,
  schedule,
  settings,
}: SyncAlarmsOptions): Promise<number> {
  if (!Capacitor.isNativePlatform()) {
    return 0;
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

    const now = Date.now();
    const upcomingNotifications: Array<{
      id: number;
      title: string;
      body: string;
      channelId: string;
      schedule: { at: Date; allowWhileIdle: boolean };
      extra: Record<string, unknown>;
      smallIcon: string;
      iconColor: string;
    }> = [];

    const advanceMs = (settings.advanceNoticeMinutes || 15) * 60 * 1000;

    // 1. SCHEDULE TASK REMINDERS
    // A task with an explicit reminder leads its anchor by `minutesBefore`.
    // Every other task that has a chosen start time still alerts the device
    // exactly when that time arrives (Google-Calendar-style start alert), so
    // a task is never silent just because "no early reminder" was picked.
    // Repeating tasks get one alert per occurrence inside the window.
    if (settings.taskReminders) {
      const todayKey = getLocalDateKey();
      const todayMs = new Date(`${todayKey}T12:00:00`).getTime();

      tasks.forEach((task) => {
        if (task.completed) return;
        try {
          const baseDate = task.scheduledDate || task.deadline?.slice(0, 10) || '';
          if (!baseDate) return;
          const baseMs = new Date(`${baseDate}T12:00:00`).getTime();
          if (isNaN(baseMs)) return;

          const hasEarlyReminder = !!task.reminder?.enabled;
          if (!hasEarlyReminder && !task.scheduledStartTime) return;
          const leadMs = hasEarlyReminder
            ? (task.reminder?.minutesBefore ?? settings.advanceNoticeMinutes ?? 15) * 60 * 1000
            : 0;
          const recurrence = task.recurrence || 'none';

          for (let offset = 0; offset <= SCHEDULE_WINDOW_MS / DAY_MS; offset++) {
            const dayKey = getLocalDateKey(new Date(todayMs + offset * DAY_MS));
            if (dayKey < baseDate) continue;

            const dayMs = new Date(`${dayKey}T12:00:00`).getTime();
            const weekday = new Date(`${dayKey}T12:00:00`).getDay();
            const diffDays = Math.round((dayMs - baseMs) / DAY_MS);
            const occursOnDay =
              recurrence === 'daily' ||
              (recurrence === 'weekdays' && weekday > 0 && weekday < 6) ||
              (recurrence === 'weekly' && diffDays % 7 === 0) ||
              (recurrence === 'none' && diffDays === 0);
            if (!occursOnDay) continue;

            const anchorMs = task.scheduledStartTime
              ? new Date(`${dayKey}T${task.scheduledStartTime}:00`).getTime()
              : new Date(`${dayKey}T23:59:59`).getTime();
            if (isNaN(anchorMs)) {
              // A malformed time (e.g. "2:30 PM" instead of "14:30") would
              // otherwise poison the whole schedule() batch with an Invalid
              // Date and silently drop EVERY alarm on the device.
              console.warn(`Skipping reminders for task ${task.id}: invalid scheduledStartTime "${task.scheduledStartTime}".`);
              return;
            }
            const reminderTime = anchorMs - leadMs;
            if (isNaN(reminderTime) || reminderTime <= now || reminderTime >= now + SCHEDULE_WINDOW_MS) continue;

            upcomingNotifications.push({
              id: hashString(`task-rem-${task.id}-${dayKey}`),
              title: leadMs === 0
                ? `⏰ Time to Start: ${task.title}`
                : `📌 Task Reminder: ${task.title}`,
              body: leadMs === 0
                ? `Planned for ${task.scheduledStartTime}${task.courseCode ? ` (${task.courseCode})` : ''} · ${task.estimatedMinutes}m focus block`
                : task.scheduledStartTime
                  ? `Planned for ${task.scheduledStartTime}${task.courseCode ? ` (${task.courseCode})` : ''} · ${task.estimatedMinutes}m duration`
                  : `Due ${new Date(dayMs).toLocaleDateString([], { month: 'short', day: 'numeric' })}${task.courseCode ? ` (${task.courseCode})` : ''} · ${task.estimatedMinutes}m estimated`,
              channelId: CHANNELS.REMINDERS,
              schedule: { at: new Date(reminderTime), allowWhileIdle: true },
              extra: { type: 'task', taskId: task.id },
              smallIcon: 'ic_launcher_round',
              iconColor: '#4F46E5',
            });
          }
        } catch {
          // ignore date parse errors
        }
      });
    }

    // 2. SCHEDULE TASK DEADLINES
    if (settings.deadlineAlerts) {
      tasks.forEach((task) => {
        if (task.completed || !task.deadline) return;
        try {
          const deadlineMs = new Date(task.deadline).getTime();
          if (isNaN(deadlineMs)) return;

          // 2 Hours Before Deadline
          const twoHoursBefore = deadlineMs - 2 * 3600 * 1000;
          if (twoHoursBefore > now && twoHoursBefore < now + SCHEDULE_WINDOW_MS) {
            upcomingNotifications.push({
              id: hashString(`task-dl-2h-${task.id}`),
              title: `⚠️ 2h Deadline Warning: ${task.title}`,
              body: `This assignment is due in 2 hours! Open SSchedule to wrap it up.`,
              channelId: CHANNELS.REMINDERS,
              schedule: { at: new Date(twoHoursBefore), allowWhileIdle: true },
              extra: { type: 'task', taskId: task.id },
              smallIcon: 'ic_launcher_round',
              iconColor: '#4F46E5',
            });
          }

          // 30 Minutes Before Deadline
          const thirtyMinsBefore = deadlineMs - 30 * 60 * 1000;
          if (thirtyMinsBefore > now && thirtyMinsBefore < now + SCHEDULE_WINDOW_MS) {
            upcomingNotifications.push({
              id: hashString(`task-dl-30m-${task.id}`),
              title: `🚨 Final Deadline Alert: ${task.title}`,
              body: `Due in 30 minutes! Make sure your work is submitted on time.`,
              channelId: CHANNELS.REMINDERS,
              schedule: { at: new Date(thirtyMinsBefore), allowWhileIdle: true },
              extra: { type: 'task', taskId: task.id },
              smallIcon: 'ic_launcher_round',
              iconColor: '#4F46E5',
            });
          }
        } catch {
          // ignore
        }
      });
    }

    // 3. SCHEDULE COURSE & CLASS REMINDERS
    if (settings.classReminders) {
      schedule.forEach((event) => {
        if (event.isCompleted || event.isMissed) return;
        try {
          const classStartMs = new Date(`${event.date}T${event.startTime}:00`).getTime();
          if (isNaN(classStartMs)) return;
          const classReminderMs = classStartMs - advanceMs;

          if (classReminderMs > now && classReminderMs < now + SCHEDULE_WINDOW_MS) {
            upcomingNotifications.push({
              id: hashString(`class-${event.id}-${event.date}`),
              title: `🎓 Class Reminder: ${event.title}`,
              body: `${event.courseCode ? `[${event.courseCode}] ` : ''}${event.location ? `Room: ${event.location} · ` : ''}Starts in ${settings.advanceNoticeMinutes || 15}m (${event.startTime})`,
              channelId: CHANNELS.REMINDERS,
              schedule: { at: new Date(classReminderMs), allowWhileIdle: true },
              extra: { type: 'class', eventId: event.id },
              smallIcon: 'ic_launcher_round',
              iconColor: '#4F46E5',
            });
          }
        } catch {
          // ignore
        }
      });
    }

    // 4. SCHEDULE DAILY MORNING BRIEFING
    if (settings.dailyBriefing) {
      for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
        const d = new Date();
        d.setDate(d.getDate() + dayOffset);
        d.setHours(8, 0, 0, 0); // 8:00 AM local time
        const morningMs = d.getTime();

        if (morningMs > now) {
          upcomingNotifications.push({
            id: hashString(`morning-brief-${d.toDateString()}`),
            title: `☀️ Good Morning! Your Daily Plan is Ready`,
            body: `Check today's schedule, key study slots, and high-priority goals.`,
            channelId: CHANNELS.GENERAL,
            schedule: { at: new Date(morningMs), allowWhileIdle: true },
            extra: { type: 'briefing' },
            smallIcon: 'ic_launcher_round',
            iconColor: '#4F46E5',
          });
        }
      }
    }

    // 5. SCHEDULE AI EVENING STUDY SUGGESTION & REVIEW
    if (settings.aiSuggestions) {
      for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
        const d = new Date();
        d.setDate(d.getDate() + dayOffset);
        d.setHours(19, 30, 0, 0); // 7:30 PM local time
        const eveningMs = d.getTime();

        if (eveningMs > now) {
          upcomingNotifications.push({
            id: hashString(`evening-suggestion-${d.toDateString()}`),
            title: `💡 SSchedule AI: Evening Focus Wrap-up`,
            body: `Review completed tasks, log focus streaks, and optimize tomorrow's plan.`,
            channelId: CHANNELS.GENERAL,
            schedule: { at: new Date(eveningMs), allowWhileIdle: true },
            extra: { type: 'suggestion' },
            smallIcon: 'ic_launcher_round',
            iconColor: '#4F46E5',
          });
        }
      }
    }

    // Nearest alerts first, then cap to stay well below Android OS quotas.
    upcomingNotifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
    const finalBatch = upcomingNotifications.slice(0, MAX_SCHEDULED_ALARMS);
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

