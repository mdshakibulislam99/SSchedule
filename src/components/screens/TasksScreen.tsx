import React, { useState } from 'react';
import { Plus, Search, ChevronRight, CheckCircle2, Circle } from 'lucide-react';
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
  onComposerStateChange?: (isOpen: boolean) => void;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({
  tasks,
  schedule,
  courseCodeFilter,
  onClearCourseFilter,
  onSelectTask,
  onToggleTask,
  onAddTask,
  onComposerStateChange,
}) => {
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'overdue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<'all' | TaskCategory>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Task creation lives in the shared <TaskComposer />, reused by course workspaces.

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

  const filteredTasks = tasks.filter((t) => {
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
    if (filter === 'today') {
      return !t.completed && isTaskForToday(t);
    }
    if (filter === 'week') {
      return !t.completed;
    }
    if (filter === 'overdue') {
      return !t.completed && new Date(t.deadline).getTime() < Date.now();
    }
    return true;
  });

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col space-y-5 pb-8 animate-fade-in text-slate-900 dark:text-white">
      {/* Task workspace header */}
      <div className="flex items-start justify-between gap-4 pt-2">
        <div>
          <p className="text-mobile-micro uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Tasks</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {courseCodeFilter ? `${courseCodeFilter} tasks` : 'My tasks'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Academic, personal, and recurring work in one place.</p>
        </div>

        {courseCodeFilter && (
          <button
            onClick={onClearCourseFilter}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            View all courses
          </button>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-sm active:scale-95 transition-all"
            aria-label="Create a task"
            title="Create a task"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Task views */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold">
        {(['all', 'today', 'week', 'overdue'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-2 rounded-xl transition-all capitalize ${
              filter === tab
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'today' ? 'Today' : tab === 'week' ? 'This week' : 'Overdue'}
          </button>
        ))}
      </div>

      <select
        aria-label="Filter tasks by area"
        value={areaFilter}
        onChange={(e) => setAreaFilter(e.target.value as 'all' | TaskCategory)}
        className="self-start px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
      >
        <option value="all">All areas</option>
        <option value="academic">Academic</option>
        <option value="personal">Personal</option>
        <option value="health">Health</option>
        <option value="admin">Admin</option>
        <option value="work">Work</option>
        <option value="other">Other</option>
      </select>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by title or course..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Tasks List (Matching Screen 9 in reference image) */}
      <div className="space-y-2.5">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 rounded-3xl bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 p-6">
            <CheckCircle2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              No tasks match this view.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
            >
              Create a task
            </button>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => onSelectTask(task)}
              className="p-4 rounded-[1.25rem] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:-translate-y-0.5 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all shadow-[0_8px_24px_rgba(15,23,42,0.04)] cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Course Icon Tag */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                  style={{ backgroundColor: task.courseColor }}
                >
                    {task.courseCode || 'Personal'}
                </div>

                {/* Details */}
                <div className="min-w-0">
                  <div
                    className={`text-sm font-bold truncate ${
                      task.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {task.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span className="capitalize font-semibold text-[11px] text-rose-500">
                      {task.priority} · {task.category || (task.courseCode ? 'academic' : 'personal')}
                    </span>
                    <span>·</span>
                    <span>
                      Due {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                    {task.progress > 0 && !task.completed && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-indigo-500 font-semibold">{task.progress}%</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          ))
        )}
      </div>

      {filter === 'today' && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Calendar commitments</h2>
            <span className="text-[11px] font-semibold text-slate-400">Today’s plan</span>
          </div>
          {schedule.filter((event) => event.date === todayKey).length > 0 ? (
            <div className="space-y-2">
              {schedule
                .filter((event) => event.date === todayKey)
                .map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
                  >
                    <span className="w-1.5 h-9 rounded-full" style={{ backgroundColor: event.color }} />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{event.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {event.startTime} – {event.endTime}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              No calendar commitments planned for today.
            </div>
          )}
        </section>
      )}

      {/* Full-page task composer (shared with course workspaces) */}
      <TaskComposer
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={onAddTask}
        onOpenChange={onComposerStateChange}
        heading="Create a task"
        subheading="Task workspace"
        cancelLabel="Back to tasks"
      />
    </div>
  );
};
