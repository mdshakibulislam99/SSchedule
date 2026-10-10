import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CalendarOutboxItem, GoogleCalendarSyncState, ScheduleEvent } from '../types';
import { StudyStorage } from '../utils/storage';
import {
  clearCachedToken,
  fetchGoogleEmail,
  GCAL_CONNECT_PENDING_KEY,
  requestCalendarToken,
  revokeCalendarToken,
} from '../lib/googleCalendar';
import { runSync } from '../services/calendarSync';

interface UseGoogleCalendarSyncParams {
  schedule: ScheduleEvent[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>;
  calendarSync: GoogleCalendarSyncState;
  setCalendarSync: React.Dispatch<React.SetStateAction<GoogleCalendarSyncState>>;
}

interface GoogleCalendarSyncApi {
  isSyncing: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  queueCreate: (event: ScheduleEvent) => void;
  queueUpdate: (event: ScheduleEvent) => void;
  queueDelete: (event: ScheduleEvent) => void;
}

const PULL_INTERVAL_MS = 120_000;

export function useGoogleCalendarSync({
  schedule,
  setSchedule,
  calendarSync,
  setCalendarSync,
}: UseGoogleCalendarSyncParams): GoogleCalendarSyncApi {
  const [isSyncing, setIsSyncing] = useState(false);
  const scheduleRef = useRef(schedule);
  const stateRef = useRef(calendarSync);
  const outboxRef = useRef<CalendarOutboxItem[]>(StudyStorage.getCalendarOutbox());
  const busyRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    stateRef.current = calendarSync;
  }, [calendarSync]);

  const persistOutbox = useCallback((items: CalendarOutboxItem[]) => {
    outboxRef.current = items;
    StudyStorage.saveCalendarOutbox(items);
  }, []);

  const appendOutbox = useCallback(
    (op: CalendarOutboxItem['op'], event: ScheduleEvent) => {
      const item: CalendarOutboxItem = {
        id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        op,
        event,
        attempts: 0,
      };
      persistOutbox([...outboxRef.current, item]);
    },
    [persistOutbox],
  );

  const queueCreate = useCallback(
    (event: ScheduleEvent) => appendOutbox('create', event),
    [appendOutbox],
  );
  const queueUpdate = useCallback(
    (event: ScheduleEvent) => appendOutbox('update', event),
    [appendOutbox],
  );
  const queueDelete = useCallback(
    (event: ScheduleEvent) => appendOutbox('delete', event),
    [appendOutbox],
  );

  const syncNow = useCallback(async () => {
    if (busyRef.current || !stateRef.current.connected) return;
    busyRef.current = true;
    setIsSyncing(true);
    try {
      const result = await runSync(stateRef.current, scheduleRef.current, outboxRef.current);
      setSchedule(result.schedule);
      persistOutbox(result.remainingOutbox);
      stateRef.current = result.syncState;
      setCalendarSync(result.syncState);
    } finally {
      busyRef.current = false;
      setIsSyncing(false);
    }
  }, [persistOutbox, setSchedule, setCalendarSync]);

  const connect = useCallback(async () => {
    await requestCalendarToken({ silent: false });
    const email = await fetchGoogleEmail();
    const next: GoogleCalendarSyncState = {
      ...stateRef.current,
      connected: true,
      email,
      calendarId: stateRef.current.calendarId || 'primary',
      syncToken: undefined,
      lastSyncError: undefined,
    };
    stateRef.current = next;
    setCalendarSync(next);

    // First connect: mirror every local block that is not yet linked to Google.
    const unlinked = scheduleRef.current.filter(
      (e) => e.source !== 'google' && !e.googleEventId,
    );
    if (unlinked.length > 0) {
      const items: CalendarOutboxItem[] = unlinked.map((e, i) => ({
        id: `out-connect-${Date.now()}-${i}`,
        op: 'create',
        event: e,
        attempts: 0,
      }));
      persistOutbox([...outboxRef.current, ...items]);
    }

    await syncNow();
  }, [persistOutbox, syncNow, setCalendarSync]);

  const disconnect = useCallback(async () => {
    await revokeCalendarToken();
    clearCachedToken();
    persistOutbox([]);
    setSchedule((prev) =>
      prev.map((e) => ({
        ...e,
        source: undefined,
        googleEventId: undefined,
        googleCalendarId: undefined,
        googleEtag: undefined,
        googleUpdatedAt: undefined,
      })),
    );
    const next: GoogleCalendarSyncState = { connected: false, calendarId: 'primary' };
    stateRef.current = next;
    setCalendarSync(next);
  }, [persistOutbox, setSchedule, setCalendarSync]);

  // Native: the calendar connect runs as a full-page Google redirect, which
  // reloads the WebView and kills the original `connect()` call. The flag set
  // before leaving + the token cached by completeGoogleRedirect() let us
  // finish the connection automatically once the app comes back.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!localStorage.getItem(GCAL_CONNECT_PENDING_KEY)) return;

    let cancelled = false;

    const resume = async () => {
      // 1. Wait for completeGoogleRedirect() to cache the token on app load.
      let hasToken = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          await requestCalendarToken({ silent: true });
          hasToken = true;
          break;
        } catch {
          if (cancelled) return;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      localStorage.removeItem(GCAL_CONNECT_PENDING_KEY);
      if (!hasToken || cancelled || stateRef.current.connected) return;

      // 2. Finish what the redirect started.
      try {
        await connect();
      } catch (err) {
        console.warn('Automatic calendar reconnect failed:', err);
      }
    };

    void resume();
    return () => {
      cancelled = true;
    };
  }, [connect]);

  useEffect(() => {
    if (!calendarSync.connected || initializedRef.current) return;

    const initSync = async () => {
      initializedRef.current = true;
      try {
        // Silently restore the token cache without showing a popup.
        await requestCalendarToken({ silent: true });
      } catch {
        // Token not available — user will see reconnect prompt on first sync attempt.
      }
      await syncNow();
    };
    void initSync();
  }, [calendarSync.connected, syncNow]);

  useEffect(() => {
    if (!calendarSync.connected) return;

    const interval = window.setInterval(() => {
      void syncNow();
    }, PULL_INTERVAL_MS);

    const onWake = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [calendarSync.connected, syncNow]);

  return { isSyncing, connect, disconnect, syncNow, queueCreate, queueUpdate, queueDelete };
}
