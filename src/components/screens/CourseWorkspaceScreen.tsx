import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Circle,
  FileText,
  FilePlus2,
  FolderOpen,
  Layers,
  PenLine,
  Plus,
  Route,
  Sparkles,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { Course, CourseProgress, CourseResource, ScheduleEvent, StudyFile, Task } from '../../types';
import { TaskComposer } from '../tasks/TaskComposer';
import { saveFileBlob } from '../../utils/fileStorage';
import { FileViewer } from '../course/FileViewer';

/** Which panel of the "Add resource" flow is showing. */
type AddStep = 'choose' | 'files' | 'manual' | 'review';

/** A resource staged for confirmation before it is saved. */
interface ReviewDraft {
  title: string;
  type: CourseResource['type'];
  content: string;
  fileName: string;
  fileSize: string;
  /** Present only for a freshly uploaded file (also saved to the Files tab). */
  file?: File;
  /** Base64 data URL of the bytes, when the file is small enough to keep. */
  dataUrl?: string;
  fileStorageKey?: string;
  /** MIME type reported by the browser for this file. */
  mime?: string;
}

const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'log', 'json'];

/** Map a filename to a CourseResource type. */
function typeFromFilename(name: string): CourseResource['type'] {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx' || ext === 'rtf') return 'docx';
  if (ext === 'ppt' || ext === 'pptx' || ext === 'key') return 'slide';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'link';
  if (ext === 'url' || ext === 'webloc') return 'link';
  return 'text';
}

/** Map a filename to a StudyFile type (for the Files tab). */
function studyFileType(name: string): StudyFile['type'] {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'rtf', 'ppt', 'pptx', 'odt'].includes(ext)) return 'docx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  return 'text';
}

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.includes((name.split('.').pop() || '').toLowerCase());
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function estimateMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Readable placeholder body for formats we cannot extract text from
 * (PDF, DOCX, slides, video…). Keeps the reader useful: file facts,
 * AI summary and key topics when available.
 */
function buildFileStub(opts: {
  title: string;
  type: CourseResource['type'];
  size?: string;
  summary?: string;
  topics?: string[];
}): string {
  const lines: string[] = [
    `# ${opts.title}`,
    '',
    `**${opts.type.toUpperCase()}**${opts.size ? ` · ${opts.size}` : ''}`,
    '',
    '## Overview',
    opts.summary ||
      'This file is stored in your course library. Open the Files tab to view the original document.',
    '',
  ];
  if (opts.topics && opts.topics.length > 0) {
    lines.push('## Key topics', ...opts.topics.map((t) => `- ${t}`), '');
  }
  lines.push('> Add your own notes below to turn this into a full reading.');
  return lines.join('\n');
}

interface CourseWorkspaceScreenProps {
  course: Course;
  tasks: Task[];
  files: StudyFile[];
  schedule: ScheduleEvent[];
  resources: CourseResource[];
  progress: CourseProgress;
  onBack: () => void;
  onSelectTask: (task: Task) => void;
  onOpenFiles: () => void;
  onOpenCalendar: () => void;
  onAddPlanStep: (courseId: string, step: string) => void;
  onToggleModule: (courseId: string, moduleId: string) => void;
  onOpenResource: (resource: CourseResource) => void;
  onOpenTutor: () => void;
  onAddResource: (data: Partial<CourseResource>) => void;
  /** Registers an uploaded file in the Files tab as well as the course library. */
  onUploadFile?: (file: Partial<StudyFile>) => void;
  /** Creates a task from inside the course — no detour to the Tasks tab. */
  onAddTask: (taskData: Partial<Task>, autoPlan: boolean) => void;
  /** Toggles completion directly from the course task list. */
  onToggleTask: (taskId: string) => void;
  /** Jumps to the Tasks tab filtered to this course (secondary action). */
  onViewAllTasks: (courseCode: string) => void;
}

type WorkspaceTab = 'overview' | 'tasks' | 'resources' | 'ai' | 'progress';

