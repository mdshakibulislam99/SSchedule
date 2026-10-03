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
} from 'lucide-react';
import { GoogleCalendarSyncState, ScheduleEvent, ScheduleEventType } from '../../types';
import { getLocalDateKey } from '../../utils/dates';
import { SCHEDULE_EVENT_COLORS, SCHEDULE_EVENT_EMOJI } from '../../services/calendarSync';

interface CalendarScreenProps {
  schedule: ScheduleEvent[];
  calendarSync: GoogleCalendarSyncState;
  isSyncing: boolean;
  onOpenWeekPlanner: () => void;
  onAddEvent: (event: Omit<ScheduleEvent, 'id'>) => void;
  onUpdateEvent: (event: ScheduleEvent) => void;
  onDeleteEvent: (id: string) => void;
  onConnectGoogle: () => void;
  onSyncNow: () => void;
  onOpenSyncSettings: () => void;
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

export const CalendarScreen: React.FC<CalendarScreenProps> = ({
  schedule,
  calendarSync,
  isSyncing,
  onOpenWeekPlanner,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onConnectGoogle,
  onSyncNow,
  onOpenSyncSettings,
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

  // Event form state
  const [title, setTitle] = useState('');
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
    setStartTime('10:00');
    setEndTime('11:30');
    setType('study');
    setLocation('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (event: ScheduleEvent) => {
    setEditingEvent(event);
    setTitle(event.title);
    setStartTime(event.startTime);
    setEndTime(event.endTime);
    setType(event.type);
    setLocation(event.location || '');
    setIsAddModalOpen(true);
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (editingEvent) {
      onUpdateEvent({
        ...editingEvent,
        title: title.trim(),
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
        date: selectedDate,
        type,
        location: location.trim() || undefined,
        color: SCHEDULE_EVENT_COLORS[type],
        isCompleted: false,
      });
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
            className="w-8 h-8 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <button
            onClick={openAddModal}
            title="Add block"
            className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all shrink-0"
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

      {/* Selected-day event list */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold px-1">
          <span>{selectedDateLabel}</span>
          <span>
            {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
          </span>
        </div>

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
              className="group p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-3 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all cursor-pointer"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{ backgroundColor: `${event.color}18` }}
              >
                {SCHEDULE_EVENT_EMOJI[event.type] || '📌'}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {event.title}
                  </span>
                  {event.source === 'google' && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                      Google
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                    {event.startTime} – {event.endTime}
                  </span>
                  {event.location && (
                    <>
                      <span>·</span>
                      <span className="truncate">{event.location}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-[11px] font-bold tabular-nums" style={{ color: event.color }}>
                  {durationLabel(event.startTime, event.endTime)}
                </div>
              </div>

              <div className="flex items-center shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModal(event);
                  }}
                  className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                  title="Edit event"
                  aria-label={`Edit ${event.title}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEvent(event.id);
                  }}
                  className="p-2 text-slate-400 hover:text-rose-500 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                  title="Remove event"
                  aria-label={`Delete ${event.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
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

              <div className="text-[11px] text-slate-500 dark:text-slate-400 -mt-2">
                {editingEvent ? 'On ' : 'For '}
                {new Date(`${editingEvent ? editingEvent.date : selectedDate}T12:00:00`).toLocaleDateString([], {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
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
