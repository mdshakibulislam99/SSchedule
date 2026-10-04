import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Clock,
  Trash2,
  X,
  RefreshCw,
  Settings2,
  CalendarClock,
  AlertTriangle,
  Pencil,
  Send,
  Check,
  Bot,
  Zap,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { GoogleCalendarSyncState, ScheduleEvent, ScheduleEventType, Task, AIProviderConfig, AIActionProposal } from '../../types';
import { getLocalDateKey, parseNaturalDate, parseNaturalTime } from '../../utils/dates';
import { SCHEDULE_EVENT_COLORS, SCHEDULE_EVENT_EMOJI } from '../../services/calendarSync';
import { AIOrchestrator } from '../../services/aiOrchestrator';
import { INITIAL_AI_CONFIG } from '../../utils/storage';

interface CalendarScreenProps {
  schedule: ScheduleEvent[];
  tasks?: Task[];
  aiConfig?: AIProviderConfig;
  calendarSync: GoogleCalendarSyncState;
  isSyncing: boolean;
  onOpenWeekPlanner: () => void;
  onAddEvent: (event: Omit<ScheduleEvent, 'id'>) => void;
  onUpdateEvent: (event: ScheduleEvent) => void;
  onDeleteEvent: (id: string) => void;
  onExecuteAction?: (action: AIActionProposal) => void;
  onConnectGoogle: () => void;
  onSyncNow: () => void;
  onOpenSyncSettings: () => void;
  onOpenAIChat?: (prompt?: string) => void;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const BLOCK_TYPES: { id: ScheduleEventType; label: string }[] = [
  { id: 'study', label: 'Study Session' },
  { id: 'class', label: 'Lecture / Class' },
  { id: 'break', label: 'Meal / Break' },
  { id: 'gym', label: 'Gym / Exercise' },
  { id: 'exam', label: 'Exam' },
  { id: 'project', label: 'Project Work' },
];

function durationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h}h` : null, m ? `${m}m` : null].filter(Boolean).join(' ') || '0m';
}

function exportScheduleToICS(events: ScheduleEvent[]) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const timeStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChronoPulse AI//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ChronoPulse Schedule',
  ];

  events.forEach((ev) => {
    const dStr = (ev.date || getLocalDateKey()).replace(/-/g, '');
    const sStr = (ev.startTime || '09:00').replace(/:/g, '') + '00';
    const eStr = (ev.endTime || '10:00').replace(/:/g, '') + '00';

    icsLines.push('BEGIN:VEVENT');
    icsLines.push(`UID:${ev.id}@chronopulse.ai`);
    icsLines.push(`DTSTAMP:${timeStamp}`);
    icsLines.push(`DTSTART:${dStr}T${sStr}`);
    icsLines.push(`DTEND:${dStr}T${eStr}`);
    icsLines.push(`SUMMARY:${ev.title.replace(/[,;\\]/g, ' ')}`);
    if (ev.location) {
      icsLines.push(`LOCATION:${ev.location.replace(/[,;\\]/g, ' ')}`);
    }
    icsLines.push(`DESCRIPTION:${(ev.type || 'Study').toUpperCase()} Block`);
    icsLines.push('STATUS:CONFIRMED');
    icsLines.push('END:VEVENT');
  });

  icsLines.push('END:VCALENDAR');

  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `chronopulse_schedule_${getLocalDateKey()}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const CalendarScreen: React.FC<CalendarScreenProps> = ({
  schedule,
  tasks = [],
  aiConfig,
  calendarSync,
  isSyncing,
  onOpenWeekPlanner,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onExecuteAction,
  onConnectGoogle,
  onSyncNow,
  onOpenSyncSettings,
  onOpenAIChat,
}) => {
  const todayKey = getLocalDateKey();
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);

  // Quick AI Assistant in Calendar
  const [aiInput, setAiInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [proposedAction, setProposedAction] = useState<AIActionProposal | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const handleAskAIInCalendar = async (queryText?: string) => {
    const textToSend = (queryText || aiInput).trim();
    if (!textToSend || isAiProcessing) return;

    setIsAiProcessing(true);
    setProposedAction(null);
    setAiFeedback(null);

    try {
      const configToUse = aiConfig || INITIAL_AI_CONFIG;

      const res = await AIOrchestrator.chatWithContext(
        textToSend,
        [],
        { schedule, tasks },
        configToUse
      );

      if (res.actions && res.actions.length > 0) {
        setProposedAction(res.actions[0]);
        setAiFeedback(res.text);
      } else {
        const detectedDate = parseNaturalDate(textToSend);
        const { startTime: pStart, endTime: pEnd } = parseNaturalTime(textToSend);
        const cleanTitle = textToSend
          .replace(/^(add|schedule|plan|move|create)\s+(a\s+)?/i, '')
          .replace(/\s+(tomorrow|today|on|at|from)\s+.*$/i, '')
          .trim() || 'Focus Session';

        const fallbackAction: AIActionProposal = {
          id: `act-${Date.now()}`,
          type: 'add_schedule',
          title: cleanTitle,
          description: `${detectedDate} · ${pStart}–${pEnd}`,
          details: {
            title: cleanTitle,
            date: detectedDate,
            startTime: pStart,
            endTime: pEnd,
            type: 'study',
            color: '#6366F1',
          },
          status: 'pending',
        };
        setProposedAction(fallbackAction);
        setAiFeedback(`I prepared "${cleanTitle}" for ${detectedDate} (${pStart}–${pEnd}). Confirm below to apply.`);
      }
      setAiInput('');
    } catch (err) {
      console.warn('AI Calendar Assistant error:', err);
      setAiFeedback('Could not process request. Please try rephrasing.');
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleApplyProposedAction = (action: AIActionProposal) => {
    if (onExecuteAction) {
      onExecuteAction(action);
    } else {
      if (action.type === 'add_schedule') {
        const d = action.details;
        onAddEvent({
          title: d.title || action.title,
          date: d.date || selectedDate,
          startTime: d.startTime || '15:00',
          endTime: d.endTime || '16:30',
          type: d.type || 'study',
          color: d.color || '#6366F1',
          isCompleted: false,
        });
      }
    }

    const targetDate = action.details?.date;
    if (targetDate && targetDate !== selectedDate) {
      setSelectedDate(targetDate);
      const d = new Date(`${targetDate}T12:00:00`);
      if (d.getMonth() !== month || d.getFullYear() !== year) {
        const first = new Date(d);
        first.setDate(1);
        first.setHours(12, 0, 0, 0);
        setViewMonth(first);
      }
    }

    setProposedAction(null);
    setAiFeedback(`Applied "${action.title}" to calendar!`);
    setTimeout(() => setAiFeedback(null), 3500);
  };

  const handleNudgeEventTime = (event: ScheduleEvent, deltaMinutes: number) => {
    const [sh, sm] = event.startTime.split(':').map(Number);
    const [eh, em] = event.endTime.split(':').map(Number);
    let newStartM = sh * 60 + sm + deltaMinutes;
    let newEndM = eh * 60 + em + deltaMinutes;

    if (newStartM < 0) newStartM = 0;
    if (newEndM > 24 * 60 - 1) newEndM = 24 * 60 - 1;

    const startHStr = String(Math.floor(newStartM / 60)).padStart(2, '0');
    const startMStr = String(newStartM % 60).padStart(2, '0');
    const endHStr = String(Math.floor(newEndM / 60)).padStart(2, '0');
    const endMStr = String(newEndM % 60).padStart(2, '0');

    onUpdateEvent({
      ...event,
      startTime: `${startHStr}:${startMStr}`,
      endTime: `${endHStr}:${endMStr}`,
    });
  };

  const handleMoveToTomorrow = (event: ScheduleEvent) => {
    const curr = new Date(`${event.date}T12:00:00`);
    curr.setDate(curr.getDate() + 1);
    const nextDate = getLocalDateKey(curr);
    onUpdateEvent({
      ...event,
      date: nextDate,
    });
  };

  const handleSuggestOptimalSlot = () => {
    const dayEvents = schedule
      .filter((e) => e.date === selectedDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const candidateSlots = [
      { start: '10:00', end: '11:30' },
      { start: '14:00', end: '15:30' },
      { start: '16:00', end: '17:30' },
      { start: '19:00', end: '20:30' },
      { start: '09:00', end: '10:30' },
      { start: '11:30', end: '13:00' },
      { start: '15:30', end: '17:00' },
    ];

    for (const slot of candidateSlots) {
      const hasOverlap = dayEvents.some((e) => {
        return (
          (slot.start >= e.startTime && slot.start < e.endTime) ||
          (slot.end > e.startTime && slot.end <= e.endTime) ||
          (slot.start <= e.startTime && slot.end >= e.endTime)
        );
      });
      if (!hasOverlap) {
        setStartTime(slot.start);
        setEndTime(slot.end);
        return;
      }
    }
    setStartTime('15:00');
    setEndTime('16:30');
  };

  // Event form state
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:30');
  const [type, setType] = useState<ScheduleEventType>('study');
  const [location, setLocation] = useState('');

  const eventsByDate = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    for (const event of schedule) {
      (map[event.date] ||= []).push(event);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [schedule]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthLabel = viewMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first
    const gridStart = new Date(year, month, 1 - startOffset);
    gridStart.setHours(12, 0, 0, 0);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      const key = getLocalDateKey(date);
      return {
        key,
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: key === todayKey,
      };
    });
  }, [year, month, todayKey]);

  const weekDays = useMemo(() => {
    const base = new Date(`${selectedDate}T12:00:00`);
    const offset = (base.getDay() + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - offset);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const key = getLocalDateKey(date);
      return {
        key,
        dayName: date.toLocaleDateString([], { weekday: 'short' }),
        day: date.getDate(),
        isToday: key === todayKey,
      };
    });
  }, [selectedDate, todayKey]);

  const dayEvents = eventsByDate[selectedDate] || [];

  const conflictingEventIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < dayEvents.length; i++) {
      for (let j = i + 1; j < dayEvents.length; j++) {
        const e1 = dayEvents[i];
        const e2 = dayEvents[j];
        if (e1.startTime < e2.endTime && e1.endTime > e2.startTime) {
          ids.add(e1.id);
          ids.add(e2.id);
        }
      }
    }
    return ids;
  }, [dayEvents]);
  const monthEventCount = useMemo(
    () =>
      schedule.filter((e) => {
        const d = new Date(`${e.date}T12:00:00`);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length,
    [schedule, year, month],
  );

  const selectedDateLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const shiftMonth = (delta: number) => {
    setViewMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + delta);
      return next;
    });
  };

  const goToToday = () => {
    const now = new Date();
    setSelectedDate(getLocalDateKey(now));
    const first = new Date(now);
    first.setDate(1);
    first.setHours(12, 0, 0, 0);
    setViewMonth(first);
  };

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const showTodayButton = selectedDate !== todayKey || !isCurrentMonth;
  const needReconnect = calendarSync.connected && calendarSync.lastSyncError === 'reconnect';

  const shiftWeek = (delta: number) => {
    const base = new Date(`${selectedDate}T12:00:00`);
    base.setDate(base.getDate() + delta * 7);
    setSelectedDate(getLocalDateKey(base));
    const first = new Date(base);
    first.setDate(1);
    first.setHours(12, 0, 0, 0);
    setViewMonth(first);
  };

  const navigate = (delta: number) => {
    if (viewMode === 'month') shiftMonth(delta);
    else shiftWeek(delta);
  };

  const shortDate = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const navLabel =
    viewMode === 'month' || weekDays.length < 7
      ? monthLabel
      : `${shortDate(weekDays[0].key)} – ${shortDate(weekDays[6].key)}`;

  const openAddModal = () => {
    setEditingEvent(null);
    setTitle('');
    setEventDate(selectedDate);
    setStartTime('10:00');
    setEndTime('11:30');
    setType('study');
    setLocation('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (event: ScheduleEvent) => {
    setEditingEvent(event);
    setTitle(event.title);
    setEventDate(event.date);
    setStartTime(event.startTime);
    setEndTime(event.endTime);
    setType(event.type);
    setLocation(event.location || '');
    setIsAddModalOpen(true);
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const targetDate = eventDate || selectedDate;
    if (editingEvent) {
      onUpdateEvent({
        ...editingEvent,
        title: title.trim(),
        date: targetDate,
        startTime,
        endTime,
        type,
        location: location.trim() || undefined,
        color: SCHEDULE_EVENT_COLORS[type],
      });
    } else {
      onAddEvent({
        title: title.trim(),
        startTime,
        endTime,
        date: targetDate,
        type,
        location: location.trim() || undefined,
        color: SCHEDULE_EVENT_COLORS[type],
        isCompleted: false,
      });
    }

    if (targetDate !== selectedDate) {
      setSelectedDate(targetDate);
      const d = new Date(`${targetDate}T12:00:00`);
      if (d.getMonth() !== month || d.getFullYear() !== year) {
        const first = new Date(d);
        first.setDate(1);
        first.setHours(12, 0, 0, 0);
        setViewMonth(first);
      }
    }

    setIsAddModalOpen(false);
    setEditingEvent(null);
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col space-y-4 pb-6 animate-fade-in text-slate-900 dark:text-white">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight">Calendar</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {monthEventCount} {monthEventCount === 1 ? 'event' : 'events'} in {monthLabel}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {calendarSync.connected ? (
            <button
              onClick={needReconnect ? onOpenSyncSettings : onSyncNow}
              disabled={isSyncing}
              title={needReconnect ? 'Reconnect Google Calendar' : 'Sync with Google Calendar'}
              className={`h-8 px-2.5 rounded-full border text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-60 ${
                needReconnect
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60'
              }`}
            >
              {needReconnect ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              )}
              <span className="hidden sm:inline">
                {needReconnect ? 'Reconnect' : isSyncing ? 'Syncing' : 'Synced'}
              </span>
            </button>
          ) : (
            <button
              onClick={onConnectGoogle}
              title="Connect Google Calendar"
              className="h-8 px-3 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Sync</span>
            </button>
          )}

          <button
            onClick={onOpenSyncSettings}
            title="Google Calendar settings"
            className="w-8 h-8 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => exportScheduleToICS(schedule)}
            title="Export Schedule as .ics file (Apple, Outlook, Google Calendar)"
            className="w-8 h-8 rounded-full text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Export schedule as ics file"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={openAddModal}
            title="Add block"
            className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Month / Week navigator */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            aria-label={viewMode === 'month' ? 'Previous month' : 'Previous week'}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToToday}
            className="text-base font-extrabold tracking-tight px-1.5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            title="Jump to today"
          >
            {navLabel}
          </button>
          <button
            onClick={() => navigate(1)}
            className="w-8 h-8 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            aria-label={viewMode === 'month' ? 'Next month' : 'Next week'}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {showTodayButton && (
            <button
              onClick={goToToday}
              className="h-7 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 text-[11px] font-bold active:scale-95 transition-all"
            >
              Today
            </button>
          )}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold">
            {(['month', 'week'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
              className={`px-3 py-1 rounded-lg capitalize transition-all ${
                viewMode === mode
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Month grid */}
      {viewMode === 'month' ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-2.5">
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-400"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {monthCells.map((cell) => {
              const isSelected = cell.key === selectedDate;
              const cellEvents = eventsByDate[cell.key] || [];
              return (
                <button
                  key={cell.key}
                  onClick={() => {
                    setSelectedDate(cell.key);
                    const d = new Date(`${cell.key}T12:00:00`);
                    if (d.getMonth() !== month || d.getFullYear() !== year) {
                      const first = new Date(d);
                      first.setDate(1);
                      first.setHours(12, 0, 0, 0);
                      setViewMonth(first);
                    }
                  }}
                  className="relative h-11 flex flex-col items-center justify-center rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <span
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-600/30'
                        : cell.isToday
                        ? 'text-indigo-600 dark:text-indigo-400 font-extrabold ring-1 ring-indigo-300 dark:ring-indigo-800'
                        : cell.inMonth
                        ? 'text-slate-700 dark:text-slate-200 font-medium'
                        : 'text-slate-300 dark:text-slate-600'
                    }`}
                  >
                    {cell.day}
                  </span>
                  <span className="flex items-center gap-0.5 h-1 mt-0.5">
                    {cell.inMonth &&
                      cellEvents.slice(0, 3).map((ev) => (
                        <span
                          key={ev.id}
                          className="w-1 h-1 rounded-full"
                          style={{ backgroundColor: ev.color }}
                        />
                      ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Week strip */
        <div className="flex items-center justify-between p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          {weekDays.map((item) => {
            const isSelected = selectedDate === item.key;
            const hasEvents = (eventsByDate[item.key] || []).length > 0;
            return (
              <button
                key={item.key}
                onClick={() => setSelectedDate(item.key)}
                className={`flex flex-col items-center justify-center py-2 px-2.5 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="text-[10px] font-semibold">{item.dayName}</span>
                <span className="text-sm font-bold mt-0.5 tabular-nums">{item.day}</span>
                <span
                  className={`w-1 h-1 rounded-full mt-1 ${
                    hasEvents ? (isSelected ? 'bg-white' : 'bg-indigo-500') : 'bg-transparent'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* AI Schedule & Task Assistant Bar */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-indigo-50/90 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 dark:text-indigo-200 min-w-0">
            <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">AI Schedule & Task Assistant</span>
          </div>
          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full border border-indigo-200/60 dark:border-indigo-800 shrink-0 whitespace-nowrap">
            Chat to Add & Reschedule
          </span>
        </div>

        {/* Input row */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskAIInCalendar();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="e.g. 'Add Math homework tomorrow at 3pm' or 'Move Friday lecture to 4pm'..."
              className="w-full pl-3 pr-8 py-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-indigo-800/80 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            {aiInput && (
              <button
                type="button"
                onClick={() => setAiInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!aiInput.trim() || isAiProcessing}
            className="py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 shrink-0"
          >
            {isAiProcessing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Ask AI</span>
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => handleAskAIInCalendar('Schedule a 2 hour study session tomorrow at 3pm')}
            className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium hover:border-indigo-300 transition-colors shrink-0 whitespace-nowrap"
          >
            ⚡ 2h Study Tomorrow 3pm
          </button>
          <button
            type="button"
            onClick={() => handleAskAIInCalendar('Add 30 min focus review today at 4pm')}
            className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium hover:border-indigo-300 transition-colors shrink-0 whitespace-nowrap"
          >
            🎯 30m Review Today 4pm
          </button>
          <button
            type="button"
            onClick={() => handleAskAIInCalendar('Add task finish CS101 assignment due Friday at 11:59pm')}
            className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium hover:border-indigo-300 transition-colors shrink-0 whitespace-nowrap"
          >
            📋 Add Task due Friday
          </button>
        </div>

        {/* Action Proposal Response Card inside Calendar */}
        {proposedAction && (
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 shadow-sm space-y-2 animate-fade-in mt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                {proposedAction.type === 'create_task'
                  ? 'Proposed Task'
                  : proposedAction.type === 'edit_schedule'
                  ? 'Proposed Reschedule'
                  : 'Proposed Calendar Block'}
              </span>
              <button
                type="button"
                onClick={() => setProposedAction(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {proposedAction.title}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {proposedAction.description}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleApplyProposedAction(proposedAction)}
                className="py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Confirm & Apply</span>
              </button>
              <button
                type="button"
                onClick={() => setProposedAction(null)}
                className="py-1.5 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Feedback message */}
        {aiFeedback && !proposedAction && (
          <div className="text-xs text-indigo-700 dark:text-indigo-300 font-medium px-1 animate-fade-in">
            {aiFeedback}
          </div>
        )}
      </div>

      {/* Selected-day event list */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold px-1">
          <span>{selectedDateLabel}</span>
          <span>
            {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        {/* Schedule Conflict Warning */}
        {conflictingEventIds.size > 0 && (
          <div className="p-2.5 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2 animate-fade-in">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="leading-tight">
              <strong>Schedule overlap:</strong> {conflictingEventIds.size} events on this day overlap. Use quick adjust (-30m / +30m) to resolve.
            </span>
          </div>
        )}

        {dayEvents.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 text-center">
            <Clock className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Nothing scheduled for this day.
            </p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                type="button"
                onClick={openAddModal}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
              >
                Add Block
              </button>
              <button
                type="button"
                onClick={onOpenWeekPlanner}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Plan with AI
              </button>
            </div>
          </div>
        ) : (
          dayEvents.map((event) => (
            <div
              key={event.id}
              role="button"
              tabIndex={0}
              onClick={() => openEditModal(event)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openEditModal(event);
                }
              }}
              className="group p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-800 transition-all cursor-pointer"
            >
              {/* Top Row: Icon + Event Details + Edit/Delete */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 mt-0.5"
                    style={{ backgroundColor: `${event.color}18` }}
                  >
                    {SCHEDULE_EVENT_EMOJI[event.type] || '📌'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {event.title}
                      </span>
                      {event.source === 'google' && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                          Google
                        </span>
                      )}
                      {conflictingEventIds.has(event.id) && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.5 rounded shrink-0">
                          ⚠️ Overlap
                        </span>
                      )}
                    </div>

                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <div className="flex items-center gap-1 shrink-0 font-medium tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {event.startTime} – {event.endTime}
                        </span>
                      </div>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums shrink-0"
                        style={{ backgroundColor: `${event.color}18`, color: event.color }}
                      >
                        {durationLabel(event.startTime, event.endTime)}
                      </span>
                      {event.location && (
                        <span className="truncate text-slate-400 text-[11px] max-w-[140px] sm:max-w-xs">
                          📍 {event.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Edit & Delete Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(event);
                    }}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Edit event"
                    aria-label={`Edit ${event.title}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEvent(event.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Remove event"
                    aria-label={`Delete ${event.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Bottom Quick-Adjust Strip */}
              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-slate-400 shrink-0">
                  Quick reschedule:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNudgeEventTime(event, -30);
                    }}
                    className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Move 30 minutes earlier"
                  >
                    -30m
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNudgeEventTime(event, 30);
                    }}
                    className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Move 30 minutes later"
                  >
                    +30m
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveToTomorrow(event);
                    }}
                    className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Move to tomorrow"
                  >
                    <Zap className="w-2.5 h-2.5" />
                    <span>+1d</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Event Modal Sheet */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in pb-16">
          <div
            className="relative z-[61] w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-slide-up max-h-[calc(100dvh-4rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingEvent ? 'Edit Block' : 'Schedule Block'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-4 py-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS101 Algorithm Review"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Time Slot
                </span>
                <button
                  type="button"
                  onClick={handleSuggestOptimalSlot}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>AI Suggest Open Slot</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Block Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ScheduleEventType)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500 capitalize"
                >
                  {BLOCK_TYPES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Location (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Green Library, Zoom link..."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
              >
                {editingEvent ? 'Save Changes' : 'Add to Calendar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
