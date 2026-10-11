import { Task, ScheduleEvent, NotificationSettings } from '../types';
import { getLocalDateKey } from '../utils/dates';

export const CHANNELS = {
  REMINDERS: 'chronopulse_reminders',
  GENERAL: 'chronopulse_general',
} as const;

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % 2147483647 || 1;
}

/** How far ahead reminders are registered with Android AlarmManager. */
export const SCHEDULE_WINDOW_MS = 30 * 86400000;
/** Android caps pending alarms — keep the closest ones and re-sync regularly. */
export const MAX_SCHEDULED_ALARMS = 64;
export const DAY_MS = 86400000;

/**
 * Status-bar icon for every notification.
 *
 * The Capacitor local-notifications plugin resolves `smallIcon` via
 * `AssetUtil.getResourceID(ctx, name, "drawable")` (LocalNotification.kt:79 →
 * `resolveSmallIcon`). The launcher icon `ic_launcher_round` only exists in
 * `res/mipmap-*`, so a lookup in `res/drawable` returns id 0 and the plugin
 * falls back to `getDefaultSmallIcon()` (LocalNotificationManager.kt:490),
 * ultimately `android.R.drawable.ic_dialog_info` — a generic dialog glyph.
 * `ic_stat_reminder` is a real monochrome vector in `res/drawable`, so it
 * resolves to the intended silhouette that follows Android status-bar icon
 * guidelines. (Using the launcher icon here is a cosmetic bug, not a delivery
 * failure — an unresolved small icon does NOT abort `schedule()`.)
 */
export const NOTIFICATION_SMALL_ICON = 'ic_stat_reminder';

/**
 * A single reminder produced by {@link buildUpcomingNotifications}. The same
 * shape feeds Android AlarmManager (native) and the FCM web-push queue, so any
 * change here automatically applies to both delivery channels.
 */
export interface ScheduledNotification {
  id: number;
  title: string;
  body: string;
  channelId: string;
  schedule: { at: Date; allowWhileIdle: boolean };
  extra: Record<string, unknown>;
  smallIcon: string;
  iconColor: string;
}

export interface ReminderBuilderOptions {
  tasks: Task[];
  schedule: ScheduleEvent[];
  settings: NotificationSettings;
  /** Epoch ms reference time. Defaults to Date.now(); injectable for tests. */
  now?: number;
}

/**
 * Compute every reminder that should fire inside the scheduling window.
 *
 * This is deliberately a pure function with no side effects so the exact same
 * list can be handed to the native alarm scheduler and to the web-push queue.
 */
export function buildUpcomingNotifications({
  tasks,
  schedule,
  settings,
  now = Date.now(),
}: ReminderBuilderOptions): ScheduledNotification[] {
  const upcomingNotifications: ScheduledNotification[] = [];

  const advanceMs = (settings.advanceNoticeMinutes || 15) * 60 * 1000;

  // 1. SCHEDULE TASK REMINDERS
  // A task with an explicit reminder leads its anchor by `minutesBefore`.
  // Every other task that has a chosen start time still alerts the device
  // exactly when that time arrives (Google-Calendar-style start alert), so
  // a task is never silent just because "no early reminder" was picked.
  // Repeating tasks get one alert per occurrence inside the window.
  if (settings.taskReminders) {
    const todayKey = getLocalDateKey(new Date(now));
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
            smallIcon: NOTIFICATION_SMALL_ICON,
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
            smallIcon: NOTIFICATION_SMALL_ICON,
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
            smallIcon: NOTIFICATION_SMALL_ICON,
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
            smallIcon: NOTIFICATION_SMALL_ICON,
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
      const d = new Date(now);
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
          smallIcon: NOTIFICATION_SMALL_ICON,
          iconColor: '#4F46E5',
        });
      }
    }
  }

  // 5. SCHEDULE AI EVENING STUDY SUGGESTION & REVIEW
  if (settings.aiSuggestions) {
    for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
      const d = new Date(now);
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
          smallIcon: NOTIFICATION_SMALL_ICON,
          iconColor: '#4F46E5',
        });
      }
    }
  }

  // Nearest alerts first.
  upcomingNotifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return upcomingNotifications;
}
