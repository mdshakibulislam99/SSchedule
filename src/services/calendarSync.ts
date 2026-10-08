import {
  CalendarOutboxItem,
  GoogleCalendarSyncState,
  ScheduleEvent,
  ScheduleEventType,
} from '../types';
import { getLocalDateKey } from '../utils/dates';
import {
  GoogleApiError,
  GoogleCalendarEvent,
  insertEvent,
  isReconnectError,
  listEvents,
  patchEvent,
  deleteEvent,
} from '../lib/googleCalendar';

export const SCHEDULE_EVENT_COLORS: Record<ScheduleEventType, string> = {
  class: '#EF4444',
  study: '#6366F1',
  break: '#10B981',
  gym: '#10B981',
  exam: '#F59E0B',
  project: '#3B82F6',
};

export const SCHEDULE_EVENT_EMOJI: Record<ScheduleEventType, string> = {
  class: '🎓',
  study: '📚',
  break: '☕',
  gym: '🏋️',
  exam: '📝',
  project: '🚀',
};

const GOOGLE_COLOR_BY_TYPE: Record<ScheduleEventType, string> = {
  class: '11', // Tomato (red)
  exam: '5', // Banana (amber)
  study: '9', // Blueberry (indigo)
  break: '10', // Basil (green)
  gym: '10', // Basil (green)
  project: '7', // Peacock (blue)
};

/** Minimal RRULE parser for common recurrence patterns used by students. */
interface RRuleRule {
  freq: string;
  interval: number;
  count?: number;
  until?: string;
  byday?: string[];
  dtstart: string;
}

const DAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function parseRRule(rrule: string): RRuleRule | null {
  try {
    const parts = rrule.split(';');
    const result: Partial<RRuleRule> & { freq: string; dtstart: string } = { freq: '', dtstart: '' };
    for (const part of parts) {
      const [key, val] = part.split('=');
      if (key === 'FREQ') result.freq = val;
      if (key === 'INTERVAL') result.interval = parseInt(val, 10) || 1;
      if (key === 'COUNT') result.count = parseInt(val, 10);
      if (key === 'UNTIL') result.until = val;
      if (key === 'BYDAY') result.byday = val.split(',');
      if (key === 'DTSTART') result.dtstart = val;
    }
    if (!result.freq) return null;
    return result as RRuleRule;
  } catch {
    return null;
  }
}

function expandRRule(rule: RRuleRule, windowStart: Date, windowEnd: Date): Date[] {
  const dtstart = new Date(rule.dtstart);
  if (Number.isNaN(dtstart.getTime())) return [];
  const occurrences: Date[] = [];
  const interval = rule.interval || 1;
  let current = new Date(dtstart);
  const maxIterations = 2000; // safety cap
  let iterations = 0;

  while (iterations++ < maxIterations) {
    if (current > windowEnd) break;
    if (current >= windowStart) {
      occurrences.push(new Date(current));
      if (rule.count && occurrences.length >= rule.count) break;
    }

    if (rule.freq === 'DAILY') {
      current.setDate(current.getDate() + interval);
    } else if (rule.freq === 'WEEKLY') {
      const daysToAdd = interval * 7;
      current.setDate(current.getDate() + daysToAdd);
    } else if (rule.freq === 'MONTHLY') {
      current.setMonth(current.getMonth() + interval);
    } else if (rule.freq === 'YEARLY') {
      current.setFullYear(current.getFullYear() + interval);
    } else {
      break; // unsupported freq
    }

    if (rule.until) {
      const untilDate = new Date(rule.until);
      if (current > untilDate) break;
    }
  }
  return occurrences;
}

function expandByDay(rule: RRuleRule, windowStart: Date, windowEnd: Date): Date[] {
  // For WEEKLY with BYDAY, generate each day of the week within the window
  const base = new Date(rule.dtstart);
  const occurrences: Date[] = [];
  const targetDays = (rule.byday || []).map((d) => DAY_MAP[d]).filter((d) => d !== undefined) as number[];
  if (targetDays.length === 0) return expandRRule(rule, windowStart, windowEnd);

  const interval = rule.interval || 1;
  let currentWeek = 0;
  const maxWeeks = 52 * interval * 4; // ~1 year at most

  for (let w = 0; w < maxWeeks; w += interval) {
    const weekStart = new Date(base);
    weekStart.setDate(weekStart.getDate() + w * 7);
    for (const dayOfWeek of targetDays) {
      const candidate = new Date(weekStart);
      candidate.setDate(weekStart.getDate() + dayOfWeek - weekStart.getDay());
      // If BYDAY day is before the base day of the first week, it belongs to the next week
      if (candidate < base && w === 0) continue;
      if (candidate >= windowStart && candidate <= windowEnd) {
        occurrences.push(new Date(candidate));
      }
    }
    if (weekStart > windowEnd) break;
  }
  return occurrences;
}

