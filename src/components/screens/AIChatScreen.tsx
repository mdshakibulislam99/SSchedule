import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Mic,
  History,
  Plus,
  Menu,
  Sparkles,
  ChevronDown,
  Check,
  X,
  Layers,
  GraduationCap,
  Clock,
  CheckCircle2,
  Trash2,
  Pencil,
  BookOpen,
  Calendar,
  Search,
  UploadCloud,
  FileText,
  CheckSquare,
  MessageSquare,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MascotAvatar } from '../mobile/MascotAvatar';
import { MarkdownMessage } from '../common/MarkdownMessage';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  AIMessage,
  AIActionProposal,
  Task,
  StudyFile,
  AIProviderConfig,
  ScheduleEvent,
  UserProfile,
  Course,
  CourseResource,
  AIConversation,
} from '../../types';
import { AIOrchestrator, AIExecutionContext } from '../../services/aiOrchestrator';
import { getLocalDateKey } from '../../utils/dates';
import { extractTextFromFile } from '../../utils/fileExtractor';
import { StudyStorage } from '../../utils/storage';

interface AIChatScreenProps {
  contextTask?: Task | null;
  contextFile?: StudyFile | null;
  courses?: Course[];
  resources?: CourseResource[];
  files?: StudyFile[];
  onNavigateToCourse?: (
    courseId: string,
    initialTab?: 'overview' | 'tasks' | 'resources' | 'ai' | 'quiz' | 'cards' | 'tutor' | 'learn'
  ) => void;
  onClearContext?: () => void;
  onOpenVoiceModal: () => void;
  onExecuteAction: (action: AIActionProposal) => void;
  onUploadFile?: (file: Partial<StudyFile> & { extractedContent?: string }) => void;
  config: AIProviderConfig;
  allTasks: Task[];
  schedule?: ScheduleEvent[];
  user?: UserProfile;
  aiConfigured: boolean;
  onAISetupRequired: () => void;
}

