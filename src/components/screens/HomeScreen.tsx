import React from 'react';
import {
  Menu,
  Bell,
  Play,
  ArrowRight,
  AlertCircle,
  Clock,
  TrendingUp,
  Flame,
  CheckCircle2,
  Circle,
  ChevronRight,
  Calendar,
  Cloud,
} from 'lucide-react';
import { Task, ScheduleEvent, UserProfile, NotificationItem } from '../../types';
import { getLocalDateKey } from '../../utils/dates';

interface HomeScreenProps {
  user: UserProfile;
  tasks: Task[];
  schedule: ScheduleEvent[];
  notifications: NotificationItem[];
  onOpenWhatToDoNow: () => void;
  onOpenAIChat: (query?: string) => void;
  onOpenTasks: (courseCode?: string) => void;
  onOpenCalendar: () => void;
  onOpenNotifications: () => void;
  onOpenSideMenu: () => void;
  onOpenCourse: (courseCode: string) => void;
  onUpdateEnergy: (level: 1 | 2 | 3 | 4 | 5) => void;
  onSelectTask: (task: Task) => void;
  onToggleTask?: (taskId: string) => void;
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
  onOpenTasks,
  onOpenCalendar,
  onOpenNotifications,
  onOpenSideMenu,
  onOpenCourse,
  onUpdateEnergy,
  onSelectTask,
  onToggleTask,
  onStartFocusTimer,
  onSignInWithGoogle,
  isFirebaseSynced = false,
}) => {
  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeTasks = tasks.filter((t) => !t.completed);
  const todayKey = getLocalDateKey();

  const isTaskForToday = (task: Task) => {
    if (task.scheduledDate === todayKey) return true;
    if (task.recurrence === 'daily' && task.scheduledDate && task.scheduledDate <= todayKey) return true;
    if (task.recurrence === 'weekdays' && task.scheduledDate && task.scheduledDate <= todayKey) {
      const day = new Date(`${todayKey}T12:00:00`).getDay();
      return day > 0 && day < 6;
    }
    if (task.recurrence === 'weekly' && task.scheduledDate) {
      return new Date(`${task.scheduledDate}T12:00:00`).getDay() === new Date(`${todayKey}T12:00:00`).getDay();
    }
    return getLocalDateKey(new Date(task.deadline)) === todayKey;
  };

  const todayTasks = activeTasks.filter(isTaskForToday);
  const todaySchedule = schedule
    .filter((event) => event.date === todayKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const primaryTask =
    activeTasks.find((t) => t.priority === 'high') || activeTasks[0] || tasks[0];

  const courseCodes = Array.from(new Set(tasks.map((t) => t.courseCode).filter(Boolean))) as string[];
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

  const energyOptions = [
    { level: 1 as const, icon: '😴', label: 'Low' },
    { level: 2 as const, icon: '🥱', label: 'Tired' },
    { level: 3 as const, icon: '🙂', label: 'Steady' },
    { level: 4 as const, icon: '⚡', label: 'High' },
    { level: 5 as const, icon: '🔥', label: 'Peak' },
  ];

  const nextEvent = todaySchedule[0];
  const upcomingTasks = [...activeTasks]
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 4);

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const formattedToday = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col space-y-5 pb-12 animate-fade-in text-slate-900 dark:text-slate-100 font-sans">
      {/* 1. CLEAN, MINIMAL HEADER */}
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSideMenu}
            className="p-2 -ml-2 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-medium">{formattedToday}</span>
              {isFirebaseSynced && (
                <>
                  <span>·</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Synced</span>
                </>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
              {timeGreeting}, {user.name.split(' ')[0]}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Subtle Energy Selector */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-xs">
            <span className="text-[11px] text-slate-400 font-medium mr-1">Energy:</span>
            {energyOptions.map((e) => (
              <button
                key={e.level}
                onClick={() => onUpdateEnergy(e.level)}
                className={`w-6 h-6 rounded flex items-center justify-center text-xs transition-transform cursor-pointer ${
                  user.energyLevel === e.level
                    ? 'bg-white dark:bg-slate-700 shadow-2xs scale-110'
                    : 'opacity-50 hover:opacity-100'
                }`}
                title={`${e.label} energy`}
              >
                {e.icon}
              </button>
            ))}
          </div>

          {!isFirebaseSynced && onSignInWithGoogle && (
            <button
              onClick={onSignInWithGoogle}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Cloud className="w-3.5 h-3.5 text-indigo-500" />
              <span>Connect</span>
            </button>
          )}

          <button
            onClick={onOpenNotifications}
            className="relative p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>
        </div>
      </header>

      {/* 2. RECOMMENDED WORK */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-50/60 via-slate-50/40 to-transparent dark:from-indigo-950/30 dark:via-slate-900 dark:to-transparent">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider font-mono text-[10px]">
                NEXT FOCUS
              </span>
              <span>·</span>
              {primaryTask?.courseCode ? (
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {primaryTask.courseCode}
                </span>
              ) : (
                <span>Study</span>
              )}
              <span>·</span>
              <span>Match {user.energyLevel * 20}%</span>
            </div>

            <h2
              onClick={() => primaryTask && onSelectTask(primaryTask)}
              className="text-base font-bold text-slate-900 dark:text-white truncate mt-1 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {primaryTask ? primaryTask.title : 'Review Course Materials'}
            </h2>

            {primaryTask && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Due {new Date(primaryTask.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                {primaryTask.estimatedMinutes ? ` · ~${primaryTask.estimatedMinutes}m` : ''}
                {primaryTask.aiPlanReason ? ` · ${primaryTask.aiPlanReason}` : ''}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                if (primaryTask) {
                  if (onStartFocusTimer) onStartFocusTimer(primaryTask);
                  else onSelectTask(primaryTask);
                } else {
                  onOpenWhatToDoNow();
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>Start 25 min</span>
            </button>

            <button
              onClick={onOpenWhatToDoNow}
              className="inline-flex items-center gap-1 py-2 px-2.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition-colors cursor-pointer"
            >
              <span>Analysis</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </section>

      {/* 3. PROGRESS DASHBOARD (Cleanly spaced) */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800/80 text-xs">
          {/* Signal 1: Due Today */}
          <button
            onClick={() => onOpenTasks()}
            className="p-3 sm:py-3.5 sm:px-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Due Today</span>
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                {todayTasks.length}
              </span>
              <span className="text-[11px] text-slate-400">
                {todayTasks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>
          </button>

          {/* Signal 2: Next Event */}
          <button
            onClick={onOpenCalendar}
            className="p-3 sm:py-3.5 sm:px-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group min-w-0"
          >
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Next Event</span>
              <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            </div>
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">
              {nextEvent ? nextEvent.title : 'Free Time'}
            </p>
          </button>

          {/* Signal 3: Focus Progress */}
          <button
            onClick={onOpenWhatToDoNow}
            className="p-3 sm:py-3.5 sm:px-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Focus Today</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                60
              </span>
              <span className="text-[11px] text-slate-400">/ 120m</span>
            </div>
          </button>

          {/* Signal 4: Daily Streak */}
          <div className="p-3 sm:py-3.5 sm:px-4 text-left">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Streak</span>
              <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                {user.streak || 5}
              </span>
              <span className="text-[11px] text-slate-400">days</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. TWO-COLUMN SPLIT: TODAY'S SCHEDULE & UPCOMING TASKS (Clean, high-density rows) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Today's Schedule */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Today&apos;s Schedule
            </h3>
            <button
              onClick={onOpenCalendar}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Calendar →
            </button>
          </div>

          <div className="space-y-1.5">
            {todaySchedule.length === 0 ? (
              <div className="py-8 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                No events scheduled for today.
              </div>
            ) : (
              todaySchedule.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  onClick={onOpenCalendar}
                  className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-1.5 h-5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </p>
                      {item.location && (
                        <p className="text-[10px] text-slate-400 truncate">
                          {item.location}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="font-mono text-[11px] text-slate-400 shrink-0 ml-2 tabular-nums">
                    {item.startTime}–{item.endTime}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Priority Due Tasks */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Due Tasks
            </h3>
            <button
              onClick={() => onOpenTasks()}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              All tasks →
            </button>
          </div>

          <div className="space-y-1.5">
            {upcomingTasks.length === 0 ? (
              <div className="py-8 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                All caught up! No due tasks.
              </div>
            ) : (
              upcomingTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className="group flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {onToggleTask && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTask(task.id);
                        }}
                        className="p-1 -ml-1 text-slate-300 hover:text-indigo-600 dark:text-slate-600 dark:hover:text-indigo-400 transition-colors shrink-0 cursor-pointer"
                        aria-label="Complete task"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        {task.courseCode && (
                          <span
                            className="font-bold uppercase font-mono"
                            style={{ color: task.courseColor }}
                          >
                            {task.courseCode}
                          </span>
                        )}
                        <span>·</span>
                        <span>
                          Due {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* 4. COURSE WORKLOADS (Clean, quiet progress strip) */}
      {courseWorkloads.length > 0 && (
        <section className="space-y-2 pt-1">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Courses ({courseWorkloads.length})
            </h3>
            <button
              onClick={() => onOpenCourse(courseWorkloads[0].code)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Details →
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {courseWorkloads.map((cw) => (
              <div
                key={cw.code}
                onClick={() => onOpenCourse(cw.code)}
                className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-xs font-bold uppercase font-mono"
                    style={{ color: cw.color }}
                  >
                    {cw.code}
                  </span>
                  <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400">
                    {cw.pct}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${cw.pct}%`, backgroundColor: cw.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
