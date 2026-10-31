import React from 'react';
import {
  FileText,
  Search,
  BarChart2,
  Target,
  Settings,
  User,
} from 'lucide-react';
import { CURRENT_APP_VERSION, CURRENT_BUILD_NUMBER } from '../../utils/version';

interface MoreScreenProps {
  onNavigate: (destination: string) => void;
  unreadCount?: number;
}

export const MoreScreen: React.FC<MoreScreenProps> = ({
  onNavigate,
  unreadCount = 0,
}) => {
  const items = [
    { id: 'profile', label: 'Profile', hint: 'Your details and study preferences', icon: User },
    { id: 'files', label: 'Files & Notes', hint: 'Books, documents, and notes', icon: FileText },
    { id: 'research', label: 'AI Research', hint: 'Explore sources and findings', icon: Search },
    { id: 'progress', label: 'Progress & Stats', hint: 'Study time and learning trends', icon: BarChart2 },
    { id: 'goals', label: 'Study Goals', hint: 'Track your bigger milestones', icon: Target },
    { id: 'settings', label: 'Settings', hint: 'AI, sync, and appearance', icon: Settings },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col pb-8 animate-fade-in text-slate-900 dark:text-white">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white pt-2 pb-6">
        More
      </h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="group relative min-h-[132px] w-full flex flex-col items-start rounded-[22px] border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left shadow-sm hover:-translate-y-0.5 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center shrink-0 transition-colors group-hover:bg-indigo-600">
                <Icon className="w-[18px] h-[18px] text-indigo-600 dark:text-indigo-300 group-hover:text-white transition-colors" strokeWidth={1.9} />
              </div>
              <span className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                {item.label}
              </span>
              <span className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {item.hint}
              </span>
              {item.id === 'settings' && unreadCount > 0 && (
                <span className="absolute top-3 right-3 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 pt-10">
        SSchedule v{CURRENT_APP_VERSION} (Build {CURRENT_BUILD_NUMBER})
      </p>
    </div>
  );
};
