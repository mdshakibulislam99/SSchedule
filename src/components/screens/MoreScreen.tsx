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
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'files', label: 'Files & Notes', icon: FileText },
    { id: 'research', label: 'AI Research', icon: Search },
    { id: 'progress', label: 'Progress & Stats', icon: BarChart2 },
    { id: 'goals', label: 'Study Goals', icon: Target },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col pb-8 animate-fade-in text-slate-900 dark:text-white">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white pt-2 pb-6">
        More
      </h1>

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="w-full flex items-center gap-4 py-1.5 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors active:scale-[0.99]"
            >
              <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-slate-600 dark:text-slate-300" strokeWidth={1.75} />
              </div>
              <span className="text-base font-bold text-slate-900 dark:text-white">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 pt-10">
        SShedule v{CURRENT_APP_VERSION} (Build {CURRENT_BUILD_NUMBER})
      </p>
    </div>
  );
};
