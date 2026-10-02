import React from 'react';
import { X, PlusCircle, Sparkles, UploadCloud, Calendar as CalendarIcon } from 'lucide-react';

interface QuickActionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: 'add_task' | 'ask_ai' | 'add_file' | 'view_calendar') => void;
}

export const QuickActionsSheet: React.FC<QuickActionsSheetProps> = ({
  isOpen,
  onClose,
  onAction,
}) => {
  if (!isOpen) return null;

  const actions = [
    {
      id: 'add_task' as const,
      title: 'Add Task',
      desc: 'Create new assignment or exam milestone',
      icon: PlusCircle,
      color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
    },
    {
      id: 'ask_ai' as const,
      title: 'Ask AI',
      desc: 'Start voice or text study coaching session',
      icon: Sparkles,
      color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400',
    },
    {
      id: 'add_file' as const,
      title: 'Add File',
      desc: 'Upload syllabus or lecture notes to extract tasks',
      icon: UploadCloud,
      color: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
    },
    {
      id: 'view_calendar' as const,
      title: 'View Calendar',
      desc: 'Check your daily lectures and focus windows',
      icon: CalendarIcon,
      color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] border-t border-slate-200 dark:border-slate-800 p-6 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab Handle */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

        {/* Sheet Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Quick Actions</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Actions List */}
        <div className="space-y-2.5 py-4">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id}
                onClick={() => {
                  onClose();
                  onAction(act.id);
                }}
                className="w-full flex items-center gap-3.5 p-4 rounded-[1.25rem] border border-slate-200/70 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left active:scale-[0.99]"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${act.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{act.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{act.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
