import { describe, it, expect, vi } from 'vitest';

// `notificationService.ts` imports `syncWebPushQueue` from `./webPushService`,
// which pulls in the whole Firebase SDK at module load (getFirestore with a
// persistent IndexedDB cache that has no place to live in a node test). Mock it
// out — plus the Capacitor plugins — so we can exercise the pure permission
// decision in isolation with zero network / native side effects.
vi.mock('./webPushService', () => ({
  syncWebPushQueue: vi.fn(async () => 0),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    createChannel: vi.fn(async () => {}),
    addListener: vi.fn(async () => {}),
    checkPermissions: vi.fn(async () => ({ display: 'prompt' })),
    requestPermissions: vi.fn(async () => ({ display: 'prompt' })),
    cancelAll: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    schedule: vi.fn(async () => {}),
    areEnabled: vi.fn(async () => ({ value: true })),
    checkExactNotificationSetting: vi.fn(async () => ({ exact_alarm: 'granted' })),
    changeExactNotificationSetting: vi.fn(async () => {}),
    openSettings: vi.fn(async () => {}),
  },
}));

import { shouldAutoPromptPermission } from './notificationService';
import type { PermissionStateResult } from './notificationService';

/**
 * Phase 3: "Notification permission denied and subsequently granted" and
 * "reminder settings disabled and re-enabled".
 *
 * `shouldAutoPromptPermission` is the pure core of the launch-time permission
 * gate. It must: ask on first run (`prompt`), never nag twice on the same build
 * after a denial, give exactly one fresh attempt after an upgrade, and stay
 * silent once granted / when unsupported.
 */
describe('shouldAutoPromptPermission', () => {
  const CURRENT = '3.5.1';

  it('prompts on first run when the OS is still asking (prompt)', () => {
    expect(shouldAutoPromptPermission('prompt', CURRENT, null)).toBe(true);
  });

  it('does not prompt when permission is already granted', () => {
    expect(shouldAutoPromptPermission('granted', CURRENT, null)).toBe(false);
    expect(shouldAutoPromptPermission('granted', CURRENT, CURRENT)).toBe(false);
  });

  it('does not prompt where notifications are unsupported', () => {
    expect(shouldAutoPromptPermission('unsupported', CURRENT, null)).toBe(false);
  });

  it('prompts once after a first-time denial, then stays quiet on the same build', () => {
    // First denial → we have not prompted on this version yet, so try once.
    expect(shouldAutoPromptPermission('denied', CURRENT, null)).toBe(true);
    // The gate records the version BEFORE prompting; a second launch on the
    // same build must not nag the user again.
    expect(shouldAutoPromptPermission('denied', CURRENT, CURRENT)).toBe(false);
  });

  it('gives exactly one fresh attempt after an app upgrade following a denial', () => {
    // Previously denied on an older build → new version merits one retry.
    expect(shouldAutoPromptPermission('denied', CURRENT, '3.4.0')).toBe(true);
    // Once we have prompted on THIS version, stop.
    expect(shouldAutoPromptPermission('denied', CURRENT, CURRENT)).toBe(false);
  });

  it('never re-prompts a user who denied on this exact version even if a prior older denial exists', () => {
    // `lastPromptedVersion` tracks the newest attempt, so once we are current
    // we remain quiet regardless of any older history.
    expect(shouldAutoPromptPermission('denied', '3.5.2', '3.5.1')).toBe(true);
    expect(shouldAutoPromptPermission('denied', '3.5.2', '3.5.2')).toBe(false);
  });

  it('covers every PermissionStateResult branch deterministically', () => {
    const states: PermissionStateResult[] = ['granted', 'denied', 'prompt', 'unsupported'];
    for (const s of states) {
      expect(typeof shouldAutoPromptPermission(s, CURRENT, null)).toBe('boolean');
    }
  });
});

import {
  buildUpcomingNotifications,
  hashString,
  SCHEDULE_WINDOW_MS,
  CHANNELS,
  NOTIFICATION_SMALL_ICON,
  type ScheduledNotification,
} from './reminderBuilder';
import { getLocalDateKey } from '../utils/dates';
import type { Task, ScheduleEvent, NotificationSettings } from '../types';

/**
 * Deterministic anchor: Monday 2025-06-09 00:30 local time.
 * "YYYY-MM-DDTHH:mm:ss" (no offset) is parsed as LOCAL time by JS, and
 * getLocalDateKey uses local getters — so every expectation below is stable on
 * any machine timezone. No US/EU/AU DST transition falls inside the following
 * 30 days, so the recurrence/day-loop math can't drift by an hour.
 */
const NOW = new Date('2025-06-09T00:30:00');
const NOW_MS = NOW.getTime();
const TODAY_KEY = getLocalDateKey(NOW); // '2025-06-09' (a Monday)

/** Local 'YYYY-MM-DD' key for the day `addDays` from the anchor. */
function dayOffsetKey(addDays: number): string {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  d.setDate(d.getDate() + addDays);
  return getLocalDateKey(d);
}

