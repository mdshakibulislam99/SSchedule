import React, { useEffect, useRef, useState } from 'react';
import { Plus, Search, ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, Circle, Trash2, X, Check } from 'lucide-react';
import { Task, TaskCategory, ScheduleEvent } from '../../types';
import { getLocalDateKey } from '../../utils/dates';
import { TaskComposer } from '../tasks/TaskComposer';

interface TasksScreenProps {
  tasks: Task[];
  schedule: ScheduleEvent[];
  courseCodeFilter?: string;
  onClearCourseFilter?: () => void;
  onSelectTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: Partial<Task>, autoPlan: boolean) => void;
  onDeleteTask?: (taskId: string) => void;
  onComposerStateChange?: (isOpen: boolean) => void;
}

const AREA_CHOICES: { id: 'all' | TaskCategory; label: string }[] = [
  { id: 'all', label: 'All areas' },
  { id: 'academic', label: 'Academic' },
  { id: 'personal', label: 'Personal' },
  { id: 'health', label: 'Health' },
  { id: 'work', label: 'Work' },
  { id: 'admin', label: 'Admin' },
];

export const TasksScreen: React.FC<TasksScreenProps> = ({
  tasks,
  schedule,
  courseCodeFilter,
  onClearCourseFilter,
  onSelectTask,
  onToggleTask,
  onAddTask,
  onDeleteTask,
  onComposerStateChange,
}) => {
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'overdue' | 'finished'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<'all' | TaskCategory>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFinishedExpanded, setIsFinishedExpanded] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);

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

  // Base matcher for course code, area, and search query
  const matchesBase = (t: Task) => {
    if (courseCodeFilter && t.courseCode !== courseCodeFilter) return false;
    const taskArea = t.category || (t.courseCode ? 'academic' : 'personal');
    if (areaFilter !== 'all' && taskArea !== areaFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        t.title.toLowerCase().includes(q) ||
        (t.courseCode || '').toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  };

  // 1. DUE TASKS (Strictly only unfinished tasks)
  const allDueTasks = tasks.filter((t) => !t.completed && matchesBase(t));

  // 2. FINISHED TASKS (Strictly completed tasks)
  const allFinishedTasks = tasks.filter((t) => t.completed && matchesBase(t));

  // Filtered due tasks depending on active tab
  const displayedDueTasks = allDueTasks.filter((t) => {
    if (filter === 'all') return true; // all due tasks
    if (filter === 'today') return isTaskForToday(t);
    if (filter === 'week') return true;
    if (filter === 'overdue') return new Date(t.deadline).getTime() < Date.now();
    return false;
  });

  const dueCount = tasks.filter((t) => !t.completed).length;
  const finishedCount = tasks.filter((t) => t.completed).length;

  // Track horizontal overflow of the filter tabs so the scroll affordances appear only when needed
  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollTabsLeft(el.scrollLeft > 4);
      setCanScrollTabsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [allFinishedTasks.length]);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col space-y-4 pb-8 animate-fade-in text-slate-900 dark:text-white">
      {/* Task workspace header */}
      <header className="flex items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {courseCodeFilter ? `${courseCodeFilter} tasks` : 'Tasks'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {dueCount} due · {finishedCount} finished · Academic & personal work
          </p>
        </div>

        <div className="flex items-center gap-2">
          {courseCodeFilter && (
            <button
              onClick={onClearCourseFilter}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mr-1"
            >
              All courses
            </button>
          )}

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
            aria-label="Create a task"
            title="Create a task"
          >
            <Plus className="w-4 h-4" />
            <span>New task</span>
          </button>
        </div>
      </header>

      {/* Segmented View Filter Tabs — horizontally scrollable on narrow screens */}
      <div className="relative">
        <div
          ref={tabsScrollRef}
          className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold overflow-x-auto no-scrollbar"
        >
          {(['all', 'today', 'week', 'overdue', 'finished'] as const).map((tab) => {
            const isActive = filter === tab;
            const label =
              tab === 'all'
                ? 'Due'
                : tab === 'today'
                ? 'Today'
                : tab === 'week'
                ? 'This week'
                : tab === 'overdue'
                ? 'Overdue'
                : `Finished (${allFinishedTasks.length})`;

            return (
              <button
                key={tab}
                onClick={(e) => {
                  setFilter(tab);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`shrink-0 whitespace-nowrap py-1.5 px-3 rounded-lg transition-all capitalize cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Scroll affordances: fade + chevron, shown only when more tabs exist off-screen */}
        {canScrollTabsLeft && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-9 flex items-center rounded-l-xl bg-gradient-to-r from-slate-100 via-slate-100/85 to-transparent dark:from-slate-900 dark:via-slate-900/85">
            <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400 ml-0.5" />
          </div>
        )}
        {canScrollTabsRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-9 flex items-center justify-end rounded-r-xl bg-gradient-to-l from-slate-100 via-slate-100/85 to-transparent dark:from-slate-900 dark:via-slate-900/85">
            <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400 mr-0.5" />
          </div>
        )}
      </div>

      {/* Category Area Pills & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Horizontal Category Scroll */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {AREA_CHOICES.map((area) => (
            <button
              key={area.id}
              onClick={() => setAreaFilter(area.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                areaFilter === area.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {area.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* VIEW: FINISHED TAB SELECTED */}
      {filter === 'finished' ? (
        <div className="space-y-2">
          {allFinishedTasks.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 p-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                No finished tasks yet.
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Complete tasks from your due list to see them archived here.
              </p>
            </div>
          ) : (
            allFinishedTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => onSelectTask(task)}
                className="group p-3 sm:p-3.5 rounded-xl bg-slate-50/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Uncheck button to move back to Due */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTask(task.id);
                    }}
                    className="p-1 -ml-1 text-emerald-600 dark:text-emerald-400 hover:text-slate-400 transition-colors shrink-0 cursor-pointer"
                    title="Click to unmark and move back to due"
                    aria-label="Move back to due"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      {task.courseCode && (
                        <span
                          className="font-extrabold uppercase font-mono tracking-wider text-[10px]"
                          style={{ color: task.courseColor }}
                        >
                          {task.courseCode}
                        </span>
                      )}
                      <span>·</span>
                      <span className="line-through">
                        Due {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                      {task.completedAt && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Finished</span>
                        </>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm font-semibold truncate text-slate-400 dark:text-slate-500 line-through mt-0.5">
                      {task.title}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onDeleteTask && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTaskToDelete(task);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                      title="Delete task"
                      aria-label={`Delete task ${task.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* VIEW: DUE TASKS (Main List) */
        <div className="space-y-2">
          {displayedDueTasks.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 p-6">
              <CheckCircle2 className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                No due tasks match this view.
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="mt-3 px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer"
              >
                Create task
              </button>
            </div>
          ) : (
            displayedDueTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => onSelectTask(task)}
                className="group p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-2xs cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* 1-Tap Complete Checkbox (Immediately moves to finished) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTask(task.id);
                    }}
                    className="p-1 -ml-1 text-slate-300 hover:text-indigo-600 dark:text-slate-600 dark:hover:text-indigo-400 transition-colors shrink-0 cursor-pointer"
                    aria-label="Mark task complete"
                    title="Mark task complete"
                  >
                    <Circle className="w-5 h-5" />
                  </button>

                  {/* Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {task.courseCode ? (
                        <span
                          className="font-extrabold uppercase font-mono tracking-wider text-[10px]"
                          style={{ color: task.courseColor }}
                        >
                          {task.courseCode}
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                          {task.category || 'Personal'}
                        </span>
                      )}
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        Due {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                      {task.priority === 'high' && (
                        <span className="text-[10px] font-bold text-rose-500">
                          · High
                        </span>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm font-bold truncate text-slate-900 dark:text-white mt-0.5">
                      {task.title}
                    </p>

                    {task.subtasks && task.subtasks.length > 0 && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {task.subtasks.filter((s) => s.completed).length} of {task.subtasks.length} subtasks done
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {onDeleteTask && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTaskToDelete(task);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                      title="Delete task"
                      aria-label={`Delete task ${task.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ))
          )}

          {/* Collapsible Finished Tasks Section Below Due Tasks */}
          {allFinishedTasks.length > 0 && (
            <div className="pt-3 space-y-2">
              <button
                type="button"
                onClick={() => setIsFinishedExpanded((prev) => !prev)}
                className="flex items-center justify-between w-full py-2 px-3 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 hover:bg-slate-200/80 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Finished Tasks ({allFinishedTasks.length})</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isFinishedExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isFinishedExpanded && (
                <div className="space-y-1.5 animate-fade-in pl-1">
                  {allFinishedTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task)}
                      className="group p-2.5 sm:p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Uncheck button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleTask(task.id);
                          }}
                          className="p-1 -ml-1 text-emerald-600 dark:text-emerald-400 hover:text-slate-400 transition-colors shrink-0 cursor-pointer"
                          title="Click to restore to due tasks"
                          aria-label="Move back to due tasks"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>

                        <div className="min-w-0">
                          <p className="line-through text-slate-400 dark:text-slate-500 font-medium truncate">
                            {task.title}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            {task.courseCode && <span>{task.courseCode}</span>}
                            <span>·</span>
                            <span>Finished</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {onDeleteTask && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTaskToDelete(task);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Task Composer Modal */}
      {isAddModalOpen && (
        <TaskComposer
          open={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            if (onComposerStateChange) onComposerStateChange(false);
          }}
          onSubmit={(taskData, autoPlan) => {
            onAddTask(taskData, autoPlan);
            setIsAddModalOpen(false);
            if (onComposerStateChange) onComposerStateChange(false);
          }}
        />
      )}

      {/* Delete Task Confirmation Modal */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Delete task</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-xs">
              <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{taskToDelete.title}</p>
              {taskToDelete.courseCode && (
                <span
                  className="inline-block mt-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded text-white uppercase font-mono"
                  style={{ backgroundColor: taskToDelete.courseColor }}
                >
                  {taskToDelete.courseCode}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (taskToDelete && onDeleteTask) {
                    onDeleteTask(taskToDelete.id);
                  }
                  setTaskToDelete(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Task</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
