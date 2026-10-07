import React, { useState } from 'react';
import {
  ChevronLeft,
  Sparkles,
  Play,
  Calendar,
  CheckCircle2,
  Circle,
  RotateCcw,
  Trash2,
  Clock,
  Check,
  X,
} from 'lucide-react';
import { Task } from '../../types';
import { getLocalDateKey } from '../../utils/dates';

interface TaskDetailScreenProps {
  task: Task;
  onBack: () => void;
  onStartFocus: (task: Task) => void;
  onAskAI: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  onAddToSchedule: (task: Task, date: string, startTime: string, endTime: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onRegenerateAIPlan: (task: Task) => Promise<void>;
  onDeleteTask: (taskId: string) => void;
}

export const TaskDetailScreen: React.FC<TaskDetailScreenProps> = ({
  task,
  onBack,
  onStartFocus,
  onAskAI,
  onToggleTask,
  onAddToSchedule,
  onToggleSubtask,
  onAddSubtask,
  onRegenerateAIPlan,
  onDeleteTask,
}) => {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(task.scheduledDate || getLocalDateKey());
  const [scheduleStartTime, setScheduleStartTime] = useState(task.scheduledStartTime || '15:00');
  const [scheduleEndTime, setScheduleEndTime] = useState('16:00');

  const completedCount = task.subtasks.filter((s) => s.completed).length;
  const progressPercent = task.completed
    ? 100
    : task.subtasks.length > 0
    ? Math.round((completedCount / task.subtasks.length) * 100)
    : task.progress;
  const taskArea = task.category || (task.courseCode ? 'academic' : 'personal');
  const recurrenceLabel =
    task.recurrence === 'daily'
      ? 'Daily'
      : task.recurrence === 'weekdays'
      ? 'Weekdays'
      : task.recurrence === 'weekly'
      ? 'Weekly'
      : null;

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerateAIPlan(task);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleConfirmDelete = () => {
    setShowDeleteModal(false);
    onDeleteTask(task.id);
    onBack();
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col space-y-3 pb-8 animate-fade-in text-slate-900 dark:text-white font-sans">
      {/* Top Header Bar */}
      <header className="flex items-center justify-between min-h-[38px] pt-1">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 py-1.5 px-2 -ml-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Tasks</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Complete Toggle */}
          <button
            onClick={() => onToggleTask(task.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              task.completed
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <CheckCircle2
              className={`w-3.5 h-3.5 ${
                task.completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
              }`}
            />
            <span>{task.completed ? 'Done' : 'Mark done'}</span>
          </button>

          {/* Delete Icon */}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            title="Delete Task"
            aria-label="Delete Task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 1. ULTRA-COMPACT TASK HEADER CARD */}
      <section className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2.5">
        {/* Compact Metadata Row */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {task.courseCode ? (
            <span
              className="font-extrabold uppercase font-mono tracking-wider"
              style={{ color: task.courseColor }}
            >
              {task.courseCode}
            </span>
          ) : (
            <span className="font-semibold text-slate-400 uppercase tracking-wider">
              {taskArea}
            </span>
          )}
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span
            className={`font-semibold capitalize ${
              task.priority === 'high'
                ? 'text-rose-500'
                : task.priority === 'medium'
                ? 'text-amber-500'
                : 'text-slate-400'
            }`}
          >
            {task.priority} Priority
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span className="font-mono tabular-nums">
            Due {new Date(task.deadline).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })}
          </span>
          {task.estimatedMinutes && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>~{task.estimatedMinutes}m</span>
            </>
          )}
          {recurrenceLabel && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>{recurrenceLabel}</span>
            </>
          )}
        </div>

        {/* Task Title */}
        <h1
          className={`text-base sm:text-lg font-bold tracking-tight leading-snug ${
            task.completed
              ? 'line-through text-slate-400 dark:text-slate-500'
              : 'text-slate-900 dark:text-white'
          }`}
        >
          {task.title}
        </h1>

        {/* Optional Description */}
        {task.description && (
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
            {task.description}
          </p>
        )}

