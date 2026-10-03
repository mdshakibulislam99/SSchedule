import React, { useState } from 'react';
import {
  ChevronLeft,
  Sparkles,
  Play,
  Calendar,
  CheckCircle2,
  Circle,
  Plus,
  RotateCcw,
  FileText,
  Clock,
  Trash2,
} from 'lucide-react';
import { Task, SubTask } from '../../types';
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

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col space-y-4 pb-8 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Bar Navigation */}
      <div className="flex items-center justify-between min-h-[44px]">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors flex items-center gap-1 text-xs font-semibold"
        >
          <ChevronLeft className="w-6 h-6" />
          <span>Tasks</span>
        </button>

        <span className="text-sm font-bold">Task Detail</span>

        <button
          onClick={() => {
            if (window.confirm(`Delete "${task.title}"?`)) {
              onDeleteTask(task.id);
              onBack();
            }
          }}
          className="p-2 text-slate-400 hover:text-rose-500 rounded-full transition-colors"
          title="Delete Task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Task Header Information - Full width & compact height */}
      <div className="w-full p-4 sm:py-3.5 sm:px-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <div
              className="px-2 py-0.5 rounded-md text-white text-[11px] font-extrabold shadow-2xs uppercase"
              style={{ backgroundColor: task.courseColor }}
            >
              {task.courseCode || 'Personal'}
            </div>
            <span className="text-[11px] font-bold uppercase text-rose-500">{task.priority} Priority</span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Due {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          <button
            onClick={() => onToggleTask(task.id)}
            className={`shrink-0 p-1.5 rounded-xl border transition-colors cursor-pointer ${
              task.completed
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-emerald-600 hover:border-emerald-300'
            }`}
            aria-label={task.completed ? 'Mark as active' : 'Mark complete'}
            title={task.completed ? 'Mark as active' : 'Mark complete'}
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>

        <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
          {task.title}
        </h1>

        {task.description && (
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 pt-0.5">
          <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 capitalize">{taskArea}</span>
          <span>{task.type}</span>
          <span>·</span>
          <span>{task.estimatedMinutes} min</span>
          {recurrenceLabel && (
            <>
              <span>·</span>
              <span>{recurrenceLabel}</span>
            </>
          )}
          {task.scheduledDate && (
            <>
              <span>·</span>
              <span>
                Planned {new Date(`${task.scheduledDate}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                {task.scheduledStartTime ? ` at ${task.scheduledStartTime}` : ''}
              </span>
            </>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs text-slate-500 font-semibold">
            <span>Progress</span>
            <span className="font-mono">{progressPercent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Primary Action Buttons (Section 10) */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => onStartFocus(task)}
          className="py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 active:scale-[0.98] transition-all"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Start Working</span>
        </button>

        <button
          onClick={() => onAskAI(task)}
          className="py-3 px-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-indigo-100 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Ask AI</span>
        </button>
      </div>

      {/* AI Plan Section (Section 10) */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-50/70 to-purple-50/40 dark:from-indigo-950/50 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-900/60 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              AI Step-by-Step Plan
            </h3>
          </div>

          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
          >
            <RotateCcw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
            <span>Regenerate</span>
          </button>
        </div>

        {task.aiPlanReason && (
          <p className="text-xs text-indigo-950 dark:text-indigo-200 italic leading-relaxed">
            "{task.aiPlanReason}"
          </p>
        )}

        {/* Subtasks List */}
        <div className="space-y-2">
          {task.subtasks.length === 0 ? (
            <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-dashed border-indigo-200 dark:border-indigo-900 text-xs text-slate-500 dark:text-slate-400">
              No steps yet. Add one below or refresh the AI plan.
            </div>
          ) : task.subtasks.map((sub, index) => (
            <button
              type="button"
              key={sub.id}
              onClick={() => onToggleSubtask(task.id, sub.id)}
              aria-pressed={sub.completed}
              className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs cursor-pointer active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {sub.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span
                  className={`truncate ${
                    sub.completed ? 'line-through text-slate-400' : 'font-medium text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {index + 1}. {sub.title}
                </span>
              </div>

              {sub.estimatedMinutes && (
                <span className="font-mono text-[11px] text-slate-400 shrink-0 ml-2">
                  {sub.estimatedMinutes}m
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Quick Add Subtask Input */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            placeholder="Add a step manually..."
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                onAddSubtask(task.id, newSubtaskTitle.trim());
                setNewSubtaskTitle('');
              }
            }}
            className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => {
              if (newSubtaskTitle.trim()) {
                onAddSubtask(task.id, newSubtaskTitle.trim());
                setNewSubtaskTitle('');
              }
            }}
            className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shrink-0"
          >
            Add
          </button>
        </div>

        {/* Schedule button */}
        <button
          onClick={() => setIsScheduleOpen((open) => !open)}
          className="w-full py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
          <span>{isScheduleOpen ? 'Hide scheduler' : 'Schedule this task'}</span>
        </button>

        {isScheduleOpen && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onAddToSchedule(task, scheduleDate, scheduleStartTime, scheduleEndTime);
              setIsScheduleOpen(false);
            }}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3"
          >
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Choose a calendar slot</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                This adds a focused work block. Your deadline and reminder stay unchanged.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3">
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(event) => setScheduleDate(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Starts</label>
                <input
                  type="time"
                  value={scheduleStartTime}
                  onChange={(event) => setScheduleStartTime(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Ends</label>
                <input
                  type="time"
                  value={scheduleEndTime}
                  onChange={(event) => setScheduleEndTime(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
            >
              Add to calendar
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
