import React from 'react';
import {
  Sparkles,
  ArrowRight,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Flame,
  Zap,
  ChevronRight,
  Bell,
  Menu,
  Cloud,
  Check,
  Play,
  BookOpen,
  TrendingUp,
} from 'lucide-react';
import { UserProfile, Task, ScheduleEvent, NotificationItem } from '../../types';

interface HomeScreenProps {
  user: UserProfile;
  tasks: Task[];
  schedule: ScheduleEvent[];
  notifications: NotificationItem[];
  onOpenWhatToDoNow: () => void;
  onOpenAIChat: (initialQuery?: string) => void;
  onOpenTasks: () => void;
  onOpenCalendar: () => void;
  onOpenNotifications: () => void;
  onOpenSideMenu: () => void;
  onUpdateEnergy: (level: 1 | 2 | 3 | 4 | 5) => void;
  onSelectTask: (task: Task) => void;
  onStartFocusTimer?: (task: Task) => void;
  onSignInWithGoogle?: () => void;
  isFirebaseSynced?: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  user,
  tasks,
  schedule,
  notifications,
  onOpenWhatToDoNow,
  onOpenAIChat,
  onOpenTasks,
  onOpenCalendar,
  onOpenNotifications,
  onOpenSideMenu,
  onUpdateEnergy,
  onSelectTask,
  onStartFocusTimer,
  onSignInWithGoogle,
  isFirebaseSynced = false,
}) => {
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Active top recommended task
  const activeTasks = tasks.filter((t) => !t.completed);
  const primaryTask =
    activeTasks.find((t) => t.priority === 'high') || activeTasks[0] || tasks[0];

  // Unique courses derived from tasks
  const courseCodes = Array.from(new Set(tasks.map((t) => t.courseCode)));
  const courseWorkloads = courseCodes.map((code) => {
    const courseTasks = tasks.filter((t) => t.courseCode === code);
    const completed = courseTasks.filter((t) => t.completed).length;
    const color = courseTasks[0]?.courseColor || '#6366F1';
    return {
      code,
      color,
      total: courseTasks.length,
      completed,
      pending: courseTasks.length - completed,
      pct: courseTasks.length > 0 ? Math.round((completed / courseTasks.length) * 100) : 0,
    };
  });

  const energyLabels = [
    { level: 1 as const, label: 'Low', icon: '😴' },
    { level: 2 as const, label: 'Tired', icon: '🥱' },
    { level: 3 as const, label: 'Okay', icon: '🙂' },
    { level: 4 as const, label: 'Good', icon: '⚡' },
    { level: 5 as const, label: 'Peak', icon: '🔥' },
  ];

  // Next upcoming event from schedule
  const nextEvent = schedule[0];

  return (
    <div className="w-full flex flex-col space-y-6 pb-6 text-slate-900 dark:text-slate-100 font-sans">
      {/* 1. NATIVE TOP APP BAR */}
      <header className="flex items-center justify-between pt-1 pb-1">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSideMenu}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl transition-colors active:scale-95"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.name}
                  className="w-9 h-9 rounded-full object-cover ring-2 ring-indigo-500/20"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                  {user.name.charAt(0)}
                </div>
              )}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-950 ${
                  isFirebaseSynced ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
                title={isFirebaseSynced ? 'Cloud Synced' : 'Local Storage Mode'}
              />
            </div>

            <div>
              <h1 className="text-mobile-subheading text-slate-900 dark:text-white leading-none">
                {user.name}
              </h1>
              <p className="text-mobile-micro text-slate-500 dark:text-slate-400 mt-0.5">
                {user.university} · {user.year}
              </p>
            </div>
          </div>
        </div>

        {/* Right Action Icons: Cloud Sync & Notification Bell */}
        <div className="flex items-center gap-2">
          {isFirebaseSynced ? (
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-mobile-micro font-bold text-emerald-700 dark:text-emerald-400"
              title="Firebase Cloud Synced"
            >
              <Cloud className="w-3 h-3 text-emerald-500" />
              <span className="hidden xs:inline">Synced</span>
            </div>
          ) : (
            <button
              onClick={onSignInWithGoogle}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-mobile-micro font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition-colors active:scale-95"
              title="Sign in with Google to sync"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sync</span>
            </button>
          )}

          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>
        </div>
      </header>

      {/* 2. KEEP EVERYTHING IN TRACK — MOMENTUM COMMAND CENTER */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Metric 1: Tasks Due Today */}
        <div
          onClick={onOpenTasks}
          className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm cursor-pointer hover:border-indigo-300 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center justify-between text-mobile-small text-slate-500 dark:text-slate-400 mb-1">
            <span>Due Today</span>
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-mobile-h2 font-extrabold text-slate-900 dark:text-white">
            {activeTasks.length} <span className="text-mobile-small text-slate-400 font-normal">tasks</span>
          </div>
          <p className="text-mobile-micro text-slate-500 dark:text-slate-400 mt-1 truncate">
            {primaryTask ? `Next: ${primaryTask.courseCode}` : 'All caught up'}
          </p>
        </div>

        {/* Metric 2: Next Event */}
        <div
          onClick={onOpenCalendar}
          className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm cursor-pointer hover:border-indigo-300 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center justify-between text-mobile-small text-slate-500 dark:text-slate-400 mb-1">
            <span>Next Up</span>
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-mobile-subheading text-slate-900 dark:text-white truncate">
            {nextEvent ? nextEvent.title : 'Free Time'}
          </div>
          <p className="text-mobile-micro font-mono font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
            {nextEvent ? `${nextEvent.startTime} – ${nextEvent.endTime}` : 'No events scheduled'}
          </p>
        </div>

        {/* Metric 3: Focus Minutes */}
        <div
          onClick={onOpenWhatToDoNow}
          className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm cursor-pointer hover:border-indigo-300 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center justify-between text-mobile-small text-slate-500 dark:text-slate-400 mb-1">
            <span>Study Goal</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-mobile-h2 font-extrabold text-slate-900 dark:text-white">
            60 <span className="text-mobile-small text-slate-400 font-normal">/ 120m</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full w-1/2" />
          </div>
        </div>

        {/* Metric 4: Streak */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm">
          <div className="flex items-center justify-between text-mobile-small text-slate-500 dark:text-slate-400 mb-1">
            <span>Streak</span>
            <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          </div>
          <div className="text-mobile-h2 font-extrabold text-slate-900 dark:text-white">
            {user.streak || 5} <span className="text-mobile-small text-slate-400 font-normal">days</span>
          </div>
          <p className="text-mobile-micro text-amber-600 dark:text-amber-400 font-semibold mt-1">
            On track this week!
          </p>
        </div>
      </section>

      {/* 3. HERO: "WHAT SHOULD I DO RIGHT NOW?" ACTION DISPATCH */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-900 dark:bg-slate-850 text-white p-5 border border-slate-800 shadow-md">
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-mobile-micro font-extrabold tracking-wide uppercase text-indigo-300">
              <Sparkles className="w-3 h-3 text-indigo-300" />
              <span>Recommended Focus</span>
            </span>

            <span className="text-mobile-micro font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md">
              ⚡ Energy Match: {user.energyLevel * 20}%
            </span>
          </div>

          <div>
            <h2 className="text-mobile-h2 text-white leading-snug">
              {primaryTask ? primaryTask.title : 'Review Course Notes'}
            </h2>
            <p className="text-mobile-compact text-slate-300 mt-1 line-clamp-2 leading-relaxed">
              {primaryTask?.aiPlanReason ||
                'Calculated by deadline proximity, upcoming classes, and your optimal focus rhythm.'}
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              onClick={() => onSelectTask(primaryTask)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-mobile-compact-bold shadow-md shadow-indigo-600/30 transition-all active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start 25m Focus Session</span>
            </button>

            <button
              onClick={onOpenWhatToDoNow}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors active:scale-95"
              title="View full AI analysis"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 4. QUICK ENERGY CHECK-IN */}
      <section className="rounded-2xl p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-mobile-small font-bold text-slate-700 dark:text-slate-300">
            <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span>Energy Check-in</span>
          </div>
          <span className="text-mobile-micro text-slate-500 dark:text-slate-400">
            Current: {energyLabels.find((e) => e.level === user.energyLevel)?.label}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {energyLabels.map((item) => {
            const isSelected = user.energyLevel === item.level;
            return (
              <button
                key={item.level}
                onClick={() => onUpdateEnergy(item.level)}
                className={`py-2 px-1 rounded-xl text-center transition-all ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/30 font-bold'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium'
                }`}
              >
                <div className="text-sm">{item.icon}</div>
                <div className="text-mobile-micro mt-0.5">{item.label}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. COURSE WORKLOADS STRIP */}
      {courseWorkloads.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-mobile-micro font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Courses ({courseWorkloads.length})
            </h3>
            <button
              onClick={onOpenTasks}
              className="text-mobile-small font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              All tasks
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {courseWorkloads.map((cw) => (
              <div
                key={cw.code}
                onClick={onOpenTasks}
                className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 shadow-sm cursor-pointer hover:border-slate-300 transition-all"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-mobile-micro font-extrabold px-2 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: cw.color }}
                  >
                    {cw.code}
                  </span>
                  <span className="text-mobile-micro font-bold text-slate-700 dark:text-slate-300">
                    {cw.pct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${cw.pct}%`, backgroundColor: cw.color }}
                  />
                </div>
                <span className="text-mobile-micro text-slate-500 dark:text-slate-400">
                  {cw.pending} pending · {cw.completed} done
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. TODAY'S CHRONOLOGICAL SCHEDULE */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-mobile-h3 text-slate-900 dark:text-white">Today's Schedule</h3>
          <button
            onClick={onOpenCalendar}
            className="text-mobile-small font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Full calendar →
          </button>
        </div>

        <div className="space-y-2">
          {schedule.slice(0, 4).map((item) => (
            <div
              key={item.id}
              onClick={onOpenCalendar}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 hover:border-indigo-300 transition-all cursor-pointer shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-2.5 h-9 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div className="min-w-0">
                  <div className="text-mobile-compact-bold text-slate-900 dark:text-white truncate">
                    {item.title}
                  </div>
                  {item.location && (
                    <div className="text-mobile-small text-slate-500 dark:text-slate-400 truncate">
                      {item.location}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-mobile-small font-mono font-semibold text-slate-600 dark:text-slate-300 shrink-0 ml-3">
                {item.startTime} – {item.endTime}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 7. UPCOMING DEADLINES */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-mobile-h3 text-slate-900 dark:text-white">Upcoming Deadlines</h3>
          <button
            onClick={onOpenTasks}
            className="text-mobile-small font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Manage tasks →
          </button>
        </div>

        <div className="space-y-2">
          {activeTasks.slice(0, 4).map((task) => (
            <div
              key={task.id}
              onClick={() => onSelectTask(task)}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 hover:border-indigo-300 transition-all cursor-pointer shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-mobile-micro font-extrabold shrink-0 shadow-sm"
                  style={{ backgroundColor: task.courseColor }}
                >
                  {task.courseCode}
                </div>
                <div className="min-w-0">
                  <div className="text-mobile-compact-bold text-slate-900 dark:text-white truncate">
                    {task.title}
                  </div>
                  <div className="text-mobile-small text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span>
                      Due{' '}
                      {new Date(task.deadline).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span>·</span>
                    <span
                      className={`font-semibold capitalize text-mobile-micro ${
                        task.priority === 'high'
                          ? 'text-rose-500'
                          : task.priority === 'medium'
                          ? 'text-amber-500'
                          : 'text-slate-400'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
