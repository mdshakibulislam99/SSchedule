import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Task, PriorityLevel, TaskType, TaskCategory, TaskRecurrence } from '../../types';
import { getLocalDateKey } from '../../utils/dates';

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

/**
 * The single, shared full-page task composer.
 * Used by the Tasks screen and from inside a course workspace, so the Tasks
 * system stays exactly as it is while courses gain a fast, in-context way
 * to add work.
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
  // Form state (identical to the original Tasks composer)
  const [category, setCategory] = useState<TaskCategory>('academic');
  const [taskType, setTaskType] = useState<TaskType>('assignment');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(getDefaultDeadline());
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledStartTime, setScheduledStartTime] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState('30');
  const [priority, setPriority] = useState<PriorityLevel>('high');
  const [courseCode, setCourseCode] = useState(initialCourseCode || '');
  const [addToPlan, setAddToPlan] = useState(true);

  // Fresh defaults every time the composer opens, so a new add is always fast.
  useEffect(() => {
    if (!open) return;
    setCategory('academic');
    setTaskType('assignment');
    setTitle('');
    setDescription('');
    setDeadline(getDefaultDeadline());
    setScheduledDate('');
    setScheduledStartTime('');
    setRecurrence('none');
    setReminderEnabled(false);
    setReminderMinutes('30');
    setPriority('high');
    setCourseCode(initialCourseCode || '');
    setAddToPlan(true);
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

    onSubmit(
      {
        title: title.trim(),
        description: description.trim(),
        courseCode: courseCode.trim() || undefined,
        courseColor:
          initialCourseColor ||
          FALLBACK_COURSE_COLORS[courseCode.trim()] ||
          '#64748B',
        category,
        type: taskType,
        deadline: new Date(`${deadline}T23:59:59`).toISOString(),
        scheduledDate: scheduledDate || undefined,
        scheduledStartTime: scheduledStartTime || undefined,
        recurrence,
        reminder: {
          enabled: reminderEnabled,
          minutesBefore: Number(reminderMinutes) || 30,
        },
        estimatedMinutes: 45,
        priority,
        progress: 0,
        completed: false,
        subtasks: [],
      },
      addToPlan
    );

    setTitle('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-50 dark:bg-slate-950 animate-fade-in">
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
          className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-16 space-y-5"
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

          {/* Essentials — the fast path: type a title, hit Enter */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                Task title *
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. CS101 Assignment 2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Press <span className="font-bold text-slate-500 dark:text-slate-400">Enter</span> to save
                instantly — everything below is optional.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                Description (optional)
              </label>
              <input
                type="text"
                placeholder="Write a short description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Details */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">Details</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Area</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TaskCategory)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="academic">Academic</option>
                  <option value="personal">Personal</option>
                  <option value="health">Health</option>
                  <option value="admin">Admin</option>
                  <option value="work">Work</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Task type</label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="assignment">Assignment</option>
                  <option value="exam">Exam</option>
                  <option value="project">Project</option>
                  <option value="reading">Reading</option>
                  <option value="habit">Habit</option>
                  <option value="personal">Personal task</option>
                  <option value="admin">Admin task</option>
                  <option value="health">Health task</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Course code {initialCourseCode ? '' : '(optional)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. CS101"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold uppercase focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Task schedule */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <div>
              <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">Task schedule</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Set the deadline, planned time, repeats, and reminders.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Study date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Planned time
                </label>
                <input
                  type="time"
                  value={scheduledStartTime}
                  onChange={(e) => setScheduledStartTime(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Repeat pattern</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Every weekday</option>
                <option value="weekly">Every week</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <span>Remind me before the planned time</span>
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(e) => setReminderEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
                />
              </label>

              {reminderEnabled && (
                <select
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="10">10 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="1440">1 day before</option>
                </select>
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Priority</label>
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

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Let StudyAI suggest steps
                </span>
              </div>
              <input
                type="checkbox"
                checked={addToPlan}
                onChange={(e) => setAddToPlan(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
          >
            Save Task
          </button>
        </form>
      </div>
    </div>
  );
};

export default TaskComposer;
