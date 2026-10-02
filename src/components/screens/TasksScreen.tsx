import React, { useEffect, useState } from 'react';
import { Plus, Search, ChevronRight, CheckCircle2, Circle, Clock, Sparkles, Filter, X } from 'lucide-react';
import { Task, PriorityLevel, TaskType, TaskCategory, TaskRecurrence, ScheduleEvent } from '../../types';
import { getLocalDateKey } from '../../utils/dates';

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

  // New task form state (matching Screen 8 in reference)
  const [category, setCategory] = useState<TaskCategory>('academic');
  const [taskType, setTaskType] = useState<TaskType>('assignment');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('2026-10-04');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledStartTime, setScheduledStartTime] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState('30');
  const [priority, setPriority] = useState<PriorityLevel>('high');
  const [courseCode, setCourseCode] = useState('');
  const [addToPlan, setAddToPlan] = useState(true);

  useEffect(() => {
    onComposerStateChange?.(isAddModalOpen);
    return () => onComposerStateChange?.(false);
  }, [isAddModalOpen, onComposerStateChange]);

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

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const courseColors: Record<string, string> = {
      CS101: '#EF4444',
      Math: '#F59E0B',
      Project: '#10B981',
      Other: '#6366F1',
    };

    onAddTask(
      {
        title: title.trim(),
        description: description.trim(),
          courseCode: courseCode.trim() || undefined,
          courseColor: courseColors[courseCode] || '#64748B',
          category,
          type: taskType,
        deadline: new Date(`${deadline}T23:59:59`).toISOString(),
        scheduledDate: scheduledDate || undefined,
        scheduledStartTime: scheduledStartTime || undefined,
        recurrence,
        reminder: {
          enabled: reminderEnabled,
          minutesBefore: Number(reminderMinutes) || 30,
        },
        estimatedMinutes: 45,
        priority,
        progress: 0,
        completed: false,
        subtasks: [],
      },
      addToPlan
    );

    setTitle('');
    setDescription('');
    setIsAddModalOpen(false);
  };

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

      {/* Full-page task composer */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-50 dark:bg-slate-950 animate-fade-in">
          <div
            className="relative z-[61] w-full h-full bg-slate-50 dark:bg-slate-950 p-5 sm:p-8 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between pb-5 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-mobile-micro uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Task workspace</p>
                  <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Create a task</h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-white dark:hover:bg-slate-900 transition-colors"
                >
                  Back to tasks
                </button>
              </div>

              <form onSubmit={handleSaveTask} className="space-y-5 py-6">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS101 Assignment 2"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  placeholder="Write a short description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Area
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TaskCategory)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="academic">Academic</option>
                    <option value="personal">Personal</option>
                    <option value="health">Health</option>
                    <option value="admin">Admin</option>
                    <option value="work">Work</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Task type
                  </label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as TaskType)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="assignment">Assignment</option>
                    <option value="exam">Exam</option>
                    <option value="project">Project</option>
                    <option value="reading">Reading</option>
                    <option value="habit">Habit</option>
                    <option value="personal">Personal task</option>
                    <option value="admin">Admin task</option>
                    <option value="health">Health task</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Course Code (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CS101"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Task schedule</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Set the deadline, planned time, repeats, and reminders.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Study date
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                      Planned time
                    </label>
                    <input
                      type="time"
                      value={scheduledStartTime}
                      onChange={(e) => setScheduledStartTime(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Repeat pattern
                  </label>
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Every day</option>
                    <option value="weekdays">Every weekday</option>
                    <option value="weekly">Every week</option>
                  </select>
                </div>

                <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span>Remind me before the planned time</span>
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
                  />
                </label>

                {reminderEnabled && (
                  <select
                    value={reminderMinutes}
                    onChange={(e) => setReminderMinutes(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="10">10 minutes before</option>
                    <option value="30">30 minutes before</option>
                    <option value="60">1 hour before</option>
                    <option value="1440">1 day before</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Priority
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                  {(['high', 'medium', 'low'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`py-2 rounded-xl border capitalize transition-all ${
                        priority === p
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add to Study Plan Toggle */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Let StudyAI suggest steps
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={addToPlan}
                  onChange={(e) => setAddToPlan(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm shadow-sm active:scale-[0.98] transition-all"
              >
                Save Task
              </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