function getRecurrenceDates(g: GoogleCalendarEvent, windowStart: Date, windowEnd: Date): Date[] {
  if (!g.recurrence || g.recurrence.length === 0) return [];
  const rrule = g.recurrence.find((r) => r.startsWith('RRULE:'));
  if (!rrule) return [];
  const rule = parseRRule(rrule.replace('RRULE:', ''));
  if (!rule) return [];
  rule.dtstart = g.start?.dateTime || g.start?.date || '';
  if (rule.freq === 'WEEKLY' && rule.byday && rule.byday.length > 0) {
    return expandByDay(rule, windowStart, windowEnd);
  }
  return expandRRule(rule, windowStart, windowEnd);
}

function isRecurrenceExcluded(g: GoogleCalendarEvent, date: Date): Date | null {
  if (!g.excludedDates || g.excludedDates.length === 0) return null;
  const dateKey = date.toISOString().slice(0, 10);
  const excluded = g.excludedDates.find((ex) => ex.date === dateKey);
  return excluded ? date : null;
}

const SOURCE_TAG = 'chrono';

function localDateAndTime(iso?: string, fallbackTime = '00:00'): { date: string; time: string } {
  if (!iso) return { date: getLocalDateKey(), time: fallbackTime };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: getLocalDateKey(), time: fallbackTime };
  return {
    date: getLocalDateKey(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

/** Builds the Google Calendar event payload for a local block. */
export function toGoogleEventBody(ev: ScheduleEvent): Partial<GoogleCalendarEvent> {
  const start = new Date(`${ev.date}T${ev.startTime}:00`);
  let end = new Date(`${ev.date}T${ev.endTime}:00`);
  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  } else if (end.getDate() !== start.getDate()) {
    // keep events within a single day for the calendar grid
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  return {
    summary: ev.title,
    location: ev.location || undefined,
    description: ev.courseCode ? `Course: ${ev.courseCode}` : undefined,
    colorId: GOOGLE_COLOR_BY_TYPE[ev.type] || '9',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    extendedProperties: {
      private: {
        [`${SOURCE_TAG}Type`]: ev.type,
        [`${SOURCE_TAG}CourseCode`]: ev.courseCode || '',
        [`${SOURCE_TAG}EventId`]: ev.id,
      },
    },
  };
}

/** Maps a Google Calendar event into an app ScheduleEvent. */
export function fromGoogleEvent(g: GoogleCalendarEvent, calendarId: string, occurrenceDate?: Date): ScheduleEvent {
  const priv = g.extendedProperties?.private || {};
  const rawType = priv[`${SOURCE_TAG}Type`] as ScheduleEventType | undefined;
  const type: ScheduleEventType =
    rawType && rawType in SCHEDULE_EVENT_COLORS ? rawType : 'study';

  let date: string;
  let startTime: string;
  let endTime: string;
  if (g.start?.date) {
    date = g.start.date;
    startTime = '00:00';
    endTime = g.end?.date ? g.end.date : g.start.date;
    if (endTime === date) endTime = '23:59';
  } else if (occurrenceDate) {
    date = getLocalDateKey(occurrenceDate);
    startTime = g.start?.dateTime ? new Date(g.start.dateTime).toTimeString().slice(0, 5) : '09:00';
    endTime = g.end?.dateTime ? new Date(g.end.dateTime).toTimeString().slice(0, 5) : '10:00';
  } else {
    const s = localDateAndTime(g.start?.dateTime, '09:00');
    const e = localDateAndTime(g.end?.dateTime, '10:00');
    date = s.date;
    startTime = s.time;
    endTime = e.time;
  }

  return {
    id: `gcal-${g.id}`,
    title: g.summary || '(Untitled event)',
    type,
    startTime,
    endTime,
    date,
    courseCode: priv[`${SOURCE_TAG}CourseCode`] || undefined,
    location: g.location || undefined,
    color: SCHEDULE_EVENT_COLORS[type],
    isCompleted: false,
    source: 'google',
    googleEventId: g.id,
    googleCalendarId: calendarId,
    googleEtag: g.etag,
    googleUpdatedAt: g.updated,
    updatedAt: g.updated,
  };
}

export async function pushCreate(
  ev: ScheduleEvent,
  calendarId: string,
): Promise<ScheduleEvent> {
  const created = await insertEvent(calendarId, toGoogleEventBody(ev));
  return {
    ...ev,
    source: 'local',
    googleEventId: created.id,
    googleCalendarId: calendarId,
    googleEtag: created.etag,
    googleUpdatedAt: created.updated,
  };
}

export async function pushUpdate(
  ev: ScheduleEvent,
  calendarId: string,
): Promise<ScheduleEvent> {
  if (!ev.googleEventId) return pushCreate(ev, calendarId);
  try {
    const updated = await patchEvent(calendarId, ev.googleEventId, toGoogleEventBody(ev));
    return {
      ...ev,
      googleCalendarId: calendarId,
      googleEtag: updated.etag,
      googleUpdatedAt: updated.updated,
    };
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) {
      return pushCreate({ ...ev, googleEventId: undefined }, calendarId);
    }
    throw err;
  }
}

export async function pushDelete(ev: ScheduleEvent, calendarId: string): Promise<void> {
  if (!ev.googleEventId) return;
  try {
    await deleteEvent(calendarId, ev.googleEventId);
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}

async function fetchAllPages(
  calendarId: string,
  syncToken: string | undefined,
): Promise<{ items: GoogleCalendarEvent[]; nextSyncToken?: string }> {
  const items: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const timeMin = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  do {
    const page = await listEvents({
      calendarId,
      syncToken,
      timeMin: syncToken ? undefined : timeMin,
      timeMax: syncToken ? undefined : timeMax,
      pageToken,
    });
    items.push(...page.items);
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken || nextSyncToken;
  } while (pageToken);
  return { items, nextSyncToken };
}

function isRemoteNewer(g: GoogleCalendarEvent, existing: ScheduleEvent): boolean {
  const localTs = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
  const remoteTs = g.updated ? Date.parse(g.updated) : 0;
  return remoteTs >= localTs;
}

async function applyPull(
  state: GoogleCalendarSyncState,
  localSchedule: ScheduleEvent[],
): Promise<{ schedule: ScheduleEvent[]; syncState: GoogleCalendarSyncState }> {
  const calendarId = state.calendarId || 'primary';
  const incrementalToken = state.syncToken;
  const { items, nextSyncToken } = await fetchAllPages(calendarId, incrementalToken);

  let result = [...localSchedule];

  if (!incrementalToken) {
    // Full sync: rebuild the set of Google-sourced events, preserving local ones.
    const referenced = new Set(
      result.filter((e) => e.googleEventId).map((e) => e.googleEventId as string),
    );
    result = result.filter((e) => e.source !== 'google');
    for (const g of items) {
      if (!g.id || g.status === 'cancelled') continue;
      if (referenced.has(g.id)) continue;
      if (g.recurrence && g.recurrence.length > 0) {
        const dates = getRecurrenceDates(g, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
        for (const d of dates) {
          const instance = fromGoogleEvent(g, calendarId, d);
          result.push(instance);
        }
        continue;
      }
      result.push(fromGoogleEvent(g, calendarId));
    }
  } else {
    for (const g of items) {
      if (!g.id) continue;
      const idx = result.findIndex(
        (e) => e.googleEventId === g.id || (e.source === 'google' && e.id === `gcal-${g.id}`),
      );
      if (g.status === 'cancelled') {
        if (idx >= 0) result.splice(idx, 1);
        continue;
      }
      if (g.recurrence && g.recurrence.length > 0) {
        const dates = getRecurrenceDates(g, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
        for (const d of dates) {
          const instance = fromGoogleEvent(g, calendarId, d);
          const existingIdx = result.findIndex((e) => e.id === instance.id);
          if (existingIdx >= 0) {
            const existing = result[existingIdx];
            if (existing.source !== 'google' && !isRemoteNewer(g, existing)) continue;
            result[existingIdx] = { ...instance, id: existing.id };
          } else {
            result.push(instance);
          }
        }
        continue;
      }
      if (idx >= 0) {
        const existing = result[idx];
        // Last-write-wins: keep local edits that are newer than the remote change.
        if (existing.source !== 'google' && !isRemoteNewer(g, existing)) continue;
        result[idx] = { ...fromGoogleEvent(g, calendarId), id: existing.id };
      } else {
        result.push(fromGoogleEvent(g, calendarId));
      }
    }
  }

  return {
    schedule: result,
    syncState: {
      ...state,
      connected: true,
      calendarId,
      syncToken: nextSyncToken || state.syncToken,
      lastSyncedAt: new Date().toISOString(),
      lastSyncError: undefined,
    },
  };
}

async function pullChanges(
  state: GoogleCalendarSyncState,
  localSchedule: ScheduleEvent[],
): Promise<{ schedule: ScheduleEvent[]; syncState: GoogleCalendarSyncState }> {
  try {
    return await applyPull(state, localSchedule);
  } catch (err) {
    // An invalid/expired sync token requires a full resync.
    if (err instanceof GoogleApiError && (err.status === 410 || err.status === 400)) {
      return applyPull({ ...state, syncToken: undefined }, localSchedule);
    }
    throw err;
  }
}

async function drainOutbox(
  state: GoogleCalendarSyncState,
  schedule: ScheduleEvent[],
  outbox: CalendarOutboxItem[],
): Promise<{
  schedule: ScheduleEvent[];
  remainingOutbox: CalendarOutboxItem[];
  reconnectRequired: boolean;
}> {
  const calendarId = state.calendarId || 'primary';
  let working = [...schedule];
  const remaining: CalendarOutboxItem[] = [];
  let reconnectRequired = false;

  for (const item of outbox) {
    if (reconnectRequired) {
      remaining.push(item);
      continue;
    }
    try {
      if (item.op === 'delete') {
        await pushDelete(item.event, calendarId);
      } else if (item.op === 'update') {
        const updated = await pushUpdate(item.event, calendarId);
        working = working.map((e) => (e.id === item.event.id ? { ...e, ...updated } : e));
      } else {
        const updated = await pushCreate(item.event, calendarId);
        working = working.map((e) => (e.id === item.event.id ? { ...e, ...updated } : e));
      }
    } catch (err) {
      if (isReconnectError(err)) {
        reconnectRequired = true;
        remaining.push(item);
        continue;
      }
      const attempts = item.attempts + 1;
      if (attempts < 5) remaining.push({ ...item, attempts });
    }
  }

  return { schedule: working, remainingOutbox: remaining, reconnectRequired };
}

export interface SyncRunResult {
  schedule: ScheduleEvent[];
  syncState: GoogleCalendarSyncState;
  remainingOutbox: CalendarOutboxItem[];
}

/**
 * Pushes pending local writes to Google, then pulls remote changes.
 * Never throws for auth/API failures — reports them via `syncState.lastSyncError`.
 */
export async function runSync(
  state: GoogleCalendarSyncState,
  schedule: ScheduleEvent[],
  outbox: CalendarOutboxItem[],
): Promise<SyncRunResult> {
  const base: GoogleCalendarSyncState = { ...state, connected: true };
  const drained = await drainOutbox(base, schedule, outbox);

  if (drained.reconnectRequired) {
    return {
      schedule: drained.schedule,
      remainingOutbox: drained.remainingOutbox,
      syncState: { ...base, lastSyncError: 'reconnect' },
    };
  }

  try {
    const pulled = await pullChanges(base, drained.schedule);
    return {
      schedule: pulled.schedule,
      syncState: pulled.syncState,
      remainingOutbox: drained.remainingOutbox,
    };
  } catch (err) {
    return {
      schedule: drained.schedule,
      remainingOutbox: drained.remainingOutbox,
      syncState: {
        ...base,
        lastSyncError: isReconnectError(err) ? 'reconnect' : (err as Error)?.message || 'sync_failed',
      },
    };
  }
}

