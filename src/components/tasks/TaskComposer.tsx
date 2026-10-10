import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, X } from 'lucide-react';
import { Task, PriorityLevel, TaskType, TaskCategory, TaskRecurrence } from '../../types';
import { getLocalDateKey } from '../../utils/dates';
import { TimePickerSheet, formatTime12h } from '../common/TimePickerSheet';

interface TaskComposerProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Task>, autoPlan: boolean) => void;
  /** Pre-links the task to a course (used when opened from a course workspace). */
  initialCourseCode?: string;
  /** Real colour of that course, so the created task gets the correct chip colour. */
  initialCourseColor?: string;
  heading?: string;
  subheading?: string;
  cancelLabel?: string;
  /** Reports open/closed state so parents can hide floating action buttons. */
  onOpenChange?: (open: boolean) => void;
}

const FALLBACK_COURSE_COLORS: Record<string, string> = {
  CS101: '#EF4444',
  Math: '#F59E0B',
  Project: '#10B981',
  Other: '#6366F1',
};

const getDefaultDeadline = () => getLocalDateKey(new Date());

const REPEAT_OPTIONS: { value: TaskRecurrence; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Every week' },
];

const REMINDER_OPTIONS = [
  { value: 'none', label: 'At the scheduled time' },
  { value: '10', label: '10 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
];

const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'exam', label: 'Exam' },
  { value: 'project', label: 'Project' },
  { value: 'reading', label: 'Reading' },
  { value: 'habit', label: 'Habit' },
  { value: 'other', label: 'Other' },
];

const AREA_OPTIONS: { value: 'auto' | TaskCategory; label: string }[] = [
  { value: 'auto', label: 'Auto — from course, else Personal' },
  { value: 'academic', label: 'Academic' },
  { value: 'personal', label: 'Personal' },
  { value: 'health', label: 'Health' },
  { value: 'work', label: 'Work' },
  { value: 'admin', label: 'Admin' },
  { value: 'other', label: 'Other' },
];

/**
 * The single, shared full-page task composer.
 * Used by the Tasks screen and from inside a course workspace, so the Tasks
 * system stays exactly as it is while courses gain a fast, in-context way
 * to add work.
 *
 * Layout: Title + Description, then the Google-Tasks-style schedule controls
 * (Date, Time, Repeat, Reminder). Everything else lives under "More options".
 */
