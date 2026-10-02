import React from 'react';
import { Home, CheckSquare, Sparkles, Calendar, MoreHorizontal } from 'lucide-react';

export type NavTab = 'home' | 'tasks' | 'ai' | 'calendar' | 'more';

interface MobileBottomNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  unreadCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  onTabChange,
  unreadCount = 0,
}) => {
  const tabs = [
    { id: 'home' as NavTab, label: 'Home', icon: Home },
    { id: 'tasks' as NavTab, label: 'Tasks', icon: CheckSquare },
    { id: 'ai' as NavTab, label: 'AI Chat', icon: Sparkles, isAI: true },
    { id: 'calendar' as NavTab, label: 'Calendar', icon: Calendar },
    { id: 'more' as NavTab, label: 'More', icon: MoreHorizontal },
  ];

  return (
    <div className="w-full bg-white/90 dark:bg-slate-950/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 py-2 px-2 z-40">
      <div className="flex items-center justify-around w-full max-w-2xl mx-auto">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;

          if (tab.isAI) {
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="group relative flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-0.5 active:scale-95 transition-transform"
                title="StudyAI Assistant"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5 fill-current" />
                </div>
                <span
                    className={`text-[10px] font-bold mt-1 tracking-tight ${
                    isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-col items-center justify-center min-w-[52px] min-h-[48px] py-1 active:scale-95 transition-all text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400 stroke-[2.3]'
                      : 'text-slate-400 dark:text-slate-500 stroke-[1.8]'
                  }`}
                />
                {tab.id === 'more' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
                )}
              </div>
              <span
                      className={`text-[10px] font-semibold mt-1 tracking-tight ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
