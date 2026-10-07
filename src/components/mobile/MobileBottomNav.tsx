import React from 'react';
import { Home, CheckSquare, Sparkles, Calendar, MoreHorizontal, GraduationCap } from 'lucide-react';

export type NavTab = 'home' | 'tasks' | 'courses' | 'ai' | 'calendar' | 'more';

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
    { id: 'courses' as NavTab, label: 'Courses', icon: GraduationCap },
    { id: 'ai' as NavTab, label: 'AI Study', icon: Sparkles, isAI: true },
    { id: 'calendar' as NavTab, label: 'Calendar', icon: Calendar },
    { id: 'more' as NavTab, label: 'More', icon: MoreHorizontal },
  ];

  return (
    <nav
      aria-label="Main Navigation"
      className="w-full bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 px-2 py-1.5 pb-safe z-40 transition-colors"
    >
      <div className="flex items-center justify-around w-full max-w-xl mx-auto pb-1.5">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;

          if (tab.isAI) {
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex flex-col items-center justify-center min-w-[52px] min-h-[44px] py-1.5 px-[5px] rounded transition-all cursor-pointer active:scale-95 ${
                  isActive
                    ? 'bg-indigo-100 dark:bg-indigo-950/60'
                    : 'bg-indigo-50 dark:bg-indigo-950/40'
                }`}
                title="AI Study Assistant"
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive ? 'stroke-[2.4] text-indigo-600 dark:text-indigo-400' : 'stroke-[1.8] text-slate-400 dark:text-slate-500'
                  }`}
                />
                <span
                  className={`text-[10px] font-bold mt-1 tracking-tight ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </span>
                {isActive && (
                  <span className="w-1.5 h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400 mt-0.5" />
                )}
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex flex-col items-center justify-center min-w-[50px] min-h-[44px] py-1 active:scale-95 transition-all cursor-pointer ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive ? 'stroke-[2.4] text-indigo-600 dark:text-indigo-400' : 'stroke-[1.8]'
                  }`}
                />
                {tab.id === 'more' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-950" />
                )}
              </div>
              <span className="text-[10px] font-semibold mt-1 tracking-tight">
                {tab.label}
              </span>
              {isActive && (
                <span className="w-1.5 h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
