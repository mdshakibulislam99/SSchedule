import React, { useState } from 'react';
import { Plus, Search, ChevronRight, CheckCircle2, Circle, Clock, Sparkles, Filter, X } from 'lucide-react';
import { Task, PriorityLevel, TaskType } from '../../types';

interface TasksScreenProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: Partial<Task>, autoPlan: boolean) => void;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({
  tasks,
  onSelectTask,
  onToggleTask,
  onAddTask,
}) => {
  const [filter, setFilter] = useState<'all' | 'today' | 'week'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New task form state (matching Screen 8 in reference)
  const [mode, setMode] = useState<'task' | 'goal'>('task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('2026-10-04T23:59');
  const [priority, setPriority] = useState<PriorityLevel>('high');
  const [courseCode, setCourseCode] = useState('CS101');
  const [addToPlan, setAddToPlan] = useState(true);

  const filteredTasks = tasks.filter((t) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        t.title.toLowerCase().includes(q) ||
        t.courseCode.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (filter === 'today') {
      return !t.completed && (t.scheduledTime?.includes('Today') || t.priority === 'high');
    }
    if (filter === 'week') {
      return !t.completed;
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
        courseCode,
        courseColor: courseColors[courseCode] || '#6366F1',
        type: 'assignment' as TaskType,
        deadline: new Date(deadline).toISOString(),
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
    <div className="w-full flex flex-col space-y-4 pb-6 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Mobile Bar: My Tasks & Search */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          My Tasks
        </h1>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-600/30 active:scale-95 transition-all"
            title="Add Task"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filter Tabs (Matching Screen 9: All / Today / This Week) */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold">
        {(['all', 'today', 'week'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-2 rounded-xl transition-all capitalize ${
              filter === tab
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab === 'week' ? 'This Week' : tab}
          </button>
        ))}
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by title or course..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Tasks List (Matching Screen 9 in reference image) */}
      <div className="space-y-2.5">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 rounded-3xl bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 p-6">
            <CheckCircle2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              No tasks found in this view.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
            >
              + Add a Task
            </button>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div
              key={task.id}
              onClick={() => onSelectTask(task)}
              className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Course Icon Tag */}
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                  style={{ backgroundColor: task.courseColor }}
                >
                  {task.courseCode}
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
                      {task.priority}
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

      {/* Add Task Modal Sheet (Matching Screen 8 in reference) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-slide-up max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Task</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4 py-4">
              {/* Segmented Control: Task vs Goal */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setMode('task')}
                  className={`py-2 rounded-lg transition-all ${
                    mode === 'task' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Task
                </button>
                <button
                  type="button"
                  onClick={() => setMode('goal')}
                  className={`py-2 rounded-lg transition-all ${
                    mode === 'goal' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Goal
                </button>
              </div>

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
                    Course Code
                  </label>
                  <select
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="CS101">CS101</option>
                    <option value="Math">Math</option>
                    <option value="Project">Project</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Deadline
                  </label>
                  <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
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
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    Add to AI Study Plan
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
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
              >
                Save Task
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