/** Local epoch ms for a given day key + 'HH:mm:ss' wall-clock time. */
function localMs(dayKey: string, time: string): number {
  return new Date(`${dayKey}T${time}`).getTime();
}

/** All categories off; individual tests turn on only what they exercise. */
const BASE_SETTINGS: NotificationSettings = {
  inAppBanners: true,
  soundEnabled: true,
  browserNotifications: true,
  taskReminders: false,
  classReminders: false,
  deadlineAlerts: false,
  aiSuggestions: false,
  dailyBriefing: false,
  weeklySummary: true,
  advanceNoticeMinutes: 15,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

const settings = (over: Partial<NotificationSettings>): NotificationSettings => ({
  ...BASE_SETTINGS,
  ...over,
});

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Study physics',
    description: '',
    courseCode: 'PHY101',
    courseColor: '#4F46E5',
    category: 'academic',
    type: 'assignment',
    deadline: `${TODAY_KEY}T23:59:00`,
    scheduledDate: TODAY_KEY,
    scheduledStartTime: '14:00',
    recurrence: 'none',
    reminder: { enabled: false, minutesBefore: 15 },
    estimatedMinutes: 45,
    priority: 'medium',
    progress: 0,
    completed: false,
    subtasks: [],
    relatedFileIds: [],
    relatedResearchIds: [],
    createdAt: `${TODAY_KEY}T00:00:00`,
    ...over,
  };
}

function makeEvent(over: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: 'evt-1',
    title: 'Physics Lecture',
    type: 'class',
    startTime: '10:00',
    endTime: '11:30',
    date: dayOffsetKey(1),
    courseCode: 'PHY101',
    location: 'Room 204',
    color: '#4F46E5',
    ...over,
  };
}

type Extra = { type: string; taskId?: string; eventId?: string };
const asExtra = (n: ScheduledNotification): Extra => n.extra as Extra;