export const TaskComposer: React.FC<TaskComposerProps> = ({
  open,
  onClose,
  onSubmit,
  initialCourseCode,
  initialCourseColor,
  heading = 'Create a task',
  subheading = 'Task workspace',
  cancelLabel = 'Cancel',
  onOpenChange,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Schedule — the four first-class controls, Google Tasks style.
  const [date, setDate] = useState(getDefaultDeadline());
  const [time, setTime] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [reminderValue, setReminderValue] = useState('none');
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);

  // Secondary options, collapsed by default.
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [courseCode, setCourseCode] = useState(initialCourseCode || '');
  const [category, setCategory] = useState<'auto' | TaskCategory>('auto');
  const [taskType, setTaskType] = useState<TaskType>('assignment');
  const [showMore, setShowMore] = useState(false);

  // Fresh defaults every time the composer opens, so a new add is always fast.
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setDate(getDefaultDeadline());
    setTime('');
    setRecurrence('none');
    setReminderValue('none');
    setIsTimePickerOpen(false);
    setPriority('medium');
    setCourseCode(initialCourseCode || '');
    setCategory('auto');
    setTaskType('assignment');
    setShowMore(false);
  }, [open, initialCourseCode]);

  useEffect(() => {
    onOpenChange?.(open);
    return () => {
      onOpenChange?.(false);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const dateKey = date || getDefaultDeadline();
    const reminderEnabled = reminderValue !== 'none';

    onSubmit(
      {
        title: title.trim(),
        description: description.trim(),
        courseCode: courseCode.trim() || undefined,
        courseColor:
          initialCourseColor ||
          FALLBACK_COURSE_COLORS[courseCode.trim()] ||
          '#64748B',
        category: category === 'auto' ? undefined : category,
        type: taskType,
        // Time is optional: with one, the task is due at that moment; without,
        // it is due at end of day.
        deadline: new Date(`${dateKey}T${time ? `${time}:00` : '23:59:59'}`).toISOString(),
        scheduledDate: dateKey,
        scheduledStartTime: time || undefined,
        recurrence,
        reminder: {
          enabled: reminderEnabled,
          minutesBefore: reminderEnabled ? Number(reminderValue) : 30,
        },
        estimatedMinutes: 45,
        priority,
        progress: 0,
        completed: false,
        subtasks: [],
      },
      true
    );

    setTitle('');
    setDescription('');
    onClose();
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-indigo-500';
  const fieldClass =
    'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500';
  const labelClass = 'block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-50 dark:bg-slate-950 animate-fade-in pt-safe">
      {/* Sticky header: Cancel on the left, Create always reachable on the right */}
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 p-2 -ml-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
          <span className="hidden sm:inline">{cancelLabel}</span>
        </button>
        <div className="text-center leading-tight">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{subheading}</p>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">{heading}</h2>
        </div>
        <button
          type="submit"
          form="task-composer-form"
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-sm active:scale-95 transition-all"
        >
          Save
        </button>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <form
          id="task-composer-form"
          onSubmit={handleSaveTask}
          className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-5"
        >
          {/* Course context banner — only when opened from inside a course */}
          {initialCourseCode && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: initialCourseColor || '#64748B' }}
              />
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  {initialCourseCode}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  This task will be linked to your course automatically.
                </p>
              </div>
            </div>
          )}

          {/* What */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <div>
              <label className={labelClass}>Task title *</label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. CS101 Assignment 2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Press <span className="font-bold text-slate-500 dark:text-slate-400">Enter</span> to save
                instantly — everything below is optional.
              </p>
            </div>

            <div>
              <label className={labelClass}>Description (optional)</label>
              <input
                type="text"
                placeholder="Write a short description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Schedule — the Google-Tasks-style controls */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">Schedule</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`${fieldClass} font-mono`}
                />
              </div>

              <div>
                <label className={labelClass}>Time (optional)</label>
                <button
                  type="button"
                  onClick={() => setIsTimePickerOpen(true)}
                  className={`${fieldClass} flex items-center justify-between gap-2 text-left transition-colors hover:border-indigo-300 dark:hover:border-indigo-800 ${
                    time ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <span className="font-mono tabular-nums">
                    {time ? formatTime12h(time) : 'Set time'}
                  </span>
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Repeat</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
                className={fieldClass}
              >
                {REPEAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Reminder</label>
              <select
                value={reminderValue}
                onChange={(e) => setReminderValue(e.target.value)}
                className={fieldClass}
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {reminderValue === 'none'
                  ? time
                    ? `You'll be notified on your device at ${formatTime12h(time)}.`
                    : 'Set a time to get a device alert when the task starts.'
                  : `You'll be notified ${REMINDER_OPTIONS.find((o) => o.value === reminderValue)?.label.toLowerCase()}${
                      recurrence !== 'none' ? ', for every repeat' : ''
                    }.`}
              </p>
            </div>
          </div>

          {/* More options — collapsed by default to keep the form calm */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMore((prev) => !prev)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                More options
                <span className="block text-[11px] font-normal text-slate-400 mt-0.5">
                  Priority, course, area, and task type.
                </span>
              </span>
              {showMore ? (
                <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              )}
            </button>

            {showMore && (
              <div className="px-5 pb-5 space-y-4 animate-fade-in">
                <div>
                  <label className={labelClass}>Priority</label>
                  <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                    {(['high', 'medium', 'low'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`py-2.5 rounded-xl border capitalize transition-all ${
                          priority === p
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {!initialCourseCode && (
                  <div>
                    <label className={labelClass}>Course code (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. CS101"
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      className={`${fieldClass} uppercase`}
                    />
                  </div>
                )}

                <div>
                  <label className={labelClass}>Area</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as 'auto' | TaskCategory)}
                    className={fieldClass}
                  >
                    {AREA_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Task type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as TaskType)}
                    className={fieldClass}
                  >
                    {TASK_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
          >
            Save Task
          </button>
        </form>
      </div>

      {/* Modern time picker bottom sheet — outside the form so its buttons never submit */}
      <TimePickerSheet
        open={isTimePickerOpen}
        value={time}
        onSelect={setTime}
        onClose={() => setIsTimePickerOpen(false)}
      />
    </div>
  );
};

export default TaskComposer;