export const AIChatScreen: React.FC<AIChatScreenProps> = ({
  contextTask,
  contextFile,
  courses = [],
  resources = [],
  files = [],
  onNavigateToCourse,
  onClearContext,
  onOpenVoiceModal,
  onExecuteAction,
  onUploadFile,
  config,
  allTasks,
  schedule = [],
  user,
  aiConfigured,
  onAISetupRequired,
}) => {
  // Topic / Scope selector: 'all' (General Study) or course ID
  const [selectedCourseId, setSelectedCourseId] = useState<string>('all');

  // Requirement 2: Chat History modal (opened via 3-line hamburger menu)
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [conversations, setConversations] = useState<AIConversation[]>(() => StudyStorage.getConversations());
  const [currentConversationId, setCurrentConversationId] = useState<string>(() => `conv-${Date.now()}`);
  const [conversationToDelete, setConversationToDelete] = useState<AIConversation | null>(null);

  // Helper to extract clean concise course title, e.g. CS101, Calculus
  const getShortCourseTitle = (c: Course): string => {
    if (c.code?.toUpperCase() === 'CS101') return 'CS101';
    if (/calculus/i.test(c.name) || /calculus/i.test(c.code)) return 'Calculus';
    if (/algorithm/i.test(c.name)) return 'Algorithms';
    if (/capstone/i.test(c.name)) return 'Capstone';
    if (c.code && c.code.length <= 8 && !c.code.toLowerCase().includes('course')) {
      return c.code;
    }
    const words = c.name.split(' ');
    return words[0] || c.code || 'Course';
  };

  // Requirement 3 & 4: Plus action menu (for upload, area selection, task attachment)
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState<boolean>(false);
  const [plusMenuTab, setPlusMenuTab] = useState<'main' | 'areas' | 'tasks'>('main');
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Attached dynamic context from chat
  const [attachedMaterial, setAttachedMaterial] = useState<{ name: string; content?: string } | null>(null);
  const [attachedTask, setAttachedTask] = useState<Task | null>(contextTask || null);

  // Auto-detect course if explicitly opened with a contextTask or contextFile
  useEffect(() => {
    if (contextTask?.courseCode && courses.length > 0) {
      const match = courses.find((c) => c.code.toLowerCase() === contextTask.courseCode?.toLowerCase());
      if (match) {
        setSelectedCourseId(match.id);
      }
    } else if (contextFile?.courseCode && courses.length > 0) {
      const match = courses.find((c) => c.code.toLowerCase() === contextFile.courseCode?.toLowerCase());
      if (match) {
        setSelectedCourseId(match.id);
      }
    }
  }, [contextTask, contextFile, courses]);

  // Click outside listener for plus menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setIsPlusMenuOpen(false);
        setPlusMenuTab('main');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Text-to-Speech (Audio Read Aloud) state
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSpeak = (msgId: string, text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Strip markdown formatting symbols for clean speech reading
    const cleanSpeech = text
      .replace(/[#*_`~>-]/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const focusedCourse = useMemo(() => {
    if (selectedCourseId === 'all') return null;
    return courses.find((c) => c.id === selectedCourseId) || null;
  }, [selectedCourseId, courses]);

  const focusedCourseResources = useMemo(() => {
    if (!focusedCourse) return [];
    return resources.filter(
      (r) => r.courseId === focusedCourse.id || r.courseCode?.toLowerCase() === focusedCourse.code.toLowerCase()
    );
  }, [focusedCourse, resources]);

  const focusedCourseFiles = useMemo(() => {
    if (!focusedCourse) return [];
    return files.filter(
      (f) => f.courseCode?.toLowerCase() === focusedCourse.code.toLowerCase()
    );
  }, [focusedCourse, files]);

  // Clean initial greeting message
  const createInitialMessage = (course: Course | null, task: Task | null): AIMessage => {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (task) {
      return {
        id: 'welcome-task',
        sender: 'ai',
        text: `Hi! 👋 I've attached your task "${task.title}"${task.courseCode ? ` (${task.courseCode})` : ''}. How would you like to tackle it?`,
        timestamp: nowTime,
      };
    }
    if (course) {
      return {
        id: 'welcome-course',
        sender: 'ai',
        text: `Hi! 👋 I'm ready to help you with **${course.name}** (${course.code}). Ask me anything about this course, its readings, or upcoming assignments.`,
        timestamp: nowTime,
      };
    }
    return {
      id: 'welcome-general',
      sender: 'ai',
      text: "Hi! 👋 I'm your StudyAI assistant. How can I help you study today?",
      timestamp: nowTime,
    };
  };

  const [messages, setMessages] = useState<AIMessage[]>(() => [
    createInitialMessage(focusedCourse, contextTask || null),
  ]);

  // Track if user has started chatting (so suggestions disappear once chatting begins)
  const hasStartedChatting = useMemo(() => {
    return messages.some((m) => m.sender === 'user');
  }, [messages]);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Persist conversation to storage whenever messages update
  useEffect(() => {
    if (messages.length <= 1) return;
    const title =
      messages.find((m) => m.sender === 'user')?.text.slice(0, 36) ||
      (focusedCourse ? `${focusedCourse.code} Study Session` : 'General Study Session');

    const updatedConv: AIConversation = {
      id: currentConversationId,
      title,
      messages,
      contextTaskId: attachedTask?.id,
      courseId: selectedCourseId === 'all' ? undefined : selectedCourseId,
      updatedAt: new Date().toISOString(),
    };

    setConversations((prev) => {
      const exists = prev.some((c) => c.id === currentConversationId);
      const next = exists
        ? prev.map((c) => (c.id === currentConversationId ? updatedConv : c))
        : [updatedConv, ...prev];
      StudyStorage.saveConversations(next);
      return next;
    });
  }, [messages, currentConversationId, focusedCourse, attachedTask]);

  // Switch study area
  const handleSelectScope = (courseId: string) => {
    setSelectedCourseId(courseId);
    setIsPlusMenuOpen(false);
    setPlusMenuTab('main');
    const targetCourse = courseId === 'all' ? null : courses.find((c) => c.id === courseId) || null;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const switchMsg: AIMessage = {
      id: `scope-switch-${Date.now()}`,
      sender: 'ai',
      text: targetCourse
        ? `Focus switched to **${targetCourse.name}** (${targetCourse.code}). I'm now grounding explanations, quizzes, and study tasks in this subject.`
        : "Switched back to **General Study**. You can ask about any topic, schedule study sessions, or plan across all courses.",
      timestamp: nowTime,
    };

    setMessages((prev) => [...prev, switchMsg]);
  };

  // Start fresh conversation
  const handleStartNewChat = () => {
    const newId = `conv-${Date.now()}`;
    setCurrentConversationId(newId);
    setAttachedMaterial(null);
    setAttachedTask(null);
    if (onClearContext) onClearContext();
    setMessages([createInitialMessage(focusedCourse, null)]);
    setIsHistoryOpen(false);
  };

  // Load a conversation from history
  const handleLoadConversation = (conv: AIConversation) => {
    setCurrentConversationId(conv.id);
    setMessages(conv.messages);
    setSelectedCourseId(conv.courseId || 'all');
    setAttachedMaterial(null);
    const task = conv.contextTaskId ? allTasks.find((t) => t.id === conv.contextTaskId) || null : null;
    setAttachedTask(task);
    setIsHistoryOpen(false);
  };

  // Delete conversation from history
  const handleDeleteConversation = (convId: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== convId);
      StudyStorage.saveConversations(next);
      return next;
    });
    if (currentConversationId === convId) {
      handleStartNewChat();
    }
  };

  // Handle uploading materials via the + button
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const extracted = await extractTextFromFile(file, file.name);
      const newStudyFile: Partial<StudyFile> & { extractedContent?: string } = {
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        type: file.name.endsWith('.pdf') ? 'pdf' : 'text',
        extractedContent: extracted,
        courseCode: focusedCourse?.code,
        summary: `Document uploaded during study chat: ${file.name}.`,
      };

      if (onUploadFile) {
        onUploadFile(newStudyFile);
      }

      setAttachedMaterial({ name: file.name, content: extracted });
      setIsPlusMenuOpen(false);
      setPlusMenuTab('main');

      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const confirmMsg: AIMessage = {
        id: `upload-${Date.now()}`,
        sender: 'ai',
        text: `📎 Attached **${file.name}**. I've extracted its content and can now answer questions, summarize key concepts, or quiz you based on this material.`,
        timestamp: nowTime,
        suggestedChips: [
          `📖 Summarize ${file.name}`,
          `🧠 Quiz me on this material`,
          `📋 Extract study tasks and deadlines`,
          `💡 Explain key concepts`,
        ],
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } catch (err) {
      console.warn('File upload in chat failed:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;
    if (!aiConfigured) {
      onAISetupRequired();
      return;
    }

    const userMsg: AIMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      // Build execution context
      const context: AIExecutionContext = {
        currentCourse: focusedCourse,
        courseResources: focusedCourseResources,
        courseFiles: focusedCourseFiles,
        currentTask: attachedTask || contextTask || null,
        currentFile: contextFile || null,
        tasks: focusedCourse
          ? allTasks.filter((t) => t.courseCode?.toLowerCase() === focusedCourse.code.toLowerCase())
          : allTasks,
        schedule,
        user,
        energyLevel: user?.energyLevel,
      };

      // Add attached material text into the prompt context if present
      let messageToSend = text;
      if (attachedMaterial?.content) {
        messageToSend = `[ATTACHED STUDY MATERIAL: "${attachedMaterial.name}"]\n${attachedMaterial.content.slice(0, 3000)}\n\nStudent Query: ${text}`;
      }

      const aiResponse = await AIOrchestrator.chatWithContext(messageToSend, messages, context, config);

      const aiMsg: AIMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiResponse.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: aiResponse.actions,
        suggestedChips: aiResponse.suggestedChips,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
      const isLimitError = /429|quota|rate.?limit|resource_exhausted|too many requests|limit reached/i.test(errorMessage);
      const errorMsg: AIMessage = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: `${isLimitError ? 'AI limit reached' : 'AI request failed'}: ${errorMessage || 'The provider returned no details.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  // Action editing state
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editedDetails, setEditedDetails] = useState<Record<string, any>>({});

  const handleStartEditAction = (action: AIActionProposal) => {
    setEditingActionId(action.id);
    setEditedDetails({
      title: action.details.title || action.title,
      date: action.details.date || action.details.scheduledDate || getLocalDateKey(),
      startTime: action.details.startTime || action.details.scheduledStartTime || '15:00',
      endTime: action.details.endTime || '16:00',
      priority: action.details.priority || 'high',
      deadline: action.details.deadline || getLocalDateKey(),
    });
  };

  const handleActionConfirm = (action: AIActionProposal) => {
    const finalDetails = editingActionId === action.id ? { ...action.details, ...editedDetails } : action.details;
    const finalAction: AIActionProposal = {
      ...action,
      title: editedDetails.title || action.title,
      details: finalDetails,
    };
    onExecuteAction(finalAction);
    setEditingActionId(null);
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.actions) return m;
        return {
          ...m,
          actions: m.actions.map((a) => (a.id === action.id ? { ...a, status: 'confirmed', details: finalDetails } : a)),
        };
      })
    );
  };

  const handleActionDismiss = (actionId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.actions) return m;
        return {
          ...m,
          actions: m.actions.map((a) => (a.id === actionId ? { ...a, status: 'dismissed' } : a)),
        };
      })
    );
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col h-full animate-fade-in text-slate-900 dark:text-white">
      {/* Hidden File Input for Requirement 3 & 4 */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pdf,.docx,.txt,.md,.json,image/*"
        className="hidden"
      />

      {/* Top Header: Auto-General with Chat History Sidebar Trigger */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <MascotAvatar size={34} />
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
              <span>StudyAI Assistant</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Online" />
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {focusedCourse ? `${focusedCourse.code} · ${focusedCourse.name}` : 'General Study Mode'}
            </p>
          </div>
        </div>

        {/* Right side controls: History button to open the Chat History sidebar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer shadow-2xs group active:scale-95"
            title="Open Chat History Sidebar"
            aria-label="View Chat History"
          >
            <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-500 shrink-0" />
            <span>History</span>
          </button>
        </div>
      </header>

      {/* Requirement 2: Chat History Sidebar (Slide-out from left) */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex animate-fade-in">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity cursor-pointer"
            onClick={() => setIsHistoryOpen(false)}
            aria-hidden="true"
          />

          {/* Sidebar Drawer */}
          <aside
            className="relative z-10 w-80 sm:w-88 max-w-[85vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-slide-right"
            onClick={(e) => e.stopPropagation()}
            aria-label="Chat History Sidebar"
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Menu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Chat History</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleStartNewChat}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
                  title="Start a new chat session"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
                  title="Close sidebar"
                  aria-label="Close sidebar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {conversations.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">No chat history yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Your conversations with StudyAI will automatically be saved here.
                  </p>
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === currentConversationId;
                  const lastMsg = conv.messages[conv.messages.length - 1];
                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleLoadConversation(conv)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isActive
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 hover:border-indigo-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {conv.title}
                          </span>
                          {isActive && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold">
                              Current
                            </span>
                          )}
                        </div>
                        {lastMsg && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {lastMsg.text}
                          </p>
                        )}
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          {new Date(conv.updatedAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConversationToDelete(conv);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                        title="Delete conversation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar Footer */}
            <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between shrink-0">
              <span>{conversations.length} {conversations.length === 1 ? 'chat' : 'chats'} saved</span>
              <button
                type="button"
                onClick={handleStartNewChat}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                + New Chat
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Active Focus Context Banner (Subtle & clean) */}
      {focusedCourse && (
        <div className="mt-2 p-2 px-3 rounded-xl bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-indigo-50/80 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between text-xs animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm shrink-0">{focusedCourse.coverEmoji || '📘'}</span>
            <div className="min-w-0 flex items-center gap-1.5">
              <span className="font-extrabold uppercase font-mono text-indigo-700 dark:text-indigo-300">
                {focusedCourse.code}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-semibold truncate text-slate-800 dark:text-slate-200">
                {focusedCourse.name}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigateToCourse && (
              <button
                type="button"
                onClick={() => onNavigateToCourse(focusedCourse.id)}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Open Course →
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSelectScope('all')}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="Clear topic focus"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 min-h-[300px]">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5`}
            >
              <div className="flex items-end gap-2 max-w-[85%]">
                {!isUser && <MascotAvatar size={28} className="shrink-0 mb-1" />}

                <div
                  className={`p-3.5 rounded-[1.25rem] text-xs sm:text-sm leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-br-sm shadow-sm'
                      : msg.isError
                        ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 rounded-bl-sm shadow-sm'
                        : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm shadow-[0_6px_18px_rgba(15,23,42,0.04)]'
                  }`}
                >
                  <MarkdownMessage text={msg.text} isUser={isUser} />
                </div>

                {!isUser && (
                  <button
                    type="button"
                    onClick={() => handleSpeak(msg.id, msg.text)}
                    className={`p-1.5 rounded-xl transition-all self-end mb-1 cursor-pointer shrink-0 ${
                      speakingMsgId === msg.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    title={speakingMsgId === msg.id ? 'Stop reading' : 'Read aloud'}
                    aria-label={speakingMsgId === msg.id ? 'Stop reading' : 'Read aloud'}
                  >
                    {speakingMsgId === msg.id ? (
                      <VolumeX className="w-3.5 h-3.5 animate-pulse" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              {/* Action Proposal Cards */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="w-[85%] ml-9 space-y-2">
                  {msg.actions.map((action) => {
                    const isEditing = editingActionId === action.id;
                    const actionType = action.type;
                    const isConfirmed = action.status === 'confirmed';
                    const isDismissed = action.status === 'dismissed';

                    const getActionHeader = () => {
                      switch (actionType) {
                        case 'edit_schedule':
                          return {
                            label: 'Reschedule Calendar Event',
                            icon: Clock,
                            color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
                          };
                        case 'create_task':
                          return {
                            label: 'Create New Task',
                            icon: CheckCircle2,
                            color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
                          };
                        case 'edit_task':
                          return {
                            label: 'Update Task Details',
                            icon: Pencil,
                            color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800',
                          };
                        case 'delete_task':
                          return {
                            label: 'Delete Task',
                            icon: Trash2,
                            color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800',
                          };
                        case 'delete_schedule':
                          return {
                            label: 'Remove Calendar Event',
                            icon: Trash2,
                            color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800',
                          };
                        case 'add_schedule':
                        default:
                          return {
                            label: 'Add to Schedule',
                            icon: Calendar,
                            color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800',
                          };
                      }
                    };

                    const meta = getActionHeader();
                    const IconComponent = meta.icon;

                    if (isDismissed) {
                      return (
                        <div
                          key={action.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 opacity-60 text-xs text-slate-400 italic"
                        >
                          Action dismissed
                        </div>
                      );
                    }

                    return (
                      <div
                        key={action.id}
                        className="p-4 rounded-[1.25rem] bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${meta.color}`}
                          >
                            <IconComponent className="w-3 h-3" />
                            <span>{meta.label}</span>
                          </span>

                          {!isConfirmed && (
                            <button
                              type="button"
                              onClick={() =>
                                isEditing ? setEditingActionId(null) : handleStartEditAction(action)
                              }
                              className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>{isEditing ? 'Cancel Edit' : 'Edit Details'}</span>
                            </button>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-2.5 pt-1">
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                Title
                              </label>
                              <input
                                type="text"
                                value={editedDetails.title || ''}
                                onChange={(e) =>
                                  setEditedDetails((prev) => ({ ...prev, title: e.target.value }))
                                }
                                className="w-full px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                  Date
                                </label>
                                <input
                                  type="date"
                                  value={editedDetails.date || ''}
                                  onChange={(e) =>
                                    setEditedDetails((prev) => ({
                                      ...prev,
                                      date: e.target.value,
                                      scheduledDate: e.target.value,
                                    }))
                                  }
                                  className="w-full px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Start
                                  </label>
                                  <input
                                    type="time"
                                    value={editedDetails.startTime || ''}
                                    onChange={(e) =>
                                      setEditedDetails((prev) => ({ ...prev, startTime: e.target.value }))
                                    }
                                    className="w-full px-1.5 py-1.5 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    End
                                  </label>
                                  <input
                                    type="time"
                                    value={editedDetails.endTime || ''}
                                    onChange={(e) =>
                                      setEditedDetails((prev) => ({ ...prev, endTime: e.target.value }))
                                    }
                                    className="w-full px-1.5 py-1.5 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              {action.title}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {action.description}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                          {isConfirmed ? (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Action Executed & Saved</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 w-full">
                              <button
                                type="button"
                                onClick={() => handleActionConfirm(action)}
                                className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>
                                  {actionType === 'delete_task' || actionType === 'delete_schedule'
                                    ? 'Confirm Delete'
                                    : actionType === 'edit_task' || actionType === 'edit_schedule'
                                    ? 'Apply Update'
                                    : 'Confirm & Add'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleActionDismiss(action.id)}
                                className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-2 ml-2 text-xs text-slate-400 animate-pulse">
            <MascotAvatar size={24} />
            <span>StudyAI is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
        {/* Active attachment pill (if material or task attached) */}
        {(attachedMaterial || attachedTask) && (
          <div className="flex items-center gap-2 px-1 text-xs animate-fade-in">
            {attachedMaterial && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium text-[11px]">
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                <span className="truncate max-w-[160px]">{attachedMaterial.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachedMaterial(null)}
                  className="hover:text-rose-500 ml-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {attachedTask && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium text-[11px]">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                <span className="truncate max-w-[160px]">{attachedTask.title}</span>
                <button
                  type="button"
                  onClick={() => setAttachedTask(null)}
                  className="hover:text-rose-500 ml-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Requirement 3, 4 & 5: Clean class/course suggestion picker directly above typing area */}
        {!hasStartedChatting && courses.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-0.5 animate-fade-in">
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 shrink-0 select-none mr-0.5">
              Suggestions:
            </span>
            {courses.map((c) => {
              const isSelected = selectedCourseId === c.id;
              const title = getShortCourseTitle(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectScope(c.id)}
                  className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-slate-700/80'
                  }`}
                  title={`Focus on ${c.name} (${c.code})`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 transition-transform group-hover:scale-125"
                    style={{ backgroundColor: isSelected ? '#FFFFFF' : (c.color || '#6366F1') }}
                  />
                  <span>{title}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Input Bar Row */}
        <div className="flex items-center gap-2">
          {/* Standalone Voice Input Area / Button outside */}
          <button
            type="button"
            onClick={onOpenVoiceModal}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-indigo-600 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/50 transition-all active:scale-95 shrink-0 cursor-pointer"
            title="Voice AI Conversation (Speak)"
            aria-label="Speak with voice input"
          >
            <Mic className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </button>

          {/* Message Input Container (With + Button INSIDE the text area) */}
          <div className="flex-1 flex items-center gap-2 p-1.5 pl-2 pr-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm focus-within:border-indigo-500 transition-colors">
            {/* Plus (+) Button inside the text area */}
            <div className="relative shrink-0" ref={plusMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setIsPlusMenuOpen((prev) => !prev);
                  setPlusMenuTab('main');
                }}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isPlusMenuOpen
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Add materials, upload data, or select study area"
                aria-label="Upload materials or select topic"
              >
                <Plus className={`w-3.5 h-3.5 transition-transform ${isPlusMenuOpen ? 'rotate-45' : ''}`} />
              </button>

              {/* Requirement 4: + Popup menu */}
              {isPlusMenuOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-72 sm:w-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl p-2 z-50 animate-slide-up space-y-1">
                  {plusMenuTab === 'main' ? (
                    <>
                      <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Study Options</span>
                        <span className="text-[10px] text-slate-400">Context & Data</span>
                      </div>

                      {/* Requirement 4: Option to select which area user wants to chat */}
                      <button
                        type="button"
                        onClick={() => setPlusMenuTab('areas')}
                        className="w-full text-left p-2.5 rounded-xl flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm shrink-0">
                            <GraduationCap className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold">Select Study Area</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              {focusedCourse ? `Current: ${focusedCourse.code} · ${focusedCourse.name}` : 'Current: General Study'}
                            </div>
                          </div>
                        </div>
                        <ChevronDown className="w-3.5 h-3.5 -rotate-90 text-slate-400" />
                      </button>

                      {/* Requirement 3: Upload data and materials */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsPlusMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="w-full text-left p-2.5 rounded-xl flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm shrink-0">
                            <UploadCloud className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold">Upload Data & Materials</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">PDF, lecture notes, syllabus, docx, slides</div>
                          </div>
                        </div>
                      </button>

                      {/* Attach active task */}
                      {allTasks.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPlusMenuTab('tasks')}
                          className="w-full text-left p-2.5 rounded-xl flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm shrink-0">
                              <CheckSquare className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold">Attach an Active Task</div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">Focus questions on an assignment or goal</div>
                            </div>
                          </div>
                          <ChevronDown className="w-3.5 h-3.5 -rotate-90 text-slate-400" />
                        </button>
                      )}
                    </>
                  ) : plusMenuTab === 'areas' ? (
                    /* Area Sub-menu */
                    <div className="space-y-1">
                      <div className="px-2 py-1 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setPlusMenuTab('main')}
                          className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                        >
                          ← Back
                        </button>
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Choose Study Area
                        </span>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1 pt-1">
                        <button
                          type="button"
                          onClick={() => handleSelectScope('all')}
                          className={`w-full text-left p-2 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                            selectedCourseId === 'all'
                              ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 font-bold'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            <span>✨ General Study</span>
                          </div>
                          {selectedCourseId === 'all' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                        </button>

                        {courses.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectScope(c.id)}
                            className={`w-full text-left p-2 rounded-xl flex items-center justify-between text-xs transition-colors cursor-pointer ${
                              selectedCourseId === c.id
                                ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 font-bold'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span>{c.coverEmoji || '📘'}</span>
                              <span className="font-mono uppercase font-bold" style={{ color: c.color }}>
                                {c.code}
                              </span>
                              <span className="truncate text-slate-500 text-[11px]">{c.name}</span>
                            </div>
                            {selectedCourseId === c.id && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Task Sub-menu */
                    <div className="space-y-1">
                      <div className="px-2 py-1 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setPlusMenuTab('main')}
                          className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                        >
                          ← Back
                        </button>
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Attach Active Task
                        </span>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1 pt-1">
                        {allTasks.slice(0, 8).map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => {
                              setAttachedTask(task);
                              setIsPlusMenuOpen(false);
                              setPlusMenuTab('main');
                            }}
                            className="w-full text-left p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 text-xs flex items-center justify-between transition-colors cursor-pointer"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                {task.title}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {task.courseCode ? `[${task.courseCode}] ` : ''}Due {task.deadline.slice(0, 10)}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <input
              type="text"
              placeholder={
                focusedCourse
                  ? `Ask anything about ${focusedCourse.code} (${focusedCourse.name})...`
                  : attachedTask
                  ? `Ask about ${attachedTask.title}...`
                  : 'Type a message or ask StudyAI...'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none min-w-0"
            />

            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!inputText.trim() || isTyping}
              className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 shadow-sm transition-all active:scale-95 cursor-pointer"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(conversationToDelete)}
        title="Delete chat?"
        description={
          conversationToDelete
            ? `"${conversationToDelete.title}" and its messages will be permanently removed.`
            : ''
        }
        confirmLabel="Delete chat"
        onConfirm={() => {
          if (conversationToDelete) handleDeleteConversation(conversationToDelete.id);
          setConversationToDelete(null);
        }}
        onCancel={() => setConversationToDelete(null)}
      />
    </div>
  );
};
