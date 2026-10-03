import React from 'react';
import {
  FileText,
  Search,
  BarChart2,
  Target,
  Settings,
  User,
  ChevronRight,
} from 'lucide-react';
import { NavTab } from '../mobile/MobileBottomNav';

interface MoreScreenProps {
  onNavigate: (destination: string) => void;
  unreadCount?: number;
}

export const MoreScreen: React.FC<MoreScreenProps> = ({ onNavigate, unreadCount = 0 }) => {
  const items = [
    { id: 'files', label: 'Files & Notes', desc: 'Uploaded documents & summaries', icon: FileText, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60' },
    { id: 'research', label: 'AI Research', desc: 'Deep topic synthesis', icon: Search, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/60' },
    { id: 'progress', label: 'Progress & Stats', desc: 'Focus score & weekly metrics', icon: BarChart2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60' },
    { id: 'goals', label: 'Study Goals', desc: 'Target milestones & grades', icon: Target, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/60' },
    { id: 'settings', label: 'Settings', desc: 'AI provider, preferences & memory', icon: Settings, color: 'text-slate-600 bg-slate-100 dark:bg-slate-800' },
    { id: 'profile', label: 'Profile Settings', desc: 'Edit your details, goals & account', icon: User, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/60' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col space-y-6 pb-8 animate-fade-in text-slate-900 dark:text-white">
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-mobile-micro uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Workspace</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          More Features
          </h1>
        </div>
      </div>

      <div className="space-y-2.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="w-full p-4 rounded-[1.25rem] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between shadow-[0_8px_24px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all text-left active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {item.label}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {item.desc}
                  </div>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
