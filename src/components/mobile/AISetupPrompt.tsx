import React from 'react';
import { Settings2, X } from 'lucide-react';

interface AISetupPromptProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

export const AISetupPrompt: React.FC<AISetupPromptProps> = ({ onClose, onOpenSettings }) => (
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Settings2 className="h-5 w-5" />
          </span>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">Set up an AI provider</h2>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-slate-400" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        Choose an AI provider before using AI features in StudyAI.
      </p>
      <button
        type="button"
        onClick={onOpenSettings}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500"
      >
        <Settings2 className="h-4 w-4" />
        Open AI provider settings
      </button>
    </div>
  </div>
);
