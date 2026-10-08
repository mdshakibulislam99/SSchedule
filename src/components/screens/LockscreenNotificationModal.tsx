import React, { useState, useEffect } from 'react';
import { X, Sparkles, ArrowRight, Bell } from 'lucide-react';
import { StudyStorage } from '../../utils/storage';

interface LockscreenNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAppToTask: () => void;
}

export const LockscreenNotificationModal: React.FC<LockscreenNotificationModalProps> = ({
  isOpen,
  onClose,
  onOpenAppToTask,
}) => {
  const [timeStr, setTimeStr] = useState(() => {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  });

  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  });

  useEffect(() => {
    if (!isOpen) return;
    const update = () => {
      const d = new Date();
      setTimeStr(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
      setDateStr(d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }));
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  // Retrieve current active/due tasks to display genuine notification message
  const tasks = StudyStorage.getTasks();
  const topTask = tasks.find((t) => !t.completed) || tasks[0];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-between px-6 pt-safe-6 pb-24 sm:pb-6 bg-gradient-to-b from-blue-500 via-indigo-600 to-purple-800 text-white animate-fade-in select-none">
      {/* Dismiss button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-black/25 text-white/90 hover:text-white transition-colors cursor-pointer"
          aria-label="Close lockscreen preview"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Lockscreen Live Clock */}
      <div className="flex flex-col items-center text-center space-y-1 my-auto">
        <span className="text-7xl sm:text-8xl font-extralight tracking-tight font-mono text-white/95">
          {timeStr}
        </span>
        <span className="text-sm font-semibold tracking-wide text-white/90">
          {dateStr}
        </span>

        {/* Lockscreen Notification Card */}
        <div
          onClick={() => {
            onClose();
            onOpenAppToTask();
          }}
          className="w-full max-w-sm mt-8 p-4 rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl text-slate-900 dark:text-white shadow-2xl border border-white/50 cursor-pointer active:scale-95 transition-all text-left hover:shadow-indigo-500/20"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center text-white">
                <Sparkles className="w-3 h-3" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                SSchedule
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">now</span>
          </div>

          <div className="text-sm font-extrabold text-slate-900 dark:text-white">
            {topTask ? "It's time to focus! 🎯" : "You're all caught up! ✨"}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
            {topTask
              ? `Next priority: "${topTask.title}" (${topTask.courseCode || 'Study Task'}) — tap to start focus session.`
              : 'Great job maintaining momentum today! Tap to check upcoming assignments.'}
          </p>
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="text-center pb-2">
        <button
          onClick={() => {
            onClose();
            onOpenAppToTask();
          }}
          className="text-xs font-semibold text-white/90 hover:text-white underline cursor-pointer"
        >
          Swipe up or tap alert to open SSchedule
        </button>
      </div>
    </div>
  );
};
