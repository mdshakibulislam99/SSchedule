import React from 'react';
import { Home, CheckSquare, Sparkles, Calendar, MoreHorizontal, GraduationCap } from 'lucide-react';
import type { NavTab } from '../mobile/MobileBottomNav';

interface DesktopSidebarNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  unreadCount?: number;
}

/**
 * Desktop-only (lg+) left sidebar navigation. Mobile keeps the
 * bottom tab bar — this component renders nothing below lg.
 */
export const DesktopSidebarNav: React.FC<DesktopSidebarNavProps> = ({
  currentTab,
  onTabChange,
  unreadCount = 0,
}) => {
  const tabs: { id: NavTab; label: string; icon: React.ElementType; hint: string; isAI?: boolean }[] = [
    { id: 'home', label: 'Home', icon: Home, hint: 'Today at a glance' },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, hint: 'Plan & finish work' },
    { id: 'courses', label: 'Courses', icon: GraduationCap, hint: 'Classes & resources' },
    { id: 'ai', label: 'AI Study', icon: Sparkles, hint: 'Your study assistant', isAI: true },
    { id: 'calendar', label: 'Calendar', icon: Calendar, hint: 'Schedule & events' },
    { id: 'more', label: 'More', icon: MoreHorizontal, hint: 'Files, goals, settings' },
  ];

  return (
    <aside
      aria-label="Main Navigation"
      className="hidden lg:flex flex-col w-60 xl:w-64 shrink-0 h-full border-r border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg p-4 pt-5"
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 pb-5 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-600/20 flex items-center justify-center text-white">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            SSchedule
          </div>
          <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-tight">
            Smart Study Assistant
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 overflow-y-auto no-scrollbar -mx-1 px-1">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex items-center gap-3 w-full min-h-[44px] px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer active:scale-[0.98] ${
                isActive
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-colors ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 stroke-[2.2]'
                    : tab.isAI
                    ? 'text-indigo-500 dark:text-indigo-400 stroke-[1.8]'
                    : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 stroke-[1.8]'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] leading-tight ${isActive ? 'font-bold' : 'font-semibold'}`}>
                  {tab.label}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight truncate">
                  {tab.hint}
                </div>
              </div>
              {tab.id === 'more' && unreadCount > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto pt-4 px-2 shrink-0">
        <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
          Your data syncs to the cloud when you sign in — tasks, schedule, and courses stay in
          step across devices.
        </p>
      </div>
    </aside>
  );
};
