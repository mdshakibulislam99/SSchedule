import React from 'react';
import { Settings2, X } from 'lucide-react';

interface AISetupPromptProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

export const AISetupPrompt: React.FC<AISetupPromptProps> = ({ onClose, onOpenSettings }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
    <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Settings2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">AI Setup Required</h2>
            <p className="text-[11px] text-slate-400">Configure provider to use AI</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-3.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        To chat with course materials, edit tasks with AI, or generate flashcards, please connect Puter.js (free) or provide an API key in Settings.
      </p>
      <button
        type="button"
        onClick={onOpenSettings}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-xs font-bold text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/25 active:scale-95 transition-all cursor-pointer"
      >
        <Settings2 className="h-4 w-4" />
        <span>Open AI Settings</span>
      </button>
    </div>
  </div>
);
