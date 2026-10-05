import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  ArrowRight,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  FileText,
  FilePlus2,
  FolderOpen,
  HelpCircle,
  Layers,
  Lightbulb,
  ListChecks,
  Loader2,
  PenLine,
  Plus,
  RotateCcw,
  Route,
  Send,
  Sparkles,
  Target,
  Upload,
  X,
  Trash2,
} from 'lucide-react';
import {
  AIProviderConfig,
  Course,
  CourseProgress,
  CourseResource,
  ScheduleEvent,
  StudyFile,
  Task,
} from '../../types';
import { AIOrchestrator, isAIConfigured } from '../../services/aiOrchestrator';
import { TaskComposer } from '../tasks/TaskComposer';
import { saveFileBlob } from '../../utils/fileStorage';
import { extractTextFromFile } from '../../utils/fileExtractor';
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
  config?: AIProviderConfig;
  aiConfigured?: boolean;
  onAISetupRequired?: () => void;
  initialTab?: WorkspaceTab;
  onBack: () => void;
  onSelectTask: (task: Task) => void;
  onOpenFiles: () => void;
  onOpenCalendar: () => void;
  onAddPlanStep: (courseId: string, step: string) => void;
  onToggleModule: (courseId: string, moduleId: string) => void;
  onOpenResource: (resource: CourseResource) => void;
  onReindexResource?: (resourceId: string) => void;
  onOpenTutor: (options?: { resourceId?: string; tab?: 'learn' | 'tutor' | 'quiz' | 'cards'; prompt?: string }) => void;
  onAddResource: (data: Partial<CourseResource>) => void;
  /** Registers an uploaded file in the Files tab as well as the course library. */
  onUploadFile?: (file: Partial<StudyFile> & { extractedContent?: string }) => void;
  /** Creates a task from inside the course — no detour to the Tasks tab. */
  onAddTask: (taskData: Partial<Task>, autoPlan: boolean) => void;
  /** Toggles completion directly from the course task list. */
  onToggleTask: (taskId: string) => void;
  /** Deletes a task from inside the course. */
  onDeleteTask?: (taskId: string) => void;
  /** Deletes this course workspace. */
  onDeleteCourse?: (courseId: string, deleteAssociatedData?: boolean) => void;
  /** Updates this course workspace. */
  onUpdateCourse?: (course: Course) => void;
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
  config,
  aiConfigured = false,
  onAISetupRequired,
  initialTab = 'overview',
  onBack,
  onSelectTask,
  onOpenFiles,
  onOpenCalendar,
  onAddPlanStep,
  onToggleModule,
  onOpenResource,
  onReindexResource,
  onOpenTutor,
  onAddResource,
  onUploadFile,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onDeleteCourse,
  onUpdateCourse,
  onViewAllTasks,
}) => {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [newPlanStep, setNewPlanStep] = useState('');
  const [isAddResourceOpen, setIsAddResourceOpen] = useState(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isDeleteCourseOpen, setIsDeleteCourseOpen] = useState(false);
  const [deleteAssociatedData, setDeleteAssociatedData] = useState(true);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [resTitle, setResTitle] = useState('');
  const [resContent, setResContent] = useState('');
  const [resType, setResType] = useState<CourseResource['type']>('text');
  const [addStep, setAddStep] = useState<AddStep>('choose');
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isReviewPreviewOpen, setIsReviewPreviewOpen] = useState(false);
  const [reviewBack, setReviewBack] = useState<'choose' | 'files'>('choose');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. AI Overview & Briefing State
  const [overviewData, setOverviewData] = useState<{
    summary: string;
    keyThemes: string[];
    currentFocus: string;
    upcomingPriorities: string[];
    materialsDigest: { title: string; takeaway: string; type: string }[];
  } | null>(null);
  const [isGeneratingOverview, setIsGeneratingOverview] = useState(false);
  const [overviewSavedNotice, setOverviewSavedNotice] = useState<string | null>(null);

  // 2. AI Task Extraction from Materials State
  const [isExtractTasksModalOpen, setIsExtractTasksModalOpen] = useState(false);
  const [isExtractingTasks, setIsExtractingTasks] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState<Array<{
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    estimatedMinutes: number;
    sourceMaterial: string;
    selected: boolean;
  }>>([]);

  // 3. In-Workspace AI Learn Chat State
  interface AIChatMessageItem {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: string;
    isSetupAction?: boolean;
    actionableTask?: {
      title: string;
      description?: string;
      priority: 'high' | 'medium' | 'low';
      estimatedMinutes: number;
    };
    actionableModule?: {
      title: string;
      description?: string;
    };
    actionableObjective?: string;
  }

  const [aiChatMessages, setAiChatMessages] = useState<AIChatMessageItem[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Hello! I'm your course-aware AI tutor for **${course.name}** (${course.code}). I have direct access to your **${resources.length} uploaded readings & lecture materials**.\n\nAsk me anything, let me explain tricky topics, or tap a quick action below to stay fully up to date!`,
      timestamp: 'Ready',
    },
  ]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [isSendingAiChat, setIsSendingAiChat] = useState(false);
  const [selectedAiContextResource, setSelectedAiContextResource] = useState<CourseResource | null>(null);
  const aiChatEndRef = useRef<HTMLDivElement | null>(null);

  const courseTasks = tasks.filter((task) => task.courseCode === course.code);
  const doneCount = courseTasks.filter((task) => task.completed).length;
  const courseFiles = files.filter(
    (file) => file.courseCode === course.code || course.materialsFileIds.includes(file.id)
  );
  const courseEvents = schedule.filter((event) => event.courseCode === course.code);

  // Sync tab with initialTab if it changes
  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  // Handler: Generate Course Overview
  const handleGenerateOverview = async () => {
    if (!aiConfigured && onAISetupRequired) {
      onAISetupRequired();
      return;
    }
    if (!config) return;
    setIsGeneratingOverview(true);
    try {
      const data = await AIOrchestrator.generateCourseOverview(course, resources, courseTasks, courseFiles, config);
      setOverviewData(data);
    } catch (err) {
      console.error('Failed to generate course overview:', err);
    } finally {
      setIsGeneratingOverview(false);
    }
  };

  // Handler: Save Overview into Course Resources Library
  const handleSaveOverviewAsResource = () => {
    if (!overviewData) return;
    const content = `# Course Overview & Real-Time Briefing: ${course.name} (${course.code})
*Generated: ${new Date().toLocaleDateString()}*

## Executive Summary
${overviewData.summary}

## Current Focus
${overviewData.currentFocus}

## Key Themes
${overviewData.keyThemes.map((t) => `- ${t}`).join('\n')}

## Upcoming Priorities
${overviewData.upcomingPriorities.map((p) => `- ${p}`).join('\n')}

## Materials Digest
${overviewData.materialsDigest.map((m) => `### ${m.title} (${m.type})\n${m.takeaway}`).join('\n\n')}
`;
    onAddResource({
      title: `${course.code} Course Overview & Briefing`,
      type: 'text',
      content,
      estimatedReadMinutes: 3,
      tags: ['overview', 'ai-briefing', ...overviewData.keyThemes.slice(0, 2)],
    });
    setOverviewSavedNotice('Saved to course library!');
    setTimeout(() => setOverviewSavedNotice(null), 3500);
  };

  const readyMaterialsCount = resources.filter((r) => r.aiContext?.status === 'ready').length;
  const dynamicQuestions = useMemo(() => {
    const qList: string[] = [];
    resources.forEach((r) => {
      if (r.aiContext?.studyQuestions) {
        qList.push(...r.aiContext.studyQuestions);
      }
    });
    return Array.from(new Set(qList)).slice(0, 3);
  }, [resources]);

  // Handler: Extract Tasks from Course Materials
  const handleStartExtractTasks = async () => {
    if (!aiConfigured && onAISetupRequired) {
      onAISetupRequired();
      return;
    }
    if (!config) return;
    setIsExtractTasksModalOpen(true);

    // Instant population from pre-indexed material tasks (zero waiting)
    const preIndexed: Array<{
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
      estimatedMinutes: number;
      sourceMaterial: string;
      selected: boolean;
    }> = [];
    resources.forEach((r) => {
      if (r.aiContext?.suggestedTasks) {
        r.aiContext.suggestedTasks.forEach((st) => {
          preIndexed.push({
            title: st.title,
            description: `Auto-extracted from pre-indexed context of "${r.title}".`,
            priority: st.priority,
            estimatedMinutes: st.estimatedMinutes,
            sourceMaterial: r.title,
            selected: true,
          });
        });
      }
    });
    if (preIndexed.length > 0) {
      setExtractedTasks(preIndexed);
    }

    setIsExtractingTasks(true);
    try {
      const generated = await AIOrchestrator.generateCourseTasksFromMaterials(course, resources, courseFiles, courseTasks, config);
      // Merge with pre-indexed without exact title duplication
      setExtractedTasks((prev) => {
        const existingTitles = new Set(prev.map((t) => t.title.toLowerCase().trim()));
        const uniqueGen = generated
          .filter((t) => !existingTitles.has(t.title.toLowerCase().trim()))
          .map((t) => ({ ...t, selected: true }));
        return [...prev, ...uniqueGen];
      });
    } catch (err) {
      console.error('Task extraction failed:', err);
    } finally {
      setIsExtractingTasks(false);
    }
  };

  // Handler: Confirm Adding Selected Extracted Tasks
  const handleConfirmAddTasks = () => {
    const selected = extractedTasks.filter((t) => t.selected);
    if (selected.length === 0) return;
    selected.forEach((t) => {
      onAddTask(
        {
          title: t.title,
          description: `${t.description}\n\n[Extracted from: ${t.sourceMaterial}]`,
          priority: t.priority,
          estimatedMinutes: t.estimatedMinutes,
          courseCode: course.code,
          deadline: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
          completed: false,
        },
        false
      );
    });
    setUploadNotice(`✨ Added ${selected.length} tasks to ${course.code}`);
    setTimeout(() => setUploadNotice(null), 3500);
    setIsExtractTasksModalOpen(false);
  };

  // Handler: In-Workspace AI Learn Chat
  const handleSendAiChat = async (promptToSend?: string) => {
    const text = (promptToSend || aiChatInput).trim();
    if (!text || isSendingAiChat) return;
    if (!aiConfigured && onAISetupRequired) {
      onAISetupRequired();
      return;
    }
    if (!config) return;

    const userMsg: AIChatMessageItem = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: 'Now',
    };
    setAiChatMessages((prev) => [...prev, userMsg]);
    if (!promptToSend) setAiChatInput('');
    setIsSendingAiChat(true);

    const courseResources = resources.filter(
      (r) => r.courseId === course.id || r.courseCode?.toLowerCase() === course.code.toLowerCase()
    );
    const materialsContext = courseResources
      .map((r) => {
        if (r.aiContext?.denseContext) {
          return `[PRE-INDEXED STUDY CONTEXT FOR "${r.title}"]:\nSummary: ${r.aiContext.summary}\nKey Concepts: ${r.aiContext.keyConcepts.join(', ')}\nCore Knowledge Digest:\n${r.aiContext.denseContext}`;
        }
        return `Resource "${r.title}" (${r.type}): ${(r.content || '').slice(0, 800)}`;
      })
      .join('\n\n');

    const filesContext = courseFiles
      .map((f) => {
        if (f.aiContext?.denseContext) {
          return `[COURSE FILE "${f.name}"]: ${f.aiContext.denseContext}`;
        }
        return `[COURSE FILE "${f.name}"]: ${f.summary}`;
      })
      .join('\n');

    const openTasks = courseTasks.filter((t) => !t.completed).map((t) => t.title).join(', ');

    const systemInstruction = `STRICT COURSE ISOLATION RULE:
You are StudyAI, the specialized academic learning tutor EXCLUSIVELY for the individual course "${course.name}" (${course.code}).
Every single explanation, answer, practice question, and suggested study task MUST be grounded strictly and exclusively in this specific course and its registered materials below.
NEVER reference, blend in, suggest, or discuss topics, tasks, or materials from any other course or subject.
If the student asks about anything outside "${course.name}" (${course.code}), politely decline and bring the focus back to ${course.code}.

Course Information:
- Course: ${course.name} (${course.code})
- Instructor: ${course.professor || 'n/a'}.
- Course Objectives: ${course.objectives.join('; ') || 'n/a'}
- Active Modules: ${course.modules.map((m) => m.title).join(', ') || 'n/a'}
- Current Open Tasks for ${course.code}: ${openTasks || 'None'}

Exclusive Course Materials & Pre-Indexed Knowledge Base:
${materialsContext || 'No readings uploaded yet for this course.'}
${filesContext ? `\nCourse Files Knowledge Base:\n${filesContext}` : ''}

Be concise, practical, and highly clear. If you recommend a specific next study action or task, formulate it clearly so the student can complete it.`;

    if (!config || !isAIConfigured(config)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('studyai:open-ai-setup'));
      }
      setAiChatMessages((prev) => [
        ...prev,
        {
          id: `ai-setup-${Date.now()}`,
          sender: 'ai',
          text: 'AI provider is not configured yet. Please open Settings to connect Puter.js (free) or enter an API key to chat with your course materials.',
          timestamp: 'Just now',
          isSetupAction: true,
        },
      ]);
      setIsSendingAiChat(false);
      return;
    }

    try {
      const provider = AIOrchestrator.getProvider(config, 'routine');
      const response = await provider.generateText(text, systemInstruction);

      // Check if response contains a clear task suggestion
      let suggestedTask: AIChatMessageItem['actionableTask'] = undefined;
      const taskLine = response.split('\n').find((l) => l.toLowerCase().includes('task:') || l.toLowerCase().includes('recommended next:'));
      if (taskLine) {
        suggestedTask = {
          title: taskLine.replace(/^.*?(task:|recommended next:)/i, '').trim().slice(0, 80),
          priority: 'medium',
          estimatedMinutes: 30,
        };
      }

      // Check if response contains a module suggestion
      let suggestedModule: AIChatMessageItem['actionableModule'] = undefined;
      const moduleLine = response.split('\n').find((l) => /^(\*|-|\d+\.)?\s*(module|new module|week \d+):/i.test(l.trim()));
      if (moduleLine) {
        const cleanMod = moduleLine.replace(/^(\*|-|\d+\.)?\s*(module|new module):\s*/i, '').trim();
        suggestedModule = {
          title: cleanMod.slice(0, 60),
          description: `Added via Course AI chat for ${course.code}`,
        };
      }

      // Check if response contains an objective suggestion
      let suggestedObjective: string | undefined = undefined;
      const objectiveLine = response.split('\n').find((l) => /^(\*|-|\d+\.)?\s*(objective|learning outcome|goal):/i.test(l.trim()));
      if (objectiveLine) {
        suggestedObjective = objectiveLine.replace(/^(\*|-|\d+\.)?\s*(objective|learning outcome|goal):\s*/i, '').trim().slice(0, 100);
      }

      setAiChatMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: response || 'I have analyzed your course materials. Let me know if you would like me to unpack any specific module or concept!',
          timestamp: 'Just now',
          actionableTask: suggestedTask,
          actionableModule: suggestedModule,
          actionableObjective: suggestedObjective,
        },
      ]);
    } catch (err: any) {
      setAiChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `Unable to connect to tutor: ${err?.message || 'Please check your connection and try again.'}`,
          timestamp: 'Just now',
        },
      ]);
    } finally {
      setIsSendingAiChat(false);
    }
  };

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

    // Automatically extract textual context for instant AI understanding & permanent context caching
    const extractedText = await extractTextFromFile(file, file.name);

    onUploadFile?.({
      name: file.name,
      size: fileSize,
      type: studyFileType(file.name),
      courseCode: course.code,
      fileStorageKey,
      extractedContent: extractedText,
    });
    onAddResource({
      title: file.name,
      type,
      content: extractedText,
      fileName: file.name,
      mime,
      fileStorageKey,
      estimatedReadMinutes: Math.max(2, Math.round(file.size / (1024 * 60))),
      tags: [],
    });
    setUploadNotice(`✨ ${file.name} added · AI Auto-Indexing context for ${course.code}…`);
    window.setTimeout(() => setUploadNotice(null), 4000);
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
    <div className="w-full flex flex-col gap-4 pb-8 animate-fade-in text-slate-900 dark:text-white">
      <header className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1 p-1.5 -ml-1 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Courses</span>
        </button>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Course Workspace</span>
        {onDeleteCourse ? (
          <button
            type="button"
            onClick={() => {
              setDeleteAssociatedData(true);
              setIsDeleteCourseOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            title="Delete course"
            aria-label="Delete course"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden sm:inline">Delete course</span>
          </button>
        ) : (
          <div className="w-16" />
        )}
      </header>

      {uploadNotice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 animate-fade-in">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px]">✓</span>
          {uploadNotice}
        </div>
      )}

      {/* Full-width, compact-height course title banner */}
      <section
        className="w-full rounded-2xl py-3 px-4 sm:px-5 text-white shadow-xs border border-white/10 transition-all"
        style={{ backgroundColor: course.color }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-6">
          {/* Left: Code, Emoji, Title, and Metadata in compact hierarchy */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex px-2 py-0.5 rounded-md bg-white/20 text-[11px] font-extrabold tracking-wide uppercase">
                {course.code}
              </span>
              <span className="text-base shrink-0">{course.coverEmoji || '📘'}</span>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white truncate">
                {course.name}
              </h1>
            </div>
            <p className="text-xs text-white/85 mt-0.5 truncate">
              {course.term || 'Current term'}
              {course.professor ? ` · ${course.professor}` : ''}
              {course.credits ? ` · ${course.credits} credits` : ''}
            </p>
          </div>

          {/* Right: Progress bar & stats in streamlined horizontal layout */}
          <div className="shrink-0 w-full md:w-56 pt-2 md:pt-0 border-t md:border-t-0 border-white/15">
            <div className="flex items-center justify-between text-[11px] font-bold text-white/95">
              <span>Course progress</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/25 overflow-hidden mt-1.5">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-white/80 mt-1 font-semibold">
              <span>{progress.tasksCompleted}/{progress.tasksTotal} tasks</span>
              <span>·</span>
              <span>{progress.resourcesRead}/{progress.resourcesTotal} read</span>
              <span>·</span>
              <span>{course.modules.filter((m) => m.completed).length}/{course.modules.length} modules</span>
            </div>
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
        <div className="flex flex-col gap-5">
          {/* AI Course Briefing: Real-time status & synthesis */}
          <section className="rounded-3xl bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/60 dark:from-slate-900 dark:via-slate-900/90 dark:to-indigo-950/30 border border-indigo-100/90 dark:border-indigo-900/40 p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">AI Course Briefing & Synthesis</h2>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">
                      Stay Up to Date
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Live synthesis of {resources.length} reading materials, {courseFiles.length} files, and {courseTasks.length} tasks
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleStartExtractTasks}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 shadow-2xs active:scale-95 transition-all"
                >
                  <ListChecks className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Extract Tasks</span>
                </button>
                <button
                  onClick={handleGenerateOverview}
                  disabled={isGeneratingOverview}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs active:scale-95 disabled:opacity-50 transition-all"
                >
                  {isGeneratingOverview ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Synthesizing…</span>
                    </>
                  ) : overviewData ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Refresh Briefing</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Overview</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* If Overview not generated yet, show prompt banner */}
            {!overviewData && !isGeneratingOverview && (
              <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-dashed border-indigo-200/80 dark:border-indigo-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <p className="font-bold text-slate-800 dark:text-slate-100">Ready to synthesize your course materials</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Click "Generate Overview" to summarize lecture slides, readings, identify what you need to focus on right now, and stay ahead of deadlines.
                  </p>
                </div>
                <button
                  onClick={handleGenerateOverview}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 shadow-xs active:scale-95 transition-all"
                >
                  Generate Briefing
                </button>
              </div>
            )}

            {/* Loading state */}
            {isGeneratingOverview && (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-900/30 flex flex-col items-center justify-center gap-2 text-center">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Analyzing all materials with Gemini…</p>
                <p className="text-[11px] text-slate-400">Synthesizing readings, syllabus objectives, and pending milestones.</p>
              </div>
            )}

            {/* Generated Overview Content */}
            {overviewData && !isGeneratingOverview && (
              <div className="space-y-4 pt-1 animate-fade-in">
                {/* Executive Summary */}
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700/70 shadow-2xs">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Executive Summary</h3>
                  <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    {overviewData.summary}
                  </p>
                </div>

                {/* Current Focus & Priorities */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40">
                    <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 text-xs font-bold mb-1">
                      <Target className="w-3.5 h-3.5" />
                      <span>Current Focus</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      {overviewData.currentFocus}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/40">
                    <div className="flex items-center gap-1.5 text-indigo-800 dark:text-indigo-300 text-xs font-bold mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Upcoming Priorities</span>
                    </div>
                    <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      {overviewData.upcomingPriorities.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                          <span className="truncate">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Key Themes Chips */}
                {overviewData.keyThemes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 mr-1">Key Themes:</span>
                    {overviewData.keyThemes.map((theme, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                )}

                {/* Materials Digest */}
                {overviewData.materialsDigest.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Materials Digest</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {overviewData.materialsDigest.map((item, idx) => {
                        const matchingResource = resources.find((r) => r.title.toLowerCase().includes(item.title.toLowerCase()));
                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 text-xs flex flex-col justify-between gap-2"
                          >
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{item.title}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{item.takeaway}</p>
                            </div>
                            {matchingResource && (
                              <button
                                onClick={() => onOpenResource(matchingResource)}
                                className="self-start text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 mt-1 cursor-pointer"
                              >
                                <span>Read document</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Save to Notes Button */}
                <div className="pt-2 flex items-center justify-between border-t border-indigo-100/60 dark:border-indigo-900/30">
                  <span className="text-[11px] text-slate-500">
                    {overviewSavedNotice ? (
                      <span className="text-emerald-600 font-bold">✓ {overviewSavedNotice}</span>
                    ) : (
                      'Save this overview briefing directly to your course notes'
                    )}
                  </span>
                  <button
                    onClick={handleSaveOverviewAsResource}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 shadow-2xs active:scale-95 transition-all"
                  >
                    Save as Note
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Core Course Info Grid */}
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
                      className="w-full flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
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
                <button type="submit" className="p-2.5 rounded-xl bg-indigo-600 text-white cursor-pointer" aria-label="Add course milestone">
                  <Plus className="w-4 h-4" />
                </button>
              </form>
            </section>

            {onDeleteCourse && (
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-rose-200/60 dark:border-rose-950/40 p-4 sm:p-5 space-y-2 lg:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">Course workspace options</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Permanently remove this course and its materials.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteAssociatedData(true);
                      setIsDeleteCourseOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete course</span>
                  </button>
                </div>
              </section>
            )}
          </div>
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
                onClick={handleStartExtractTasks}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 transition-colors shadow-2xs active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Tasks</span>
              </button>
              <button
                onClick={() => setIsComposerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs active:scale-95"
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

                    {onDeleteTask && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTaskToDelete(task);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0"
                        title="Delete task"
                        aria-label={`Delete task ${task.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
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
                <div
                  key={res.id}
                  onClick={() => onOpenResource(res)}
                  className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{res.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-[11px] text-slate-500">
                        {res.type.toUpperCase()} · {res.estimatedReadMinutes} min · {res.reading.percent}% read
                      </span>

                      {/* AI Context Status Badge */}
                      {res.aiContext?.status === 'ready' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAiContextResource(res);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 hover:bg-emerald-100 transition-colors cursor-pointer shadow-2xs"
                          title="Click to view auto-saved AI context"
                        >
                          <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                          <span>AI Context Ready</span>
                        </button>
                      )}

                      {res.aiContext?.status === 'analyzing' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 animate-pulse">
                          <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-600" />
                          <span>Auto-Indexing…</span>
                        </span>
                      )}

                      {(!res.aiContext || res.aiContext.status === 'error') && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReindexResource?.(res.id);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 border border-indigo-200/60 dark:border-indigo-800/40 cursor-pointer"
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Ready Context</span>
                        </button>
                      )}
                    </div>
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
                </div>
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
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[560px] animate-fade-in">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-xs">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">{course.name} AI Tutor</h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
                    Live Grounded
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[11px] text-slate-500">
                    Synthesizing {resources.length} readings, {courseFiles.length} files & syllabus
                  </p>
                  <span className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-1.5 py-0.5 rounded-md border border-emerald-200/60 shrink-0">
                    {readyMaterialsCount} pre-indexed
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                onClick={handleStartExtractTasks}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-2xs active:scale-95 transition-all cursor-pointer"
              >
                <ListChecks className="w-3.5 h-3.5 text-indigo-600" />
                <span>Extract Tasks</span>
              </button>
              <button
                onClick={() => onOpenTutor({ tab: 'quiz' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Quiz</span>
              </button>
              <button
                onClick={() => onOpenTutor({ tab: 'cards' })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Flashcards</span>
              </button>
            </div>
          </div>

          {/* Quick Suggestion Pills with Dynamic Pre-Indexed Questions */}
          <div className="px-4 py-2.5 bg-slate-50/40 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">Try:</span>
            {[
              '🧠 Quiz me on course readings',
              '🃏 Generate flashcards from readings',
              '⚡ What should I focus on right now?',
              ...dynamicQuestions.map((q: string) => `❓ ${q}`),
              '📝 Create study task for this week',
              '📦 Add module for upcoming topic',
              '🎯 Add learning objective for course',
              '📋 Extract study tasks from my readings',
              '📖 Summarize all uploaded course materials',
              '💡 Explain the hardest concept in simple terms',
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => handleSendAiChat(chip)}
                disabled={isSendingAiChat}
                className="shrink-0 px-3 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-2xs"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 max-h-[460px]">
            {aiChatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white shadow-xs rounded-br-xs'
                      : 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* AI Setup Action Banner */}
                  {msg.isSetupAction && (
                    <div className="mt-3 p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-2 animate-fade-in">
                      <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                        Setup AI in Settings
                      </span>
                      <button
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('studyai:open-ai-setup'));
                          }
                        }}
                        className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-2xs active:scale-95 cursor-pointer"
                      >
                        Open Settings
                      </button>
                    </div>
                  )}

                  {/* Inline suggested task banner */}
                  {msg.actionableTask && (
                    <div className="mt-3 p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400">Suggested Task:</span>
                        <p className="text-[11px] font-bold text-slate-800 dark:text-white truncate">{msg.actionableTask.title}</p>
                      </div>
                      <button
                        onClick={() => {
                          onAddTask(
                            {
                              title: msg.actionableTask!.title,
                              priority: msg.actionableTask!.priority,
                              estimatedMinutes: msg.actionableTask!.estimatedMinutes,
                              courseCode: course.code,
                              deadline: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
                              completed: false,
                            },
                            false
                          );
                          setUploadNotice(`✨ Added task "${msg.actionableTask!.title}"`);
                          setTimeout(() => setUploadNotice(null), 3500);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold shrink-0 hover:bg-indigo-500 shadow-2xs active:scale-95 cursor-pointer"
                      >
                        + Add to Tasks
                      </button>
                    </div>
                  )}

                  {/* Inline suggested module banner */}
                  {msg.actionableModule && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 flex items-center justify-between gap-2 animate-fade-in">
                      <div className="min-w-0">
                        <span className="text-[10px] font-extrabold uppercase text-purple-600 dark:text-purple-400">Proposed Course Module:</span>
                        <p className="text-[11px] font-bold text-slate-800 dark:text-white truncate">{msg.actionableModule.title}</p>
                      </div>
                      <button
                        onClick={() => {
                          const newMod = {
                            id: `mod-${Date.now()}`,
                            title: msg.actionableModule!.title,
                            description: msg.actionableModule!.description || '',
                            order: course.modules.length + 1,
                            completed: false,
                          };
                          onUpdateCourse?.({
                            ...course,
                            modules: [...course.modules, newMod],
                          });
                          setUploadNotice(`✨ Added module "${newMod.title}" to ${course.code}`);
                          setTimeout(() => setUploadNotice(null), 3500);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-[10px] font-bold shrink-0 hover:bg-purple-500 shadow-2xs active:scale-95 cursor-pointer"
                      >
                        + Add Module
                      </button>
                    </div>
                  )}

                  {/* Inline suggested objective banner */}
                  {msg.actionableObjective && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2 animate-fade-in">
                      <div className="min-w-0">
                        <span className="text-[10px] font-extrabold uppercase text-emerald-600 dark:text-emerald-400">Proposed Objective:</span>
                        <p className="text-[11px] font-bold text-slate-800 dark:text-white truncate">{msg.actionableObjective}</p>
                      </div>
                      <button
                        onClick={() => {
                          onUpdateCourse?.({
                            ...course,
                            objectives: Array.from(new Set([...course.objectives, msg.actionableObjective!])),
                          });
                          setUploadNotice(`✨ Added objective to ${course.code}`);
                          setTimeout(() => setUploadNotice(null), 3500);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold shrink-0 hover:bg-emerald-500 shadow-2xs active:scale-95 cursor-pointer"
                      >
                        + Add Objective
                      </button>
                    </div>
                  )}

                  <span
                    className={`block text-[10px] mt-1.5 opacity-60 ${
                      msg.sender === 'user' ? 'text-white/80' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {isSendingAiChat && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="rounded-2xl px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-bl-xs flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Thinking with course materials…</span>
                </div>
              </div>
            )}
            <div ref={aiChatEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 sm:p-4 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAiChat();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={aiChatInput}
                onChange={(e) => setAiChatInput(e.target.value)}
                placeholder={`Ask anything about ${course.name}, uploaded notes, or assignments…`}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="submit"
                disabled={!aiChatInput.trim() || isSendingAiChat}
                className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-all shadow-xs cursor-pointer active:scale-95"
                aria-label="Send query to AI tutor"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </section>
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

      {/* AI Task Extraction Modal from Course Materials */}
      {isExtractTasksModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in pb-20 sm:pb-6">
          <div className="w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl animate-slide-up">
            {/* Header */}
            <div className="shrink-0 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Tasks from Materials</h3>
                  <p className="text-[11px] text-slate-500">Derived from {resources.length} course documents & readings</p>
                </div>
              </div>
              <button
                onClick={() => setIsExtractTasksModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {isExtractingTasks ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Scanning readings & lecture notes…</p>
                  <p className="text-xs text-slate-400 max-w-xs">Gemini is formulating actionable, realistic study tasks and deadlines.</p>
                </div>
              ) : extractedTasks.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <p>No new tasks could be extracted.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                    <span>Select tasks to add ({extractedTasks.filter((t) => t.selected).length}/{extractedTasks.length})</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected = extractedTasks.every((t) => t.selected);
                        setExtractedTasks((prev) => prev.map((t) => ({ ...t, selected: !allSelected })));
                      }}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {extractedTasks.every((t) => t.selected) ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>

                  {extractedTasks.map((t, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setExtractedTasks((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, selected: !item.selected } : item))
                        );
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                        t.selected
                          ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/60 shadow-2xs'
                          : 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="mt-0.5">
                        <div
                          className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                            t.selected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {t.selected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{t.title}</p>
                        {t.description && (
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                            t.priority === 'high'
                              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                              : t.priority === 'medium'
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}>
                            {t.priority}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold">
                            ⏱ ~{t.estimatedMinutes} min
                          </span>
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            • {t.sourceMaterial}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsExtractTasksModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isExtractingTasks || extractedTasks.filter((t) => t.selected).length === 0}
                onClick={handleConfirmAddTasks}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-40 shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add {extractedTasks.filter((t) => t.selected).length} Tasks to Course</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Context Inspector Modal */}
      {selectedAiContextResource && selectedAiContextResource.aiContext && (
        <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in pb-20 sm:pb-6">
          <div className="w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl animate-slide-up">
            {/* Header */}
            <div className="shrink-0 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">Auto-Saved AI Context</h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 shrink-0">
                      Cached & Ready
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate">{selectedAiContextResource.title}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedAiContextResource(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Summary */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Executive Summary</h4>
                <p className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed">
                  {selectedAiContextResource.aiContext.summary}
                </p>
              </div>

              {/* Pre-Indexed Knowledge Digest */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    Permanent Learning Digest
                  </h4>
                  <span className="text-[10px] text-indigo-500 font-semibold">Indexed for AI Learn</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                  {selectedAiContextResource.aiContext.denseContext}
                </p>
                <p className="text-[10px] text-slate-400 italic pt-1 border-t border-indigo-100 dark:border-indigo-900/40">
                  ✨ This structured digest is cached permanently. AI chats, tutors, and task extraction query this directly without re-reading raw bytes.
                </p>
              </div>

              {/* Key Concepts */}
              {selectedAiContextResource.aiContext.keyConcepts.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Key Concepts & Terms</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAiContextResource.aiContext.keyConcepts.map((concept, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs"
                      >
                        {concept}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Study Questions */}
              {selectedAiContextResource.aiContext.studyQuestions && selectedAiContextResource.aiContext.studyQuestions.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Comprehension Checks</h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {selectedAiContextResource.aiContext.studyQuestions.map((q, i) => (
                      <li
                        key={i}
                        onClick={() => {
                          setSelectedAiContextResource(null);
                          setTab('ai');
                          handleSendAiChat(q);
                        }}
                        className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-start gap-2">
                          <HelpCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                          <span>{q}</span>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          Ask in AI Learn →
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggested Tasks */}
              {selectedAiContextResource.aiContext.suggestedTasks && selectedAiContextResource.aiContext.suggestedTasks.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Extracted Tasks</h4>
                  <div className="space-y-2">
                    {selectedAiContextResource.aiContext.suggestedTasks.map((t, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{t.title}</p>
                          <span className="text-[10px] text-slate-400 font-semibold">⏱ ~{t.estimatedMinutes} min</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onAddTask(
                              {
                                title: t.title,
                                description: `Extracted from ${selectedAiContextResource.title}`,
                                priority: t.priority,
                                estimatedMinutes: t.estimatedMinutes,
                                courseCode: course.code,
                                deadline: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
                                completed: false,
                              },
                              false
                            );
                            setUploadNotice(`✨ Added task "${t.title}"`);
                            setTimeout(() => setUploadNotice(null), 3500);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold shrink-0 shadow-2xs active:scale-95 cursor-pointer"
                        >
                          + Add Task
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onReindexResource?.(selectedAiContextResource.id);
                  setSelectedAiContextResource(null);
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Re-index with Gemini</span>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const resId = selectedAiContextResource.id;
                    setSelectedAiContextResource(null);
                    onOpenTutor({ resourceId: resId, tab: 'quiz' });
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                  title="Generate interactive quiz questions from this course material"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Generate Quiz</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const resId = selectedAiContextResource.id;
                    setSelectedAiContextResource(null);
                    onOpenTutor({ resourceId: resId, tab: 'cards' });
                  }}
                  className="px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 text-xs font-bold hover:bg-violet-100 flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                  title="Generate flashcards from this course material"
                >
                  <Layers className="w-3.5 h-3.5 text-violet-600" />
                  <span>Make Flashcards</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const res = selectedAiContextResource;
                    setSelectedAiContextResource(null);
                    onOpenResource(res);
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs active:scale-95 cursor-pointer"
                >
                  Open Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Course Confirmation Modal */}
      {isDeleteCourseOpen && (
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
              style={{ backgroundColor: course.color }}
            >
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-lg shrink-0">
                {course.coverEmoji || '📘'}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white/20 uppercase">
                  {course.code}
                </span>
                <p className="font-bold text-xs truncate mt-0.5">{course.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete <b className="text-slate-900 dark:text-white">{course.name}</b>? This workspace will be permanently removed.
            </p>

            {(courseTasks.length > 0 || resources.length > 0) && (
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
                    {courseTasks.length} task{courseTasks.length === 1 ? '' : 's'} and {resources.length} reading{resources.length === 1 ? '' : 's'}. If unchecked, tasks are preserved as personal tasks.
                  </span>
                </div>
              </label>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsDeleteCourseOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteCourseOpen(false);
                  if (onDeleteCourse) {
                    onDeleteCourse(course.id, deleteAssociatedData);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Course</span>
              </button>
            </div>
          </div>
        </div>
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
                  className="inline-block mt-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded text-white uppercase"
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
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
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