import React from 'react';
import { X, Sparkles, ArrowRight, Bell } from 'lucide-react';
import { MascotAvatar } from '../mobile/MascotAvatar';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-between p-6 pb-24 sm:pb-6 bg-gradient-to-b from-blue-400 via-indigo-400 to-purple-600 text-white animate-fade-in select-none">
      {/* Dismiss button */}
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-black/20 text-white/80 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Lockscreen Time (Matching Screen 27 in reference image) */}
      <div className="flex flex-col items-center text-center space-y-1 my-auto">
        <span className="text-7xl font-extralight tracking-tight font-mono">9:41</span>
        <span className="text-sm font-semibold tracking-wide text-white/90">
          Tuesday, April 22
        </span>

        {/* Lockscreen Notification Card (Matching Screen 27) */}
        <div
          onClick={() => {
            onClose();
            onOpenAppToTask();
          }}
          className="w-full max-w-sm mt-8 p-4 rounded-3xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl text-slate-900 dark:text-white shadow-2xl border border-white/40 cursor-pointer active:scale-95 transition-all text-left"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-indigo-600 flex items-center justify-center text-white">
                <Sparkles className="w-3 h-3" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                StudyAI
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">now</span>
          </div>

          <div className="text-sm font-extrabold text-slate-900 dark:text-white">
            It's time to study! 🎯
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
            Your next best step is to finish CS101 Assignment 2 before your 12:00 PM lunch break.
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
          className="text-xs font-semibold text-white/90 underline"
        >
          Swipe up or tap alert to open StudyAI
        </button>
      </div>
    </div>
  );
};
