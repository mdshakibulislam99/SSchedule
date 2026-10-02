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

interface TaskDetailScreenProps {
  task: Task;
  onBack: () => void;
  onStartFocus: (task: Task) => void;
  onAskAI: (task: Task) => void;
  onAddToSchedule: (task: Task) => void;
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
  onAddToSchedule,
  onToggleSubtask,
  onAddSubtask,
  onRegenerateAIPlan,
  onDeleteTask,
}) => {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const completedCount = task.subtasks.filter((s) => s.completed).length;
  const progressPercent =
    task.subtasks.length > 0 ? Math.round((completedCount / task.subtasks.length) * 100) : task.progress;

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerateAIPlan(task);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-5 pb-8 animate-fade-in text-slate-900 dark:text-white">
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
            onDeleteTask(task.id);
            onBack();
          }}
          className="p-2 text-slate-400 hover:text-rose-500 rounded-full transition-colors"
          title="Delete Task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Task Header Information */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center gap-2.5">
          <div
            className="px-2.5 py-1 rounded-lg text-white text-xs font-bold shadow-sm"
            style={{ backgroundColor: task.courseColor }}
          >
            {task.courseCode}
          </div>
          <span className="text-xs font-bold uppercase text-rose-500">{task.priority} Priority</span>
          <span className="text-slate-400">·</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Due {new Date(task.deadline).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {task.title}
        </h1>

        {task.description && (
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {task.description}
          </p>
        )}

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
          {task.subtasks.map((sub, index) => (
            <div
              key={sub.id}
              onClick={() => onToggleSubtask(task.id, sub.id)}
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
            </div>
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
          onClick={() => onAddToSchedule(task)}
          className="w-full py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
          <span>Add Study Sessions to Schedule</span>
        </button>
      </div>
    </div>
  );
};