        {/* Study-slot pill — only when a planned time exists (distinct from the due date) */}
        {task.scheduledDate && task.scheduledStartTime && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
            <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
            <span>
              Scheduled: {new Date(`${task.scheduledDate}T12:00:00`).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              })}
              {` at ${task.scheduledStartTime}`}
            </span>
          </div>
        )}

        {/* Slim Progress Meter */}
        <div className="flex items-center gap-2 pt-0.5">
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
            {progressPercent}%
          </span>
        </div>
      </section>

      {/* 2. THREE COMPACT BUTTONS ON ONE SINGLE ROW (Mobile & Desktop) */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onStartFocus(task)}
          className="py-2 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98] transition-all cursor-pointer truncate"
          title="Start 25m focus session"
        >
          <Play className="w-3.5 h-3.5 fill-current shrink-0" />
          <span className="truncate">25m Focus</span>
        </button>

        <button
          onClick={() => onAskAI(task)}
          className="py-2 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer truncate"
          title="Ask AI about this task"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="truncate">Ask AI</span>
        </button>

        <button
          onClick={() => setIsScheduleOpen((open) => !open)}
          className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer truncate ${
            isScheduleOpen
              ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
          title="Schedule task on calendar"
        >
          <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="truncate">{isScheduleOpen ? 'Close' : 'Schedule'}</span>
        </button>
      </div>

      {/* 3. COMPACT INLINE SCHEDULER */}
      {isScheduleOpen && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onAddToSchedule(task, scheduleDate, scheduleStartTime, scheduleEndTime);
            setIsScheduleOpen(false);
          }}
          className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 animate-fade-in shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Schedule Focus Block
            </span>
            <button
              type="button"
              onClick={() => setIsScheduleOpen(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Date</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(event) => setScheduleDate(event.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Start</label>
              <input
                type="time"
                value={scheduleStartTime}
                onChange={(event) => setScheduleStartTime(event.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-0.5">End</label>
              <input
                type="time"
                value={scheduleEndTime}
                onChange={(event) => setScheduleEndTime(event.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all active:scale-[0.99] cursor-pointer"
          >
            Save to Calendar
          </button>
        </form>
      )}

      {/* 4. DENSE ACTION PLAN & SUBTASKS (Less space, high clarity) */}
      <section className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              Action Steps
            </span>
            <span className="text-[11px] font-mono font-semibold text-slate-400">
              ({completedCount}/{task.subtasks.length})
            </span>
          </div>

          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>
        </div>

        {/* AI Rationale (Subtle, compact callout) */}
        {task.aiPlanReason && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 italic leading-snug">
            &ldquo;{task.aiPlanReason}&rdquo;
          </p>
        )}

        {/* Dense Subtasks List */}
        <div className="space-y-1.5">
          {task.subtasks.length === 0 ? (
            <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
              No steps added yet.
            </div>
          ) : (
            task.subtasks.map((sub, index) => (
              <div
                key={sub.id}
                onClick={() => onToggleSubtask(task.id, sub.id)}
                className="group flex items-center justify-between p-2.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {sub.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                  )}
                  <span
                    className={`truncate ${
                      sub.completed
                        ? 'line-through text-slate-400'
                        : 'font-medium text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {index + 1}. {sub.title}
                  </span>
                </div>

                {sub.estimatedMinutes && (
                  <span className="font-mono text-[10px] text-slate-400 shrink-0 ml-2">
                    {sub.estimatedMinutes}m
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Quick Add Step Input in One Row */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <input
            type="text"
            placeholder="Add next step..."
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                onAddSubtask(task.id, newSubtaskTitle.trim());
                setNewSubtaskTitle('');
              }
            }}
            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => {
              if (newSubtaskTitle.trim()) {
                onAddSubtask(task.id, newSubtaskTitle.trim());
                setNewSubtaskTitle('');
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            Add
          </button>
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Delete task
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-xs">
              <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{task.title}</p>
              {task.courseCode && (
                <span
                  className="inline-block mt-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded text-white uppercase font-mono"
                  style={{ backgroundColor: task.courseColor }}
                >
                  {task.courseCode}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Task</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
