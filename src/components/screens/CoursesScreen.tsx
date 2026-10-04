import React, { useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Plus,
  Search,
  Trash2,
  X,
  Sparkles,
  RefreshCw,
  Check,
  Bot,
  Send,
  Layers,
  CheckCircle2,
  ListPlus,
  GraduationCap,
  FileText,
} from 'lucide-react';
import { Course, CourseModule, CourseResource, Task, AIProviderConfig } from '../../types';
import { computeCourseProgress, getCourseResources, getCourseTasks } from '../../utils/courses';
import { INITIAL_AI_CONFIG } from '../../utils/storage';
import { AIOrchestrator } from '../../services/aiOrchestrator';

interface CoursesScreenProps {
  courses: Course[];
  tasks: Task[];
  resources: CourseResource[];
  aiConfig?: AIProviderConfig;
  onOpenCourse: (courseId: string, initialTab?: 'overview' | 'tasks' | 'resources' | 'ai' | 'progress') => void;
  onCreateCourse: (data: {
    name: string;
    code: string;
    color: string;
    professor?: string;
    description?: string;
    coverEmoji?: string;
    objectives?: string[];
    modules?: CourseModule[];
    initialTasks?: Array<{ title: string; priority?: 'low' | 'medium' | 'high'; estimatedMinutes?: number }>;
  }) => void;
  onDeleteCourse?: (courseId: string, deleteAssociatedData?: boolean) => void;
}

const COLOR_CHOICES = ['#EF4444', '#F59E0B', '#10B981', '#6366F1', '#0EA5E9', '#EC4899', '#8B5CF6'];
const EMOJI_CHOICES = ['📘', '💻', '📐', '🔬', '📊', '🧠', '⚖️', '🎨', '🧪', '🏥', '🌎', '💡', '🏛️', '🚀'];