export const CourseWorkspaceScreen: React.FC<CourseWorkspaceScreenProps> = ({
  course,
  tasks,
  files,
  schedule,
  resources,
  progress,
  onBack,
  onSelectTask,
  onOpenFiles,
  onOpenCalendar,
  onAddPlanStep,
  onToggleModule,
  onOpenResource,
  onOpenTutor,
  onAddResource,
  onUploadFile,
  onAddTask,
  onToggleTask,
  onViewAllTasks,
}) => {
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [newPlanStep, setNewPlanStep] = useState('');
  const [isAddResourceOpen, setIsAddResourceOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [resTitle, setResTitle] = useState('');
  const [resContent, setResContent] = useState('');
  const [resType, setResType] = useState<CourseResource['type']>('text');
  const [addStep, setAddStep] = useState<AddStep>('choose');
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
    const [isReviewPreviewOpen, setIsReviewPreviewOpen] = useState(false);
  const [reviewBack, setReviewBack] = useState<'choose' | 'files'>('choose');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const courseTasks = tasks.filter((task) => task.courseCode === course.code);
  const doneCount = courseTasks.filter((task) => task.completed).length;
  const courseFiles = files.filter(
    (file) => file.courseCode === course.code || course.materialsFileIds.includes(file.id)
  );
  const courseEvents = schedule.filter((event) => event.courseCode === course.code);

  const handleAddPlanStep = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPlanStep.trim()) return;
    onAddPlanStep(course.id, newPlanStep.trim());
    setNewPlanStep('');
  };

  const handleAddResource = (event: React.FormEvent) => {
    event.preventDefault();
    if (!resTitle.trim()) return;
    onAddResource({
      title: resTitle.trim(),
      type: resType,
      content: resContent.trim() || `# ${resTitle.trim()}\n\nAdd your notes, summary, or key ideas for this resource here.`,
      estimatedReadMinutes: estimateMinutes(resContent.trim()),
      tags: ['notes'],
    });
    setUploadNotice(`${resTitle.trim()} added to ${course.code}`);
    window.setTimeout(() => setUploadNotice(null), 3500);
    setResTitle('');
    setResContent('');
    setResType('text');
    setAddStep('choose');
    setIsAddResourceOpen(false);
  };

  /** Reset the flow and open the source chooser. */
  const openAddResource = () => {
    setAddStep('choose');
    setReview(null);
    setReviewBack('choose');
    setResTitle('');
    setResContent('');
    setResType('text');
    setIsAddResourceOpen(true);
  };

  /** Step 1a: a brand-new file was chosen from disk. */
  const handleFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again
    if (!file) return;

    const type = typeFromFilename(file.name);
    const fileSize = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    const mime = file.type || undefined;
    const fileStorageKey = await saveFileBlob(file, `file-${crypto.randomUUID()}`);

    onUploadFile?.({
      name: file.name,
      size: fileSize,
      type: studyFileType(file.name),
      courseCode: course.code,
      fileStorageKey,
    });
    onAddResource({
      title: file.name,
      type,
      content: '',
      fileName: file.name,
      mime,
      fileStorageKey,
      estimatedReadMinutes: 1,
      tags: [],
    });
    setUploadNotice(`${file.name} added to ${course.code}`);
    window.setTimeout(() => setUploadNotice(null), 3500);
    setIsAddResourceOpen(false);
    setAddStep('choose');
  };

  /** Step 1b: an already-uploaded file was picked from the library. */
  const handlePickExisting = (f: StudyFile) => {
    const title = stripExtension(f.name);
    const type = typeFromFilename(f.name);
    setReview({
      title,
      type,
      content: buildFileStub({
        title,
        type,
        size: f.size,
        summary: f.summary,
        topics: f.keyTopics,
      }),
      fileName: f.name,
      fileSize: f.size,
      dataUrl: f.dataUrl,
      fileStorageKey: f.fileStorageKey,
      mime: undefined,
    });
    setReviewBack('files');
    setAddStep('review');
  };

  /** Step 2: confirm → create the resource so it shows up ready to read. */
  const handleSaveReview = (event: React.FormEvent) => {
    event.preventDefault();
    if (!review || !review.title.trim()) return;

    // A fresh upload is also stored in the Files tab so the original is kept.
    if (review.file) {
      onUploadFile?.({
        name: review.fileName,
        size: review.fileSize,
        type: studyFileType(review.fileName),
        courseCode: course.code,
        summary: `Added to ${course.code} as a readable resource.`,
        keyTopics: [course.code, 'Course library'],
        dataUrl: review.dataUrl,
        fileStorageKey: review.fileStorageKey,
      });
    }

    onAddResource({
      title: review.title.trim(),
      type: review.type,
      content: review.content,
      fileName: review.fileName,
      mime: review.mime,
      fileData: review.dataUrl,
      fileStorageKey: review.fileStorageKey,
      estimatedReadMinutes: estimateMinutes(review.content),
      tags: ['file', review.type],
    });

    setUploadNotice(`${review.fileName} added to ${course.code}`);
    window.setTimeout(() => setUploadNotice(null), 3500);

    setReview(null);
    setAddStep('choose');
    setIsAddResourceOpen(false);
  };

  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'resources', label: 'Resources' },
    { id: 'ai', label: 'AI Learn' },
    { id: 'progress', label: 'Progress' },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-5 pb-8 animate-fade-in text-slate-900 dark:text-white">
      <header className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 p-2 -ml-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Courses</span>
        </button>
        <span className="text-sm font-bold">Course workspace</span>
        <div className="w-16" />
      </header>

      {uploadNotice && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 animate-fade-in">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">✓</span>
          {uploadNotice}
        </div>
      )}

      <section
        className="rounded-[1.75rem] p-6 sm:p-8 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
        style={{ backgroundColor: course.color }}
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex px-2.5 py-1 rounded-lg bg-white/20 text-xs font-extrabold tracking-wide">
                {course.code}
              </span>
              <span className="text-lg">{course.coverEmoji || '📘'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-3">{course.name}</h1>
            <p className="text-sm text-white/80 mt-1">
              {course.term || 'Current term'}
              {course.professor ? ` · ${course.professor}` : ''}
              {course.credits ? ` · ${course.credits} credits` : ''}
            </p>
          </div>
          <div className="min-w-[160px]">
            <div className="flex items-center justify-between text-xs font-semibold text-white/80">
              <span>Course progress</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-black/20 overflow-hidden mt-2">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="text-[11px] text-white/70 mt-2">
              {progress.tasksCompleted}/{progress.tasksTotal} tasks · {progress.resourcesRead}/{progress.resourcesTotal} read
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[80px] py-2 rounded-xl transition-all ${
              tab === t.id ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-bold">About this course</h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {course.description || 'No description added yet.'}
            </p>
            {course.objectives.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Learning objectives</h3>
                </div>
                <ul className="space-y-1.5">
                  {course.objectives.map((obj, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold">Modules</h2>
              </div>
              <span className="text-[11px] text-slate-400">
                {progress.modulesCompleted}/{progress.modulesTotal} done
              </span>
            </div>
            {course.modules.length === 0 ? (
              <p className="text-xs text-slate-500">No modules defined for this course.</p>
            ) : (
              <div className="space-y-2">
                {[...course.modules].sort((a, b) => a.order - b.order).map((mod) => (
                  <button
                    key={mod.id}
                    onClick={() => onToggleModule(course.id, mod.id)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {mod.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${mod.completed ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
                        {mod.order}. {mod.title}
                      </p>
                      {mod.description && <p className="text-[11px] text-slate-500 mt-0.5">{mod.description}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-rose-600" />
              <h2 className="text-sm font-bold">Study plan</h2>
            </div>
            {course.studyPlan.length === 0 ? (
              <p className="text-xs text-slate-500">No milestones yet. Add your first step below.</p>
            ) : (
              <ul className="space-y-1.5">
                {course.studyPlan.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                    <span className="w-5 h-5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={handleAddPlanStep} className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Add a milestone…"
                value={newPlanStep}
                onChange={(e) => setNewPlanStep(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
              />
              <button type="submit" className="p-2.5 rounded-xl bg-indigo-600 text-white" aria-label="Add course milestone">
                <Plus className="w-4 h-4" />
              </button>
            </form>
          </section>
        </div>
      )}

      {/* TASKS */}
      {tab === 'tasks' && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold">Course tasks</h2>
              {courseTasks.length > 0 && (
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                  {doneCount}/{courseTasks.length} done
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onViewAllTasks(course.code)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
              >
                View all
              </button>
              <button
                onClick={() => setIsComposerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" /> Add task
              </button>
            </div>
          </div>
          {courseTasks.length === 0 ? (
            <p className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500">
              No tasks linked to this course yet.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Completion bar */}
              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.round((doneCount / courseTasks.length) * 100)}%` }}
                />
              </div>

              <div className="space-y-2">
                {courseTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      task.completed
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200/70 dark:border-emerald-900/50'
                        : 'bg-slate-50 dark:bg-slate-800/70 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {/* Complete / uncomplete */}
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      aria-pressed={task.completed}
                      aria-label={
                        task.completed ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`
                      }
                      className="shrink-0 rounded-full transition-transform active:scale-90"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 hover:text-emerald-500 hover:scale-110 transition-all" />
                      )}
                    </button>

                    {/* Open task detail */}
                    <button
                      type="button"
                      onClick={() => onSelectTask(task)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <span
                        className={`block text-xs font-semibold truncate ${
                          task.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {task.title}
                      </span>
                    </button>

                    <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">
                      {task.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* RESOURCES */}
      {tab === 'resources' && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold">Resources</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onOpenFiles} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white">Files</button>
              <button
                onClick={openAddResource}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
          {resources.length === 0 ? (
            <p className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500">
              Nothing here yet. Tap <b>Add</b> to upload a file, pick one you already uploaded, or
              write notes — it will show up in this list ready to read.
            </p>
          ) : (
            <div className="space-y-2">
              {resources.map((res) => (
                <button
                  key={res.id}
                  onClick={() => onOpenResource(res)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{res.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {res.type.toUpperCase()} · {res.estimatedReadMinutes} min · {res.reading.percent}% read
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      {res.reading.completed ? 'Review' : 'Read'}
                    </span>
                    {res.reading.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {courseFiles.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Linked study files</p>
              {courseFiles.slice(0, 4).map((file) => (
                <div key={file.id} className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 py-1">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="truncate">{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* AI LEARN */}
      {tab === 'ai' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <h2 className="text-base font-extrabold">AI Learning</h2>
            </div>
            <p className="text-xs text-white/85 leading-relaxed">
              Build a personalized study path, chat with a course-aware tutor, generate quizzes, and turn resources into flashcards.
            </p>
            <button
              onClick={onOpenTutor}
              className="w-full py-3 rounded-2xl bg-white text-indigo-700 font-bold text-sm shadow-sm active:scale-[0.98] transition-all"
            >
              Open AI Learning
            </button>
          </section>

          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
            <h2 className="text-sm font-bold">What the tutor can do</h2>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <li className="flex items-center gap-2"><Route className="w-4 h-4 text-indigo-500" /> Generate a study path for this course</li>
              <li className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" /> Summarize and explain any resource</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Quiz you on a resource and track scores</li>
              <li className="flex items-center gap-2"><Layers className="w-4 h-4 text-violet-500" /> Turn resources into flashcards</li>
            </ul>
          </section>
        </div>
      )}

      {/* PROGRESS */}
      {tab === 'progress' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-sm font-bold">Progress breakdown</h2>
            {[
              { label: 'Tasks complete', done: progress.tasksCompleted, total: progress.tasksTotal, color: '#6366F1' },
              { label: 'Resources read', done: progress.resourcesRead, total: progress.resourcesTotal, color: '#F59E0B' },
              { label: 'Modules complete', done: progress.modulesCompleted, total: progress.modulesTotal, color: '#10B981' },
            ].map((row) => {
              const pct = row.total > 0 ? Math.round((row.done / row.total) * 100) : 0;
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                    <span>{row.label}</span>
                    <span>{row.done}/{row.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mt-1.5">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              );
            })}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">Overall</span>
              <span className="text-lg font-extrabold" style={{ color: course.color }}>{progress.percent}%</span>
            </div>
            {progress.lastActivityAt && (
              <p className="text-[11px] text-slate-400">
                Last studied {new Date(progress.lastActivityAt).toLocaleDateString()}
              </p>
            )}
          </section>

          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold">Course schedule</h2>
              </div>
              <button onClick={onOpenCalendar} className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Open calendar</button>
            </div>
            <p className="text-xs text-slate-500">{course.schedulePattern || 'No recurring class time set.'}</p>
            <p className="text-xs text-slate-500">{courseEvents.length} linked calendar events</p>
            {courseEvents.slice(0, 4).map((ev) => (
              <div key={ev.id} className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-200">
                <span className="truncate max-w-[70%]">{ev.title}</span>
                <span className="text-slate-400">{ev.date} · {ev.startTime}</span>
              </div>
            ))}
          </section>
        </div>
      )}

      {/* Add resource flow: choose a source → review → appears in the list to read */}
      {isAddResourceOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in pb-24 sm:pb-6">
          <div className="w-full max-w-lg max-h-[calc(100dvh-9rem)] sm:max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border-t sm:border border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-slide-up">
            <div className="sticky top-0 z-10 -mx-5 -mt-5 px-5 pt-5 pb-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 min-w-0">
                {addStep !== 'choose' && (
                  <button
                    type="button"
                    onClick={() => setAddStep(addStep === 'review' ? reviewBack : 'choose')}
                    className="p-1 -ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                    aria-label="Back"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <h3 className="text-base font-bold truncate">
                  {addStep === 'choose'
                    ? 'Add resource'
                    : addStep === 'files'
                      ? 'From your files'
                      : addStep === 'manual'
                        ? 'Write or paste'
                        : 'Ready to add'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setAddStep('choose');
                  setReview(null);
                  setIsAddResourceOpen(false);
                }}
                className="p-1 text-slate-400"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.markdown,.csv,.json,.log,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp4,.mov,.url"
              onChange={handleFilePicked}
            />

            {addStep === 'choose' && (
              <div className="space-y-2.5 py-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left hover:border-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 transition-colors"
                >
                  <span className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                      Upload a file
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      PDF, DOCX, slides, notes, images…
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAddStep('files')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left hover:border-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 transition-colors"
                >
                  <span className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                    <FolderOpen className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                      From your files
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Pick something you already uploaded
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAddStep('manual')}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left hover:border-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 transition-colors"
                >
                  <span className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <PenLine className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                      Write or paste text
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Notes, summaries, pasted material
                    </span>
                  </span>
                </button>
              </div>
            )}

            {addStep === 'files' && (
              <div className="py-4 space-y-2">
                {files.length === 0 ? (
                  <p className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 text-center">
                    No files uploaded yet — choose <b>Upload a file</b> to add your first one.
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {courseFiles.length > 0 ? `This course · ${courseFiles.length}` : 'All files'}
                    </p>
                    {[
                      ...courseFiles,
                      ...files.filter((f) => !courseFiles.some((c) => c.id === f.id)),
                    ].map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => handlePickExisting(file)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <span className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {file.name}
                          </span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                            {file.type.toUpperCase()} · {file.size}
                          </span>
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            {addStep === 'manual' && (
              <form onSubmit={handleAddResource} className="space-y-3 py-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lecture 5 notes"
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Type</label>
                <select
                  value={resType}
                  onChange={(e) => setResType(e.target.value as CourseResource['type'])}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                >
                  <option value="text">Text / notes</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">Document</option>
                  <option value="slide">Slides</option>
                  <option value="link">Link</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Content (readable text)
                </label>
                <textarea
                  rows={6}
                  placeholder="Paste or write the material. Supports # headings, - lists, > quotes, and **bold**."
                  value={resContent}
                  onChange={(e) => setResContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="sticky bottom-0 w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
              >
                Save resource
              </button>
            </form>
            )}

            {addStep === 'review' && review && (
              <form onSubmit={handleSaveReview} className="space-y-3 py-3">
                                {(review.fileStorageKey || review.dataUrl) && (
                                  <button
                                    type="button"
                                    onClick={() => setIsReviewPreviewOpen(true)}
                                    className="w-full py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold"
                                  >
                                    View original {review.type.toUpperCase()} before adding
                                  </button>
                                )}
                                    Summary / notes (optional)
                                    The original file is opened with the preview button above. This text is only supporting context.
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {review.fileName}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {review.fileSize} · {review.type.toUpperCase()}
                      {review.file ? ' · new upload' : ' · from your files'}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={review.title}
                    onChange={(e) => setReview({ ...review, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Type</label>
                  <select
                    value={review.type}
                    onChange={(e) =>
                      setReview({ ...review, type: e.target.value as CourseResource['type'] })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="text">Text / notes</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">Document</option>
                    <option value="slide">Slides</option>
                    <option value="link">Link</option>
                    <option value="video">Video</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Reads as
                  </label>
                  <textarea
                    rows={6}
                    readOnly
                    value={review.content}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    This is what you will see in the reader.
                  </p>
                </div>

                <button
                  type="submit"
                  className="sticky bottom-0 w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
                >
                  Add to resources
                </button>
              </form>
            )}
                {isReviewPreviewOpen && review && (
                  <FileViewer
                    resource={{
                      id: 'review-preview',
                      courseId: course.id,
                      courseCode: course.code,
                      title: review.title,
                      type: review.type,
                      content: review.content,
                      fileName: review.fileName,
                      mime: review.mime,
                      fileData: review.dataUrl,
                      fileStorageKey: review.fileStorageKey,
                      estimatedReadMinutes: 1,
                      tags: [],
                      createdAt: new Date().toISOString(),
                      reading: { percent: 0, lastPosition: 0, completed: false },
                    }}
                    mode="focus"
                    onExitFocus={() => setIsReviewPreviewOpen(false)}
                  />
                )}
          </div>
        </div>
      )}

      {/* Full-page task composer — stays inside the course, code pre-filled */}
      <TaskComposer
        open={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        onSubmit={(taskData, autoPlan) => {
          onAddTask({ ...taskData, courseCode: taskData.courseCode || course.code }, autoPlan);
          setIsComposerOpen(false);
        }}
        initialCourseCode={course.code}
        initialCourseColor={course.color}
        heading="Add task"
        subheading={course.code}
        cancelLabel="Cancel"
      />
    </div>
  );
};