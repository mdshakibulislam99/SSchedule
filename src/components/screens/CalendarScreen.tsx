import React, { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Sparkles, Clock, MapPin, Trash2, Edit3, X } from 'lucide-react';
import { ScheduleEvent, ScheduleEventType } from '../../types';
import { getLocalDateKey } from '../../utils/dates';

interface CalendarScreenProps {
  schedule: ScheduleEvent[];
  onOpenWeekPlanner: () => void;
  onAddEvent: (event: Omit<ScheduleEvent, 'id'>) => void;
  onDeleteEvent: (id: string) => void;
}

export const CalendarScreen: React.FC<CalendarScreenProps> = ({
  schedule,
  onOpenWeekPlanner,
  onAddEvent,
  onDeleteEvent,
}) => {
  const today = new Date();
  const todayKey = getLocalDateKey(today);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New event form state
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:30');
  const [type, setType] = useState<ScheduleEventType>('study');
  const [location, setLocation] = useState('');

  const weekStart = new Date(`${todayKey}T12:00:00`);
  const dayOfWeek = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const dateKey = getLocalDateKey(date);
    return {
      dayName: date.toLocaleDateString([], { weekday: 'short' }),
      date: date.getDate(),
      dateKey,
      isToday: dateKey === todayKey,
    };
  });
  const visibleSchedule = schedule.filter((event) => event.date === selectedDate);

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const colors: Record<ScheduleEventType, string> = {
      class: '#EF4444',
      study: '#6366F1',
      break: '#10B981',
      gym: '#10B981',
      exam: '#F59E0B',
      project: '#3B82F6',
    };

    onAddEvent({
      title: title.trim(),
      startTime,
      endTime,
      date: selectedDate,
      type,
      location: location.trim() || undefined,
      color: colors[type] || '#6366F1',
      isCompleted: false,
    });

    setTitle('');
    setIsAddModalOpen(false);
  };

  return (
    <div className="w-full flex flex-col space-y-4 pb-6 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Mobile Bar: Month Header & Plan My Week */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Schedule</span>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* AI Plan My Week button (Section 12) */}
          <button
            onClick={onOpenWeekPlanner}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-bold hover:bg-indigo-100 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Plan Week</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
            title="Add Block"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Week Day Strip (Matching Screen 10 in reference image) */}
      <div className="flex items-center justify-between p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        {days.map((item, idx) => {
          const isSelected = selectedDate === item.dateKey;
          return (
            <button
              key={item.dateKey}
              onClick={() => setSelectedDate(item.dateKey)}
              className={`flex flex-col items-center justify-center py-2 px-2.5 rounded-xl transition-all ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="text-[10px] font-semibold">{item.dayName}</span>
              <span className="text-sm font-bold mt-0.5 font-mono">{item.date}</span>
              {item.isToday && !isSelected && (
                <span className="w-1 h-1 rounded-full bg-indigo-600 mt-1" />
              )}
            </button>
          );
        })}
      </div>

      {/* Timeline Events List (Matching Screen 10) */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
          <span>Timeline View</span>
          <span>{visibleSchedule.length} events scheduled</span>
        </div>

        <div className="space-y-2.5">
          {visibleSchedule.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 text-center">
              <Clock className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                No events or classes scheduled for this day.
              </p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  Add Block
                </button>
                <button
                  type="button"
                  onClick={onOpenWeekPlanner}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Plan with AI
                </button>
              </div>
            </div>
          ) : (
            visibleSchedule.map((event) => (
            <div
              key={event.id}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-2.5 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: event.color }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {event.title}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300">
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
              </div>

              <button
                onClick={() => onDeleteEvent(event.id)}
                className="p-2 text-slate-400 hover:text-rose-500 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                title="Remove event"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            ))
          )}
        </div>
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
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Schedule Study Block</h3>
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
                  <option value="study">Study Session</option>
                  <option value="class">Lecture / Class</option>
                  <option value="break">Meal / Break</option>
                  <option value="gym">Gym / Exercise</option>
                  <option value="exam">Exam</option>
                  <option value="project">Project Work</option>
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
                Add to Calendar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