function run(opts: {
  tasks?: Task[];
  schedule?: ScheduleEvent[];
  set: Partial<NotificationSettings>;
  now?: number;
}): ScheduledNotification[] {
  return buildUpcomingNotifications({
    tasks: opts.tasks ?? [],
    schedule: opts.schedule ?? [],
    settings: settings(opts.set),
    now: opts.now ?? NOW_MS,
  });
}

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('task-rem-a-2025-06-09')).toBe(hashString('task-rem-a-2025-06-09'));
  });

  it('returns a positive integer that fits in a signed 32-bit Android id', () => {
    const values = ['', 'a', 'class-1-2025-06-09', 'x'.repeat(500)].map(hashString);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(2147483647);
    }
  });

  it('falls back to 1 for the empty string (0 || 1 guard)', () => {
    expect(hashString('')).toBe(1);
  });

  it('produces different ids for different inputs', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('buildUpcomingNotifications — task reminders', () => {
  it('schedules an early reminder for a task with reminder enabled', () => {
    const task = makeTask({ reminder: { enabled: true, minutesBefore: 15 } });
    const list = run({ tasks: [task], set: { taskReminders: true } });
    expect(list).toHaveLength(1);
    const n = list[0];
    expect(n.title).toBe('📌 Task Reminder: Study physics');
    expect(n.channelId).toBe(CHANNELS.REMINDERS);
    expect(n.extra).toEqual({ type: 'task', taskId: task.id });
    expect(n.smallIcon).toBe(NOTIFICATION_SMALL_ICON);
    // 14:00 start minus 15 minutes = 13:45 local.
    expect(n.schedule.at.getTime()).toBe(localMs(TODAY_KEY, '13:45:00'));
    expect(n.schedule.allowWhileIdle).toBe(true);
    expect(n.id).toBe(hashString(`task-rem-${task.id}-${TODAY_KEY}`));
  });

  it('alerts exactly at start time when a start time is set but no early reminder is chosen', () => {
    const task = makeTask({ reminder: { enabled: false, minutesBefore: 15 } });
    const list = run({ tasks: [task], set: { taskReminders: true } });
    expect(list).toHaveLength(1);
    const n = list[0];
    expect(n.title).toBe('⏰ Time to Start: Study physics');
    expect(n.body).toContain('Planned for 14:00');
    expect(n.body).toContain('(PHY101)');
    expect(n.schedule.at.getTime()).toBe(localMs(TODAY_KEY, '14:00:00'));
  });

  it('anchors to end-of-day (23:59:59) minus lead when a reminder is enabled but there is no start time', () => {
    const task = makeTask({
      scheduledStartTime: undefined,
      reminder: { enabled: true, minutesBefore: 15 },
    });
    const list = run({ tasks: [task], set: { taskReminders: true } });
    expect(list).toHaveLength(1);
    expect(list[0].schedule.at.getTime()).toBe(localMs(TODAY_KEY, '23:44:59'));
  });

  it('skips a task that has neither a start time nor an enabled reminder', () => {
    const task = makeTask({
      scheduledStartTime: undefined,
      reminder: { enabled: false, minutesBefore: 15 },
    });
    expect(run({ tasks: [task], set: { taskReminders: true } })).toHaveLength(0);
  });

  it('skips a reminder whose fire time is already in the past', () => {
    // Start time 00:10 is before the 00:30 anchor now.
    const task = makeTask({ scheduledStartTime: '00:10' });
    expect(run({ tasks: [task], set: { taskReminders: true } })).toHaveLength(0);
  });

  it('skips completed tasks', () => {
    const task = makeTask({ completed: true, reminder: { enabled: true, minutesBefore: 15 } });
    expect(run({ tasks: [task], set: { taskReminders: true } })).toHaveLength(0);
  });

  it('produces nothing when the taskReminders category is disabled', () => {
    const task = makeTask({ reminder: { enabled: true, minutesBefore: 15 } });
    expect(run({ tasks: [task], set: { taskReminders: false } })).toHaveLength(0);
  });

  it('uses the deadline day when no scheduledDate is present', () => {
    const task = makeTask({
      scheduledDate: undefined,
      deadline: `${dayOffsetKey(1)}T23:59:00`,
      scheduledStartTime: '09:00',
      reminder: { enabled: false, minutesBefore: 15 },
    });
    const list = run({ tasks: [task], set: { taskReminders: true } });
    expect(list).toHaveLength(1);
    expect(list[0].schedule.at.getTime()).toBe(localMs(dayOffsetKey(1), '09:00:00'));
  });
});


describe('buildUpcomingNotifications — recurrence', () => {
  it('daily recurrence produces one alert per day inside the window with unique ids', () => {
    const task = makeTask({
      recurrence: 'daily',
      reminder: { enabled: true, minutesBefore: 15 },
    });
    const list = run({ tasks: [task], set: { taskReminders: true } });
    expect(list).toHaveLength(30); // offsets 0..29; offset 30 falls outside the 30-day window
    const ids = new Set(list.map((n) => n.id));
    expect(ids.size).toBe(list.length); // no id collisions
    for (const n of list) {
      expect(n.schedule.at.getTime()).toBeGreaterThan(NOW_MS);
      expect(n.schedule.at.getTime()).toBeLessThan(NOW_MS + SCHEDULE_WINDOW_MS);
    }
    expect(list[0].schedule.at.getTime()).toBe(localMs(TODAY_KEY, '13:45:00'));
  });

  it('weekly recurrence fires every 7 days', () => {
    const task = makeTask({
      recurrence: 'weekly',
      reminder: { enabled: true, minutesBefore: 15 },
    });
    const list = run({ tasks: [task], set: { taskReminders: true } });
    expect(list).toHaveLength(5); // days 0, 7, 14, 21, 28
  });

  it('weekdays recurrence never schedules on Saturday or Sunday', () => {
    const task = makeTask({
      recurrence: 'weekdays',
      reminder: { enabled: true, minutesBefore: 15 },
    });
    const list = run({ tasks: [task], set: { taskReminders: true } });
    expect(list.length).toBeGreaterThan(0);
    for (const n of list) {
      const day = new Date(n.schedule.at.getTime()).getDay();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    }
  });
});

describe('buildUpcomingNotifications — deadline alerts', () => {
  it('schedules a 2h warning and a 30m final alert before the deadline', () => {
    const task = makeTask({ deadline: `${TODAY_KEY}T16:00:00` });
    const list = run({ tasks: [task], set: { deadlineAlerts: true } });
    expect(list).toHaveLength(2);
    const twoHour = list.find((n) => n.title.startsWith('⚠️'));
    const thirty = list.find((n) => n.title.startsWith('🚨'));
    expect(twoHour?.schedule.at.getTime()).toBe(localMs(TODAY_KEY, '14:00:00'));
    expect(twoHour?.id).toBe(hashString(`task-dl-2h-${task.id}`));
    expect(thirty?.schedule.at.getTime()).toBe(localMs(TODAY_KEY, '15:30:00'));
    expect(thirty?.id).toBe(hashString(`task-dl-30m-${task.id}`));
  });

  it('skips deadline alerts for completed tasks', () => {
    const task = makeTask({ completed: true, deadline: `${TODAY_KEY}T16:00:00` });
    expect(run({ tasks: [task], set: { deadlineAlerts: true } })).toHaveLength(0);
  });

  it('skips a deadline that is already in the past', () => {
    const task = makeTask({ deadline: `${dayOffsetKey(-1)}T18:00:00` });
    expect(run({ tasks: [task], set: { deadlineAlerts: true } })).toHaveLength(0);
  });

  it('skips a deadline beyond the scheduling window', () => {
    const task = makeTask({ deadline: '2025-12-01T16:00:00' });
    expect(run({ tasks: [task], set: { deadlineAlerts: true } })).toHaveLength(0);
  });

  it('produces nothing when deadlineAlerts is disabled', () => {
    const task = makeTask({ deadline: `${TODAY_KEY}T16:00:00` });
    expect(run({ tasks: [task], set: { deadlineAlerts: false } })).toHaveLength(0);
  });
});