export const CoursesScreen: React.FC<CoursesScreenProps> = ({
  courses,
  tasks,
  resources,
  aiConfig,
  onOpenCourse,
  onCreateCourse,
  onDeleteCourse,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [deleteAssociatedData, setDeleteAssociatedData] = useState(true);

  // Form state for New Course
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState(COLOR_CHOICES[3]);
  const [professor, setProfessor] = useState('');
  const [coverEmoji, setCoverEmoji] = useState('📘');
  const [description, setDescription] = useState('');
  const [objectives, setObjectives] = useState<string[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [initialTasks, setInitialTasks] = useState<Array<{ title: string; priority: 'low' | 'medium' | 'high'; estimatedMinutes: number }>>([]);
  const [createStarterTasksChecked, setCreateStarterTasksChecked] = useState(true);

  // Custom module addition
  const [newModuleName, setNewModuleName] = useState('');
  const [showAddModuleInput, setShowAddModuleInput] = useState(false);

  // AI Course Assistant inside modal
  const [aiCourseInput, setAiCourseInput] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);

  const activeCourses = courses.filter((c) => !c.isArchived);

  const filteredCourses = activeCourses.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.professor && c.professor.toLowerCase().includes(q))
    );
  });

  const handleResetForm = () => {
    setName('');
    setCode('');
    setProfessor('');
    setColor(COLOR_CHOICES[3]);
    setCoverEmoji('📘');
    setDescription('');
    setObjectives([]);
    setModules([]);
    setInitialTasks([]);
    setAiCourseInput('');
    setAiStatus(null);
    setNewModuleName('');
    setShowAddModuleInput(false);
  };

  const handleGenerateWithAI = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || aiCourseInput).trim();
    if (!promptToSend || isAiGenerating) return;

    setIsAiGenerating(true);
    setAiStatus(null);

    try {
      const configToUse = aiConfig || INITIAL_AI_CONFIG;
      const result = await AIOrchestrator.parseOrGenerateCourse(promptToSend, configToUse);

      setName(result.name);
      setCode(result.code);
      setColor(result.color || COLOR_CHOICES[3]);
      setCoverEmoji(result.coverEmoji || '📘');
      if (result.professor) setProfessor(result.professor);
      if (result.description) setDescription(result.description);
      if (result.objectives && result.objectives.length > 0) setObjectives(result.objectives);
      if (result.modules && result.modules.length > 0) setModules(result.modules);
      if (result.initialTasks && result.initialTasks.length > 0) {
        setInitialTasks(result.initialTasks);
        setCreateStarterTasksChecked(true);
      }
      setAiStatus(result.aiSummary || `Configured ${result.code} · ${result.name}`);
      setAiCourseInput('');
    } catch (e) {
      console.warn('AI course gen error:', e);
      setAiStatus('Failed to generate course with AI. You can still complete details manually below.');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleAddModule = () => {
    if (!newModuleName.trim()) return;
    const newMod: CourseModule = {
      id: `mod-${Date.now()}`,
      title: newModuleName.trim(),
      order: modules.length + 1,
      completed: false,
    };
    setModules((prev) => [...prev, newMod]);
    setNewModuleName('');
    setShowAddModuleInput(false);
  };

  const handleRemoveModule = (id: string) => {
    setModules((prev) => prev.filter((m) => m.id !== id));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    onCreateCourse({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      color,
      professor: professor.trim() || undefined,
      description: description.trim() || undefined,
      coverEmoji,
      objectives: objectives.length > 0 ? objectives : undefined,
      modules: modules.length > 0 ? modules : undefined,
      initialTasks: createStarterTasksChecked && initialTasks.length > 0 ? initialTasks : undefined,
    });
    handleResetForm();
    setIsModalOpen(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-5 pb-8 animate-fade-in text-slate-900 dark:text-white">
      {/* Header (Note: Main courses list has NO AI bar, as requested) */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Courses</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {activeCourses.length} active {activeCourses.length === 1 ? 'workspace' : 'workspaces'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeCourses.length > 2 && (
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search courses..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <button
            onClick={() => {
              handleResetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New course</span>
          </button>
        </div>
      </header>

      {/* Courses Content */}
      {activeCourses.length === 0 ? (
        <div className="p-12 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/40">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">No courses yet</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Create your first course workspace to organize syllabus milestones, assignments, and study materials.
          </p>
          <button
            onClick={() => {
              handleResetForm();
              setIsModalOpen(true);
            }}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Course</span>
          </button>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
          <p className="text-xs font-semibold text-slate-500">No courses match &ldquo;{searchQuery}&rdquo;</p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          {filteredCourses.map((course) => {
            const progress = computeCourseProgress(course, tasks, resources);

            return (
              <div
                key={course.id}
                onClick={() => onOpenCourse(course.id)}
                className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3 p-3.5 pr-3">
                  {/* Course emoji tile */}
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 transition-transform group-hover:scale-105"
                    style={{ backgroundColor: `${course.color}15` }}
                  >
                    {course.coverEmoji || '📘'}
                  </div>

                  {/* Identity */}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {course.name}
                    </h2>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                      <span
                        className="font-extrabold uppercase tracking-wide font-mono shrink-0"
                        style={{ color: course.color }}
                      >
                        {course.code}
                      </span>
                      {course.term && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="truncate">{course.term}</span>
                        </>
                      )}
                      {course.professor && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="truncate">{course.professor}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress summary */}
                  <div
                    className="flex flex-col items-end shrink-0"
                    title={`${progress.tasksCompleted} of ${progress.tasksTotal} tasks done`}
                  >
                    <span className="text-sm font-extrabold font-mono tabular-nums" style={{ color: course.color }}>
                      {progress.percent}%
                    </span>
                    <span className="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
                      {progress.tasksCompleted}/{progress.tasksTotal} tasks
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {onDeleteCourse && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCourseToDelete(course);
                          setDeleteAssociatedData(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                        title="Delete course"
                        aria-label={`Delete course ${course.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-all" />
                  </div>
                </div>

                {/* Slim progress accent along the bottom edge */}
                <div className="h-1 w-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${progress.percent}%`, backgroundColor: course.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Page New Course Modal with Integrated AI Assistant */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-50 dark:bg-slate-950 animate-fade-in">
          {/* Header */}
          <header className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                handleResetForm();
                setIsModalOpen(false);
              }}
              className="flex items-center gap-1 p-2 -ml-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">New course</h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800">
                <Sparkles className="w-3 h-3" />
                <span>AI Powered</span>
              </span>
            </div>
            <button
              type="submit"
              form="new-course-form"
              disabled={!name.trim() || !code.trim()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              Create
            </button>
          </header>

          {/* Form body */}
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-lg mx-auto px-4 sm:px-6 py-6 pb-20 space-y-6">

              {/* ✨ AI Course Assistant Box inside + New Course */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-indigo-50/90 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Chat with AI to Build Course</span>
                  </div>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full border border-indigo-200/60 dark:border-indigo-800">
                    Auto-Fills Details & Modules
                  </span>
                </div>

                {/* AI Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleGenerateWithAI();
                  }}
                  className="flex items-center gap-2"
                >
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={aiCourseInput}
                      onChange={(e) => setAiCourseInput(e.target.value)}
                      placeholder="e.g. 'CS 301 Machine Learning with Prof. Alan Turing, red color, 🤖 icon'..."
                      className="w-full pl-3 pr-8 py-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-indigo-800/80 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    />
                    {aiCourseInput && (
                      <button
                        type="button"
                        onClick={() => setAiCourseInput('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={!aiCourseInput.trim() || isAiGenerating}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all shrink-0 cursor-pointer"
                  >
                    {isAiGenerating ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Ask AI</span>
                  </button>
                </form>

                {/* AI Quick Suggestion Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-[11px]">
                  {[
                    { label: '💻 CS301 Machine Learning', prompt: 'CS 301 Machine Learning with Prof. Alan Turing, red color, 🤖 icon' },
                    { label: '📐 MATH201 Linear Algebra', prompt: 'MATH 201 Linear Algebra and Matrix Theory with Dr. Gauss' },
                    { label: '🔬 BIO101 Molecular Biology', prompt: 'BIO 101 Molecular Biology and Genetics with Dr. Franklin' },
                    { label: '📊 ECON101 Microeconomics', prompt: 'ECON 101 Principles of Microeconomics with Prof. Keynes' },
                    { label: '🧠 PSYCH201 Cognitive Science', prompt: 'PSYCH 201 Cognitive Neuroscience and Brain Systems' },
                    { label: '⚖️ GOV101 Constitutional Law', prompt: 'GOV 101 Constitutional Law and Civil Liberties' },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleGenerateWithAI(chip.prompt)}
                      disabled={isAiGenerating}
                      className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium hover:border-indigo-300 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* AI Status / Confirmation Banner */}
                {aiStatus && (
                  <div className="p-3 rounded-xl bg-indigo-100/70 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2 animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold">{aiStatus}</p>
                      <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                        You can customize fields below or chat again in the box above to refine.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Live Preview Card */}
              <div
                className="rounded-[1.5rem] p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] transition-all duration-300"
                style={{ backgroundColor: color }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shrink-0">
                    {coverEmoji || '📘'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex px-2 py-0.5 rounded-md bg-white/20 text-xs font-extrabold tracking-wide font-mono">
                        {code.trim().toUpperCase() || 'CODE'}
                      </span>
                      {modules.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/20 text-white">
                          <Layers className="w-3 h-3" />
                          <span>{modules.length} {modules.length === 1 ? 'module' : 'modules'}</span>
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-extrabold truncate mt-1">{name.trim() || 'Course name'}</h3>
                    {professor.trim() && (
                      <p className="text-xs text-white/90 truncate mt-0.5">Prof. {professor.trim()}</p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-white/75 mt-3">Preview · this is how your course card and workspace will appear.</p>
              </div>

              {/* Form Controls */}
              <form
                id="new-course-form"
                onSubmit={handleCreate}
                className="space-y-6"
              >
                {/* Basic Info Card */}
                <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Course Information</h4>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      Course name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Machine Learning & Neural Networks"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                        Course code <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. CS301"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm uppercase focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                        Professor / Instructor
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Prof. Alan Turing"
                        value={professor}
                        onChange={(e) => setProfessor(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      Description & Scope
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Core curriculum covering supervised algorithms, deep architectures, and loss optimization."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Icon / Emoji Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      Cover Icon
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {EMOJI_CHOICES.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setCoverEmoji(em)}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all cursor-pointer ${
                            coverEmoji === em
                              ? 'bg-indigo-100 dark:bg-indigo-950 ring-2 ring-indigo-500 scale-110'
                              : 'bg-slate-100 dark:bg-slate-800 hover:scale-105'
                          }`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                      Theme Colour
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      {COLOR_CHOICES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={`w-9 h-9 rounded-full transition-transform cursor-pointer ${
                            color === c
                              ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900 scale-110'
                              : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: c }}
                          aria-label={`Colour ${c}`}
                        />
                      ))}
                    </div>
                  </div>
                </section>

                {/* Modules & Syllabus Units (AI Populated) */}
                <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Course Modules & Units</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Break your course into weekly units or topic milestones.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddModuleInput(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Module</span>
                    </button>
                  </div>

                  {showAddModuleInput && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 animate-fade-in">
                      <input
                        type="text"
                        placeholder="e.g. Unit 4: Natural Language Processing"
                        value={newModuleName}
                        onChange={(e) => setNewModuleName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddModule();
                          }
                        }}
                        autoFocus
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddModule}
                        disabled={!newModuleName.trim()}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewModuleName('');
                          setShowAddModuleInput(false);
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {modules.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                      <p className="text-xs text-slate-500">No modules added yet.</p>
                      <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1 font-medium">
                        Tip: Use the AI prompt above to auto-generate weekly syllabus modules!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {modules.map((m, idx) => (
                        <div
                          key={m.id || idx}
                          className="flex items-start justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                              <span className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-mono shrink-0">
                                {idx + 1}
                              </span>
                              <span className="truncate">{m.title}</span>
                            </div>
                            {m.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-6">
                                {m.description}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveModule(m.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                            title="Remove module"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Initial Starter Tasks Checkbox (AI Populated) */}
                {initialTasks.length > 0 && (
                  <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={createStarterTasksChecked}
                        onChange={(e) => setCreateStarterTasksChecked(e.target.checked)}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-slate-900 dark:text-white block">
                          Create {initialTasks.length} starter tasks in my Task list
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                          StudyAI recommended these starter tasks for {code.trim().toUpperCase() || 'this course'}.
                        </span>
                      </div>
                    </label>

                    {createStarterTasksChecked && (
                      <div className="space-y-1.5 pl-6 pt-1">
                        {initialTasks.map((t, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs border border-slate-200/60 dark:border-slate-800"
                          >
                            <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                              📋 {t.title}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 shrink-0">
                              {t.priority}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={!name.trim() || !code.trim()}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all cursor-pointer"
                >
                  Create course
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Course Confirmation Modal */}
      {courseToDelete && (() => {
        const linkedTasks = getCourseTasks(courseToDelete, tasks);
        const linkedResources = getCourseResources(courseToDelete, resources);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Delete course</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Remove course workspace</p>
                </div>
              </div>

              {/* Course Identity Card */}
              <div
                className="p-3.5 rounded-xl text-white flex items-center gap-2.5 shadow-xs"
                style={{ backgroundColor: courseToDelete.color }}
              >
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg shrink-0">
                  {courseToDelete.coverEmoji || '📘'}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white/20 uppercase font-mono">
                    {courseToDelete.code}
                  </span>
                  <p className="font-bold text-xs truncate mt-0.5">{courseToDelete.name}</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to delete <b className="text-slate-900 dark:text-white">{courseToDelete.name}</b>?
              </p>

              {(linkedTasks.length > 0 || linkedResources.length > 0) && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteAssociatedData}
                    onChange={(e) => setDeleteAssociatedData(e.target.checked)}
                    className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Delete associated tasks & study materials
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 block mt-0.5">
                      {linkedTasks.length} task{linkedTasks.length === 1 ? '' : 's'} and {linkedResources.length} reading{linkedResources.length === 1 ? '' : 's'}. If unchecked, tasks are kept as personal tasks.
                    </span>
                  </div>
                </label>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCourseToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (courseToDelete && onDeleteCourse) {
                      onDeleteCourse(courseToDelete.id, deleteAssociatedData);
                    }
                    setCourseToDelete(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Course</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
