import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  Trash2,
  X,
  Check,
  Send,
  Bot,
  Sparkles,
  RefreshCw,
  Clock,
  Pencil,
} from 'lucide-react';
import { Task, TaskCategory, ScheduleEvent, AIProviderConfig, AIActionProposal } from '../../types';
import { getLocalDateKey, parseNaturalDate, parseNaturalTime } from '../../utils/dates';
import { TaskComposer } from '../tasks/TaskComposer';
import { AIOrchestrator } from '../../services/aiOrchestrator';
import { INITIAL_AI_CONFIG } from '../../utils/storage';

interface TasksScreenProps {
  tasks: Task[];
  schedule: ScheduleEvent[];
  aiConfig?: AIProviderConfig;
  courseCodeFilter?: string;
  onClearCourseFilter?: () => void;
  onSelectTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: Partial<Task>, autoPlan: boolean) => void;
  onDeleteTask?: (taskId: string) => void;
  onExecuteAction?: (action: AIActionProposal) => void;
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
  aiConfig,
  courseCodeFilter,
  onClearCourseFilter,
  onSelectTask,
  onToggleTask,
  onAddTask,
  onDeleteTask,
  onExecuteAction,
  onComposerStateChange,
}) => {
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'overdue' | 'finished'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<'all' | TaskCategory>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFinishedExpanded, setIsFinishedExpanded] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [sortBy, setSortBy] = useState<'deadline' | 'priority' | 'quick' | 'title'>('deadline');
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollTabsLeft, setCanScrollTabsLeft] = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);

  // Quick AI Task Assistant state
  const [aiInput, setAiInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [proposedAction, setProposedAction] = useState<AIActionProposal | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const handleAskAIInTasks = async (queryText?: string) => {
    const textToSend = (queryText || aiInput).trim();
    if (!textToSend || isAiProcessing) return;

    setIsAiProcessing(true);
    setProposedAction(null);
    setAiFeedback(null);

    try {
      const configToUse = aiConfig || INITIAL_AI_CONFIG;

      const res = await AIOrchestrator.chatWithContext(
        textToSend,
        [],
        { tasks, schedule },
        configToUse
      );

      if (res.actions && res.actions.length > 0) {
        setProposedAction(res.actions[0]);
        setAiFeedback(res.text);
      } else {
        const detectedDate = parseNaturalDate(textToSend);
        const { startTime: pStart } = parseNaturalTime(textToSend);
        const cleanTitle = textToSend
          .replace(/^(add|create|remind me to|schedule)\s+(a\s+)?(task|todo|homework|assignment)?\s*/i, '')
          .replace(/\s+(tomorrow|today|on|at|due|by)\s+.*$/i, '')
          .trim() || 'Study Task';

        const fallbackAction: AIActionProposal = {
          id: `act-${Date.now()}`,
          type: 'create_task',
          title: cleanTitle,
          description: `Due: ${detectedDate}${pStart ? ` · Planned: ${pStart}` : ''} · High Priority`,
          details: {
            title: cleanTitle,
            deadline: detectedDate,
            scheduledDate: detectedDate,
            scheduledStartTime: pStart,
            priority: 'high',
            estimatedMinutes: 45,
          },
          status: 'pending',
        };
        setProposedAction(fallbackAction);
        setAiFeedback(`I prepared "${cleanTitle}" due on ${detectedDate}. Confirm below to add it to your tasks.`);
      }
      setAiInput('');
    } catch (err) {
      console.warn('AI Tasks Assistant error:', err);
      setAiFeedback('Could not process request. Please try rephrasing.');
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleApplyProposedAction = (action: AIActionProposal) => {
    if (onExecuteAction) {
      onExecuteAction(action);
    } else {
      if (action.type === 'create_task') {
        const d = action.details;
        onAddTask(
          {
            title: d.title || action.title,
            deadline: d.deadline || new Date().toISOString(),
            scheduledDate: d.scheduledDate,
            scheduledStartTime: d.scheduledStartTime,
            priority: d.priority || 'medium',
            estimatedMinutes: d.estimatedMinutes || 45,
            courseCode: d.courseCode,
          },
          true
        );
      }
    }
    setProposedAction(null);
    setAiFeedback(`Task "${action.title}" added successfully!`);
    setTimeout(() => setAiFeedback(null), 3500);
  };

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

  const sortedDueTasks = [...displayedDueTasks].sort((a, b) => {
    if (sortBy === 'deadline') {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    if (sortBy === 'priority') {
      const pWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
      return (pWeight[b.priority || 'medium'] || 2) - (pWeight[a.priority || 'medium'] || 2);
    }
    if (sortBy === 'quick') {
      return (a.estimatedMinutes || 30) - (b.estimatedMinutes || 30);
    }
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    }
    return 0;
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

      {/* Sort Controls Bar */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0 mr-0.5">Sort:</span>
          {[
            { id: 'deadline', label: '📅 Earliest Due' },
            { id: 'priority', label: '🚨 Priority' },
            { id: 'quick', label: '⚡ Quick Wins' },
            { id: 'title', label: '🔤 Title' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSortBy(s.id as any)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                sortBy === s.id
                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200/80 dark:border-indigo-800'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800 hover:border-slate-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="text-[11px] font-mono shrink-0 ml-2 text-slate-400">
          {sortedDueTasks.length} {sortedDueTasks.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* AI Task Assistant Bar (Chat with AI to add or edit tasks) */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-indigo-50/80 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-indigo-950/40 border border-emerald-100 dark:border-emerald-900/60 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
            <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>AI Task Assistant</span>
          </div>
          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800">
            Chat to Add & Edit Tasks
          </span>
        </div>

        {/* Input row */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskAIInTasks();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="e.g. 'Add Math homework due tomorrow at 3pm' or 'Change Assignment 2 priority to high'..."
              className="w-full pl-3 pr-8 py-2 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-800/80 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
            {aiInput && (
              <button
                type="button"
                onClick={() => setAiInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!aiInput.trim() || isAiProcessing}
            className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {isAiProcessing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Add with AI</span>
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => handleAskAIInTasks('Add Math homework due tomorrow at 3pm')}
            className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-emerald-100 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 font-medium hover:border-emerald-300 transition-colors shrink-0 cursor-pointer"
          >
            📋 Math Homework Tomorrow
          </button>
          <button
            type="button"
            onClick={() => handleAskAIInTasks('Add CS101 lab report due Friday')}
            className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-emerald-100 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 font-medium hover:border-emerald-300 transition-colors shrink-0 cursor-pointer"
          >
            ⚡ CS101 Lab due Friday
          </button>
          <button
            type="button"
            onClick={() => handleAskAIInTasks('Schedule 45 min exam prep task on Monday')}
            className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-emerald-100 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 font-medium hover:border-emerald-300 transition-colors shrink-0 cursor-pointer"
          >
            🎯 45m Exam Prep Monday
          </button>
        </div>

        {/* Action Proposal Response Card */}
        {proposedAction && (
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 shadow-sm space-y-2 animate-fade-in mt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                {proposedAction.type === 'edit_task' ? 'Proposed Task Update' : 'Proposed Task'}
              </span>
              <button
                type="button"
                onClick={() => setProposedAction(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {proposedAction.title}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {proposedAction.description}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleApplyProposedAction(proposedAction)}
                className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{proposedAction.type === 'edit_task' ? 'Apply Update' : 'Confirm & Add Task'}</span>
              </button>
              <button
                type="button"
                onClick={() => setProposedAction(null)}
                className="py-1.5 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Feedback message */}
        {aiFeedback && !proposedAction && (
          <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium px-1 animate-fade-in">
            {aiFeedback}
          </div>
        )}
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
          {sortedDueTasks.length === 0 ? (
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
            sortedDueTasks.map((task) => (
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
                    <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
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
                      {task.estimatedMinutes && (
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {task.estimatedMinutes}m
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
