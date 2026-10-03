/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';

import { MobileBottomNav, NavTab } from './components/mobile/MobileBottomNav';
import { QuickActionsSheet } from './components/mobile/QuickActionsSheet';
import { VoiceAIModal } from './components/mobile/VoiceAIModal';
import {
  signInWithGoogle,
  signOutUser,
  onAuthChange,
  syncUserProfileToFirestore,
  syncTasksToFirestore,
  syncScheduleToFirestore,
  syncCoursesToFirestore,
  syncResourcesToFirestore,
  fetchUserDataFromFirestore,
} from './lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';

import { OnboardingFlow } from './components/screens/OnboardingFlow';
import { HomeScreen } from './components/screens/HomeScreen';
import { WhatToDoNowScreen } from './components/screens/WhatToDoNowScreen';
import { TasksScreen } from './components/screens/TasksScreen';
import { TaskDetailScreen } from './components/screens/TaskDetailScreen';
import { CourseWorkspaceScreen } from './components/screens/CourseWorkspaceScreen';
import { CoursesScreen } from './components/screens/CoursesScreen';
import { ResourceReaderScreen } from './components/screens/ResourceReaderScreen';
import { CourseTutorScreen } from './components/screens/CourseTutorScreen';
import { CalendarScreen } from './components/screens/CalendarScreen';
import { AIWeekPlannerModal } from './components/screens/AIWeekPlannerModal';
import { AIChatScreen } from './components/screens/AIChatScreen';
import { ResearchScreen } from './components/screens/ResearchScreen';
import { FilesScreen } from './components/screens/FilesScreen';
import { ProgressScreen } from './components/screens/ProgressScreen';
import { GoalsScreen } from './components/screens/GoalsScreen';
import { StudySessionScreen } from './components/screens/StudySessionScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import { AIProviderScreen } from './components/screens/AIProviderScreen';
import { ProfileScreen } from './components/screens/ProfileScreen';
import { NotificationsScreen } from './components/screens/NotificationsScreen';
import { MoreScreen } from './components/screens/MoreScreen';
import { SideDrawer } from './components/screens/SideDrawer';
import { AIMemoryModal } from './components/screens/AIMemoryModal';
import { LockscreenNotificationModal } from './components/screens/LockscreenNotificationModal';
import { AISetupPrompt } from './components/mobile/AISetupPrompt';

import {
  UserProfile,
  Task,
  ScheduleEvent,
  Goal,
  StudyFile,
  StudyNote,
  ResearchItem,
  AIProviderConfig,
  AIMemoryItem,
  NotificationItem,
  ProgressMetrics,
  AIActionProposal,
  Course,
  CourseResource,
  CourseResourceReading,
  ResourceAnnotation,
  CourseQuiz,
  CourseFlashcard,
} from './types';
import { StudyStorage } from './utils/storage';
import { playChime } from './utils/audio';
import { AIOrchestrator } from './services/aiOrchestrator';
import { getLocalDateKey } from './utils/dates';
import { computeCourseProgress, getCourseResources } from './utils/courses';

function getEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const normalizedMinutes = totalMinutes % (24 * 60);
  return `${String(Math.floor(normalizedMinutes / 60)).padStart(2, '0')}:${String(normalizedMinutes % 60).padStart(2, '0')}`;
}

export default function App() {
  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });


  // Core Persistent State
  const [user, setUser] = useState<UserProfile>(() => StudyStorage.getUser());
  const [courses, setCourses] = useState<Course[]>(() => StudyStorage.getCourses());
  const [resources, setResources] = useState<CourseResource[]>(() => StudyStorage.getResources());
  const [annotations, setAnnotations] = useState<ResourceAnnotation[]>(() => StudyStorage.getAnnotations());
  const [quizzes, setQuizzes] = useState<CourseQuiz[]>(() => StudyStorage.getQuizzes());
  const [flashcards, setFlashcards] = useState<CourseFlashcard[]>(() => StudyStorage.getFlashcards());
  const [tasks, setTasks] = useState<Task[]>(() => StudyStorage.getTasks());
  const [schedule, setSchedule] = useState<ScheduleEvent[]>(() => StudyStorage.getSchedule());
  const [goals, setGoals] = useState<Goal[]>(() => StudyStorage.getGoals());
  const [files, setFiles] = useState<StudyFile[]>(() => StudyStorage.getFiles());
  const [notes, setNotes] = useState<StudyNote[]>(() => StudyStorage.getNotes());
  const [research, setResearch] = useState<ResearchItem[]>(() => StudyStorage.getResearch());
  const [aiConfig, setAIConfig] = useState<AIProviderConfig>(() => StudyStorage.getAIConfig());
  const [aiMemory, setAIMemory] = useState<AIMemoryItem[]>(() => StudyStorage.getAIMemory());
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => StudyStorage.getNotifications());
  const [metrics, setMetrics] = useState<ProgressMetrics>(() => StudyStorage.getMetrics());

  // Navigation state
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [activeSubScreen, setActiveSubScreen] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(tasks[0] || null);
  const [taskCourseFilter, setTaskCourseFilter] = useState<string | undefined>();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [courseTutorPrefill, setCourseTutorPrefill] = useState<string | undefined>();
  const [courseTutorQuizResourceId, setCourseTutorQuizResourceId] = useState<string | undefined>();
  const [courseTutorCardsResourceId, setCourseTutorCardsResourceId] = useState<string | undefined>();
  const [courseTutorTab, setCourseTutorTab] = useState<'learn' | 'tutor' | 'quiz' | 'cards' | undefined>();
  const [selectedFileForChat, setSelectedFileForChat] = useState<StudyFile | null>(null);

  // Modals state
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isWeekPlannerOpen, setIsWeekPlannerOpen] = useState(false);
  const [isAIMemoryOpen, setIsAIMemoryOpen] = useState(false);
  const [isSideDrawerOpen, setIsSideDrawerOpen] = useState(false);
  const [isTaskComposerOpen, setIsTaskComposerOpen] = useState(false);
  const [isLockscreenOpen, setIsLockscreenOpen] = useState(false);
  const [isAISetupPromptOpen, setIsAISetupPromptOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(!user.isOnboarded);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isFirebaseSyncing, setIsFirebaseSyncing] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3500);
  };

  const isAIProviderConfigured = (config: AIProviderConfig) => {
    if (config.activeProvider === 'puter') return Boolean(config.puterUser);
    if (config.activeProvider === 'gemini') return Boolean(config.apiKeys.gemini);
    if (config.activeProvider === 'openai') return Boolean(config.apiKeys.openai);
    if (config.activeProvider === 'claude') return Boolean(config.apiKeys.claude);
    return Boolean(config.apiKeys.custom && config.customEndpoint);
  };

  const requireAIProvider = (action: () => void) => {
    if (!isAIProviderConfigured(aiConfig)) {
      setIsAISetupPromptOpen(true);
      return;
    }
    action();
  };

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthChange(async (fUser) => {
      setFirebaseUser(fUser);
      if (fUser) {
        setIsFirebaseSyncing(true);
        try {
          const cloudData = await fetchUserDataFromFirestore(fUser.uid);
          if (cloudData.profile) {
            setUser((prev) => ({
              ...prev,
              ...cloudData.profile,
              email: fUser.email || prev.email,
              name: fUser.displayName || prev.name,
              photoURL: fUser.photoURL || undefined,
              firebaseUid: fUser.uid,
              isFirebaseSynced: true,
            }));
          } else {
            await syncUserProfileToFirestore(fUser.uid, {
              ...user,
              email: fUser.email || user.email,
              name: fUser.displayName || user.name,
              photoURL: fUser.photoURL || undefined,
              firebaseUid: fUser.uid,
              isFirebaseSynced: true,
            });
            await syncTasksToFirestore(fUser.uid, tasks);
            await syncScheduleToFirestore(fUser.uid, schedule);
            await syncCoursesToFirestore(fUser.uid, courses);
            await syncResourcesToFirestore(fUser.uid, resources);
          }

          if (cloudData.tasks && cloudData.tasks.length > 0) {
            setTasks(cloudData.tasks);
          }
          if (cloudData.schedule && cloudData.schedule.length > 0) {
            setSchedule(cloudData.schedule);
          }
          if (cloudData.courses && cloudData.courses.length > 0) {
            setCourses(cloudData.courses);
          }
          if (cloudData.resources && cloudData.resources.length > 0) {
            setResources(cloudData.resources);
          }
          showToast(`Cloud connected: ${fUser.displayName || 'Google Account'}`);
        } catch (e) {
          console.warn('Sync load error:', e);
        } finally {
          setIsFirebaseSyncing(false);
        }
      }
    });
    return () => unsub();
  }, []);

  // Sync state to Firestore when updated and user is signed in
  useEffect(() => {
    if (firebaseUser) {
      syncTasksToFirestore(firebaseUser.uid, tasks);
    }
  }, [tasks, firebaseUser]);

  useEffect(() => {
    if (firebaseUser) {
      syncScheduleToFirestore(firebaseUser.uid, schedule);
    }
  }, [schedule, firebaseUser]);

  useEffect(() => {
    if (firebaseUser) {
      syncCoursesToFirestore(firebaseUser.uid, courses);
    }
  }, [courses, firebaseUser]);

  useEffect(() => {
    if (firebaseUser) {
      syncResourcesToFirestore(firebaseUser.uid, resources);
    }
  }, [resources, firebaseUser]);

  useEffect(() => {
    if (firebaseUser) {
      syncUserProfileToFirestore(firebaseUser.uid, user);
    }
  }, [user, firebaseUser]);

  const handleGoogleSignIn = async () => {
    try {
      const fUser = await signInWithGoogle();
      if (fUser) {
        playChime('success');
      }
    } catch (err: any) {
      if (!err?.message?.includes('closed-by-user')) {
        showToast('Google Sign-In was cancelled or failed.');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setFirebaseUser(null);
      setUser((prev) => ({
        ...prev,
        isFirebaseSynced: false,
        firebaseUid: undefined,
        photoURL: undefined,
      }));
      showToast('Signed out of Google account.');
    } catch (err) {
      console.error(err);
    }
  };

  // Sync to local storage
  useEffect(() => {
    StudyStorage.saveUser(user);
  }, [user]);

  useEffect(() => {
    StudyStorage.saveCourses(courses);
  }, [courses]);

  useEffect(() => {
    StudyStorage.saveResources(resources);
  }, [resources]);

  useEffect(() => {
    StudyStorage.saveAnnotations(annotations);
  }, [annotations]);

  useEffect(() => {
    StudyStorage.saveQuizzes(quizzes);
  }, [quizzes]);

  useEffect(() => {
    StudyStorage.saveFlashcards(flashcards);
  }, [flashcards]);

  useEffect(() => {
    StudyStorage.saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    StudyStorage.saveSchedule(schedule);
  }, [schedule]);

  useEffect(() => {
    StudyStorage.saveGoals(goals);
  }, [goals]);

  useEffect(() => {
    StudyStorage.saveFiles(files);
  }, [files]);

  useEffect(() => {
    StudyStorage.saveNotes(notes);
  }, [notes]);

  useEffect(() => {
    StudyStorage.saveResearch(research);
  }, [research]);

  useEffect(() => {
    StudyStorage.saveAIConfig(aiConfig);
  }, [aiConfig]);

  useEffect(() => {
    StudyStorage.saveAIMemory(aiMemory);
  }, [aiMemory]);

  useEffect(() => {
    StudyStorage.saveNotifications(notifications);
  }, [notifications]);

  // Surface planned task reminders in-app once per task and calendar day.
  useEffect(() => {
    const checkTaskReminders = () => {
      const now = new Date();
      const todayKey = getLocalDateKey(now);
      const todayNumber = new Date(`${todayKey}T12:00:00`).getDay();

      tasks.forEach((task) => {
        if (task.completed || !task.reminder?.enabled || !task.scheduledDate || !task.scheduledStartTime) return;

        const startsToday =
          task.scheduledDate === todayKey ||
          (task.scheduledDate < todayKey && task.recurrence === 'daily') ||
          (task.scheduledDate < todayKey && task.recurrence === 'weekdays' && todayNumber > 0 && todayNumber < 6) ||
          (task.scheduledDate < todayKey && task.recurrence === 'weekly' &&
            new Date(`${task.scheduledDate}T12:00:00`).getDay() === todayNumber);
        if (!startsToday) return;

        const scheduled = new Date(`${todayKey}T${task.scheduledStartTime}:00`);
        const reminderAt = scheduled.getTime() - task.reminder.minutesBefore * 60 * 1000;
        if (now.getTime() < reminderAt || now.getTime() > scheduled.getTime() + 60 * 1000) return;

        const notificationId = `task-reminder-${task.id}-${todayKey}`;
        setNotifications((prev) => {
          if (prev.some((notification) => notification.id === notificationId)) return prev;
          return [
            {
              id: notificationId,
              title: `Reminder: ${task.title}`,
              message: `Your planned study time is ${task.scheduledStartTime}.`,
              timestamp: 'Just now',
              read: false,
              type: 'reminder',
              actionLabel: 'Open task',
            },
            ...prev,
          ];
        });

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`StudyAI reminder: ${task.title}`, {
            body: `Planned for ${task.scheduledStartTime}.`,
          });
        }
      });
    };

    checkTaskReminders();
    const intervalId = window.setInterval(checkTaskReminders, 60000);
    return () => window.clearInterval(intervalId);
  }, [tasks]);

  useEffect(() => {
    StudyStorage.saveMetrics(metrics);
  }, [metrics]);

  // Sync dark class on body
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Handle Tab navigation
  const handleTabChange = (tab: NavTab) => {
    if (tab === 'ai' && !isAIProviderConfigured(aiConfig)) {
      setIsAISetupPromptOpen(true);
      return;
    }
    setActiveSubScreen(null);
    setSelectedCourseId(null);
    setSelectedResourceId(null);
    if (tab !== 'tasks') setTaskCourseFilter(undefined);
    setCurrentTab(tab);
  };

  const [courseWorkspaceInitialTab, setCourseWorkspaceInitialTab] = useState<'overview' | 'tasks' | 'resources' | 'ai' | 'progress'>('overview');

  // Open a course workspace by id (used by the Courses list + Home course cards).
  const openCourseById = (courseId: string, initialTab?: 'overview' | 'tasks' | 'resources' | 'ai' | 'progress') => {
    setSelectedCourseId(courseId);
    setCourseWorkspaceInitialTab(initialTab || 'overview');
    setActiveSubScreen('course');
  };

  // Home course cards are keyed by course code; resolve (or create) the matching course.
  const openCourseByCode = (courseCode: string) => {
    const existing = courses.find((c) => c.code === courseCode);
    if (existing) {
      openCourseById(existing.id);
      return;
    }
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      code: courseCode,
      name: courseCode,
      color: '#6366F1',
      objectives: [],
      modules: [],
      materialsFileIds: [],
      resourceIds: [],
      studyPlan: [],
      createdAt: new Date().toISOString(),
    };
    setCourses((prev) => [...prev, newCourse]);
    openCourseById(newCourse.id);
  };

  // Courses system actions
  const handleCreateCourse = (data: { name: string; code: string; color: string }) => {
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      code: data.code,
      name: data.name,
      color: data.color,
      objectives: [],
      modules: [],
      materialsFileIds: [],
      resourceIds: [],
      studyPlan: [],
      createdAt: new Date().toISOString(),
    };
    setCourses((prev) => [...prev, newCourse]);
    playChime('success');
  };

  const handleToggleModule = (courseId: string, moduleId: string) => {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId
          ? { ...c, modules: c.modules.map((m) => (m.id === moduleId ? { ...m, completed: !m.completed } : m)) }
          : c
      )
    );
  };

  const handleAddResource = (courseId: string, courseCode: string, data: Partial<CourseResource>) => {
    const newRes: CourseResource = {
      id: `res-${Date.now()}`,
      courseId,
      courseCode,
      moduleId: data.moduleId,
      title: data.title || 'Untitled resource',
      type: data.type || 'text',
      sourceUrl: data.sourceUrl,
      content: data.content || '',
      fileName: data.fileName,
      mime: data.mime,
      fileData: data.fileData,
      fileStorageKey: data.fileStorageKey,
      estimatedReadMinutes: data.estimatedReadMinutes || 5,
      tags: data.tags || [],
      createdAt: new Date().toISOString(),
      reading: { percent: 0, lastPosition: 0, completed: false },
      aiContext: {
        status: 'analyzing',
        summary: 'AI is analyzing and indexing document context…',
        keyConcepts: [],
        denseContext: '',
      },
    };
    setResources((prev) => [newRes, ...prev]);
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, resourceIds: [...c.resourceIds, newRes.id] } : c))
    );
    playChime('success');

    // Auto-send to AI for deep background analysis and permanent context caching
    AIOrchestrator.analyzeAndIndexMaterial(
      {
        title: newRes.title,
        type: newRes.type,
        content: newRes.content,
        courseCode: newRes.courseCode,
      },
      aiConfig
    )
      .then((aiCtx) => {
        setResources((prev) =>
          prev.map((r) =>
            r.id === newRes.id
              ? {
                  ...r,
                  aiContext: aiCtx,
                  tags: Array.from(new Set([...r.tags, ...aiCtx.keyConcepts.slice(0, 3)])),
                }
              : r
          )
        );
      })
      .catch((err) => {
        console.warn('Auto AI indexing failed for resource:', err);
      });
  };

  /** Shared by the Files screen and the course workspace so uploads land in one place. */
  const handleUploadFile = (newF: Partial<StudyFile> & { extractedContent?: string }) => {
    const f: StudyFile = {
      id: `file-${Date.now()}`,
      name: newF.name || 'Document.pdf',
      size: newF.size || '1.5 MB',
      type: newF.type || 'pdf',
      uploadedAt: 'Just now',
      summary: newF.summary || 'Summary generated by StudyAI.',
      extractedDeadlines: newF.extractedDeadlines || [],
      keyTopics: newF.keyTopics || ['Study Notes'],
      courseCode: newF.courseCode,
      dataUrl: newF.dataUrl,
      fileStorageKey: newF.fileStorageKey,
      aiContext: {
        status: 'analyzing',
        summary: 'AI is analyzing and indexing document context…',
        keyConcepts: [],
        denseContext: '',
      },
    };
    setFiles((prev) => [f, ...prev]);
    playChime('success');

    // Auto-send to AI for deep background analysis and permanent context caching
    AIOrchestrator.analyzeAndIndexMaterial(
      {
        title: f.name,
        type: f.type,
        content: newF.extractedContent || f.summary,
        courseCode: f.courseCode,
      },
      aiConfig
    )
      .then((aiCtx) => {
        setFiles((prev) =>
          prev.map((item) =>
            item.id === f.id
              ? {
                  ...item,
                  summary: aiCtx.summary,
                  keyTopics: aiCtx.keyConcepts,
                  aiContext: aiCtx,
                }
              : item
          )
        );
      })
      .catch((err) => {
        console.warn('Auto AI indexing failed for file:', err);
      });
  };

  const handleReindexFile = (fileId: string) => {
    const target = files.find((f) => f.id === fileId);
    if (!target) return;

    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? {
              ...f,
              aiContext: {
                status: 'analyzing',
                summary: 'AI is re-indexing file context…',
                keyConcepts: [],
                denseContext: '',
              },
            }
          : f
      )
    );

    AIOrchestrator.analyzeAndIndexMaterial(
      {
        title: target.name,
        type: target.type,
        content: target.summary,
        courseCode: target.courseCode,
      },
      aiConfig
    )
      .then((aiCtx) => {
        setFiles((prev) =>
          prev.map((item) =>
            item.id === fileId
              ? {
                  ...item,
                  summary: aiCtx.summary,
                  keyTopics: aiCtx.keyConcepts,
                  aiContext: aiCtx,
                }
              : item
          )
        );
      })
      .catch((err) => {
        console.warn('File re-indexing failed:', err);
      });
  };

  const handleReindexResource = (resourceId: string) => {
    const target = resources.find((r) => r.id === resourceId);
    if (!target) return;

    setResources((prev) =>
      prev.map((r) =>
        r.id === resourceId
          ? {
              ...r,
              aiContext: {
                status: 'analyzing',
                summary: 'AI is re-indexing document context…',
                keyConcepts: [],
                denseContext: '',
              },
            }
          : r
      )
    );

    AIOrchestrator.analyzeAndIndexMaterial(
      {
        title: target.title,
        type: target.type,
        content: target.content,
        courseCode: target.courseCode,
      },
      aiConfig
    )
      .then((aiCtx) => {
        setResources((prev) =>
          prev.map((r) => (r.id === resourceId ? { ...r, aiContext: aiCtx } : r))
        );
      })
      .catch((err) => {
        console.warn('Re-indexing failed:', err);
      });
  };

  const handleUpdateReading = (resourceId: string, patch: Partial<CourseResourceReading>) => {
    setResources((prev) =>
      prev.map((r) => (r.id === resourceId ? { ...r, reading: { ...r.reading, ...patch } } : r))
    );
  };

  const handleSaveAnnotation = (annotation: ResourceAnnotation) => {
    setAnnotations((prev) => {
      const exists = prev.some((item) => item.id === annotation.id);
      return exists ? prev.map((item) => (item.id === annotation.id ? annotation : item)) : [...prev, annotation];
    });
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    setAnnotations((prev) => prev.filter((annotation) => annotation.id !== annotationId));
  };

  const handleSaveQuiz = (quiz: CourseQuiz) => {
    setQuizzes((prev) => {
      const exists = prev.some((q) => q.id === quiz.id);
      return exists ? prev.map((q) => (q.id === quiz.id ? quiz : q)) : [quiz, ...prev];
    });
  };

  const handleSaveFlashcards = (cards: CourseFlashcard[]) => {
    setFlashcards((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]));
      cards.forEach((c) => map.set(c.id, c));
      return Array.from(map.values());
    });
  };

  // Handle Action Execution (Section 4 & 44)
  const handleExecuteAction = (action: AIActionProposal) => {
    playChime('success');
    confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });

    if (action.type === 'add_schedule') {
      const details = action.details || {};
      const newEvent: ScheduleEvent = {
        id: `sched-${Date.now()}`,
        title: details.title || action.title,
        startTime: details.startTime || '15:00',
        endTime: details.endTime || '16:30',
        date: details.date || getLocalDateKey(),
        type: details.type || 'study',
        color: details.color || '#6366F1',
        isCompleted: false,
      };
      setSchedule((prev) => [...prev, newEvent]);

      // Add notification record
      const notif: NotificationItem = {
        id: `notif-${Date.now()}`,
        title: 'Schedule Updated by StudyAI',
        message: `Added "${newEvent.title}" (${newEvent.startTime}–${newEvent.endTime}) to your calendar.`,
        timestamp: 'Just now',
        read: false,
        type: 'reminder',
      };
      setNotifications((prev) => [notif, ...prev]);
    } else if (action.type === 'create_task') {
      const details = action.details || {};
      const deadline = details.deadline || details.dueDate || new Date(Date.now() + 86400000).toISOString();
      const courseCode = details.courseCode || undefined;
      const courseColors: Record<string, string> = {
        CS101: '#EF4444',
        Math: '#F59E0B',
        Project: '#10B981',
        Other: '#6366F1',
      };
      const newTask: Task = {
        id: `task-${Date.now()}`,
        title: details.title || action.title || 'New task',
        description: details.description || '',
        courseCode,
        courseColor: details.courseColor || (courseCode ? courseColors[courseCode] : '#64748B') || '#6366F1',
        category: details.category || (courseCode ? 'academic' : 'personal'),
        type: details.type || (details.recurrence && details.recurrence !== 'none' ? 'habit' : 'other'),
        deadline: deadline.includes('T') ? deadline : new Date(`${deadline}T23:59:59`).toISOString(),
        scheduledDate: details.scheduledDate || details.date || undefined,
        scheduledStartTime: details.scheduledStartTime || details.time || undefined,
        recurrence: details.recurrence || 'none',
        reminder: {
          enabled: details.reminderEnabled !== false,
          minutesBefore: Number(details.reminderMinutes) || 30,
        },
        estimatedMinutes: Number(details.estimatedMinutes) || 45,
        priority: details.priority || 'medium',
        progress: 0,
        completed: false,
        subtasks: [],
        relatedFileIds: [],
        relatedResearchIds: [],
        aiPlanReason: 'Created from your StudyAI command.',
        createdAt: new Date().toISOString(),
      };
      setTasks((prev) => [newTask, ...prev]);
      const scheduledDate = newTask.scheduledDate;
      const scheduledStartTime = newTask.scheduledStartTime;
      if (scheduledDate && scheduledStartTime) {
        setSchedule((prev) => [
          {
            id: `sched-${Date.now()}`,
            title: `${newTask.courseCode ? `${newTask.courseCode} · ` : ''}${newTask.title}`,
            startTime: scheduledStartTime,
            endTime: getEndTime(scheduledStartTime, newTask.estimatedMinutes),
            date: scheduledDate,
            type: 'study',
            courseCode: newTask.courseCode,
            color: newTask.courseColor,
            isCompleted: false,
          },
          ...prev,
        ]);
      }
      setNotifications((prev) => [
        {
          id: `notif-${Date.now()}`,
          title: 'Task added by StudyAI',
          message: `Created "${newTask.title}"${newTask.scheduledDate ? ` for ${newTask.scheduledDate}` : ''}.`,
          timestamp: 'Just now',
          read: false,
          type: 'reminder',
        },
        ...prev,
      ]);
    }
  };

  // Task Actions
  /**
   * Single task-creation path shared by the Tasks screen and the course
   * workspaces, so adding from a course behaves exactly like adding from Tasks.
   */
  const handleCreateTask = (taskData: Partial<Task>, autoPlan: boolean) => {
    const newT: Task = {
      id: `task-${Date.now()}`,
      title: taskData.title || 'New Task',
      description: taskData.description || '',
      courseCode: taskData.courseCode,
      courseColor: taskData.courseColor || (taskData.courseCode ? '#EF4444' : '#64748B'),
      category: taskData.category || (taskData.courseCode ? 'academic' : 'personal'),
      type: taskData.type || 'assignment',
      deadline: taskData.deadline || '2026-10-04T23:59:00Z',
      scheduledDate: taskData.scheduledDate,
      scheduledStartTime: taskData.scheduledStartTime,
      recurrence: taskData.recurrence || 'none',
      reminder: taskData.reminder || { enabled: false, minutesBefore: 30 },
      estimatedMinutes: taskData.estimatedMinutes || 45,
      priority: taskData.priority || 'high',
      progress: 0,
      completed: false,
      subtasks: [
        { id: `sub-1`, title: 'Review lecture notes & constraints', completed: false, estimatedMinutes: 15, order: 1 },
        { id: `sub-2`, title: 'Draft core solution', completed: false, estimatedMinutes: 20, order: 2 },
        { id: `sub-3`, title: 'Verify and submit deliverable', completed: false, estimatedMinutes: 10, order: 3 },
      ],
      relatedFileIds: [],
      relatedResearchIds: [],
      aiPlanReason: 'Decomposed by StudyAI into focused 15-minute milestones.',
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [newT, ...prev]);

    const scheduledDate = taskData.scheduledDate;
    const scheduledStartTime = taskData.scheduledStartTime;
    if (scheduledDate && scheduledStartTime) {
      setSchedule((prev) => [
        {
          id: `sched-${Date.now()}`,
          title: `${taskData.courseCode ? `${taskData.courseCode} · ` : ''}${newT.title}`,
          startTime: scheduledStartTime,
          endTime: getEndTime(scheduledStartTime, newT.estimatedMinutes),
          date: scheduledDate,
          type: 'study',
          courseCode: taskData.courseCode,
          color: newT.courseColor,
          isCompleted: false,
        },
        ...prev,
      ]);
    }
    playChime('success');
    void autoPlan;
  };

  const handleToggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const next = !t.completed;
          if (next) {
            playChime('success');
            confetti({ particleCount: 60, spread: 50, origin: { y: 0.6 } });
          }
          return {
            ...t,
            completed: next,
            completedAt: next ? new Date().toISOString() : undefined,
            progress: next ? 100 : t.progress,
          };
        }
        return t;
      })
    );
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const updatedSubs = t.subtasks.map((s) => {
            if (s.id === subtaskId) {
              const next = !s.completed;
              if (next) playChime('reminder');
              return { ...s, completed: next };
            }
            return s;
          });
          const comp = updatedSubs.filter((s) => s.completed).length;
          const pct = Math.round((comp / updatedSubs.length) * 100);
          return { ...t, subtasks: updatedSubs, progress: pct };
        }
        return t;
      })
    );
  };

  const handleAddSubtask = (taskId: string, title: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const newSub = {
            id: `sub-${Date.now()}`,
            title,
            completed: false,
            estimatedMinutes: 15,
            order: t.subtasks.length + 1,
          };
          return { ...t, subtasks: [...t.subtasks, newSub] };
        }
        return t;
      })
    );
  };

  const handleRegenerateAIPlan = async (task: Task) => {
    playChime('reminder');
    const result = await AIOrchestrator.generateAITaskPlan(task, aiConfig);
    const newSubs = result.steps.map((st, idx) => ({
      id: `sub-${Date.now()}-${idx}`,
      title: st,
      completed: false,
      estimatedMinutes: Math.round(task.estimatedMinutes / result.steps.length) || 15,
      order: idx + 1,
    }));

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, subtasks: newSubs, aiPlanReason: result.reason } : t
      )
    );
    playChime('success');
  };

  // Reset Demo Seed Data
  const handleResetData = () => {
    localStorage.clear();
    window.location.reload();
  };

  // Render SubScreens or Tabs
  const renderCurrentView = () => {
    const currentSelectedTask = selectedTask
      ? tasks.find((task) => task.id === selectedTask.id) || selectedTask
      : null;

    const selectedCourse = selectedCourseId ? courses.find((c) => c.id === selectedCourseId) || null : null;
    const selectedCourseResources = selectedCourse ? getCourseResources(selectedCourse, resources) : [];

    if (activeSubScreen === 'courses') {
      return (
        <CoursesScreen
          courses={courses}
          tasks={tasks}
          resources={resources}
          onOpenCourse={openCourseById}
          onCreateCourse={handleCreateCourse}
        />
      );
    }

    if (activeSubScreen === 'course' && selectedCourse) {
      const courseProgress = computeCourseProgress(selectedCourse, tasks, resources);
      return (
        <CourseWorkspaceScreen
          course={selectedCourse}
          tasks={tasks}
          files={files}
          schedule={schedule}
          resources={selectedCourseResources}
          progress={courseProgress}
          config={aiConfig}
          aiConfigured={isAIProviderConfigured(aiConfig)}
          onAISetupRequired={() => setIsAISetupPromptOpen(true)}
          initialTab={courseWorkspaceInitialTab}
          onBack={() => {
            setActiveSubScreen(null);
            setSelectedResourceId(null);
          }}
          onSelectTask={(task) => {
            setSelectedTask(task);
            setActiveSubScreen('task_detail');
          }}
          onOpenFiles={() => setActiveSubScreen('files')}
          onOpenCalendar={() => {
            setActiveSubScreen(null);
            setCurrentTab('calendar');
          }}
          onAddPlanStep={(courseId, step) =>
            setCourses((prev) =>
              prev.map((item) => (item.id === courseId ? { ...item, studyPlan: [...item.studyPlan, step] } : item))
            )
          }
          onToggleModule={handleToggleModule}
          onOpenResource={(resource) => {
            setSelectedResourceId(resource.id);
            setActiveSubScreen('resource_reader');
          }}
          onReindexResource={handleReindexResource}
          onOpenTutor={(opts) => {
            requireAIProvider(() => {
              setCourseTutorPrefill(opts?.prompt);
              setCourseTutorQuizResourceId(opts?.resourceId);
              setCourseTutorCardsResourceId(opts?.resourceId);
              setCourseTutorTab(opts?.tab);
              setActiveSubScreen('course_tutor');
            });
          }}
          onAddResource={(data) => handleAddResource(selectedCourse.id, selectedCourse.code, data)}
          onUploadFile={handleUploadFile}
          onAddTask={handleCreateTask}
          onToggleTask={handleToggleTask}
          onViewAllTasks={(courseCode) => {
            setTaskCourseFilter(courseCode);
            setActiveSubScreen(null);
            setCurrentTab('tasks');
          }}
        />
      );
    }

    if (activeSubScreen === 'resource_reader' && selectedCourse) {
      const resource = selectedCourseResources.find((r) => r.id === selectedResourceId);
      if (resource) {
        return (
          <ResourceReaderScreen
            resource={resource}
            course={selectedCourse}
            config={aiConfig}
            onBack={() => setActiveSubScreen('course')}
            onUpdateReading={handleUpdateReading}
            annotations={annotations.filter((annotation) => annotation.resourceId === resource.id)}
            onSaveAnnotation={handleSaveAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
              aiConfigured={isAIProviderConfigured(aiConfig)}
              onAISetupRequired={() => setIsAISetupPromptOpen(true)}
          />
        );
      }
    }

    if (activeSubScreen === 'course_tutor' && selectedCourse) {
      return (
        <CourseTutorScreen
          course={selectedCourse}
          resources={resources}
          tasks={tasks}
          quizzes={quizzes}
          flashcards={flashcards}
          config={aiConfig}
          initialPrompt={courseTutorPrefill}
          initialQuizResourceId={courseTutorQuizResourceId}
          initialCardsResourceId={courseTutorCardsResourceId}
          initialTab={courseTutorTab}
          onBack={() => setActiveSubScreen('course')}
          onSaveQuiz={handleSaveQuiz}
          onSaveFlashcards={handleSaveFlashcards}
          aiConfigured={isAIProviderConfigured(aiConfig)}
          onAISetupRequired={() => setIsAISetupPromptOpen(true)}
        />
      );
    }

    if (activeSubScreen === 'what_to_do_now') {
      return (
        <WhatToDoNowScreen
          tasks={tasks}
          schedule={schedule}
          user={user}
          onBack={() => setActiveSubScreen(null)}
          onStartFocus={(task) => {
            setSelectedTask(task);
            setActiveSubScreen('study_session');
          }}
          onAskAIAboutTask={(task) => {
            requireAIProvider(() => {
              setSelectedTask(task);
              setCurrentTab('ai');
              setActiveSubScreen(null);
            });
          }}
        />
      );
    }

    if (activeSubScreen === 'task_detail' && currentSelectedTask) {
      return (
        <TaskDetailScreen
          task={currentSelectedTask}
          onBack={() => setActiveSubScreen(null)}
          onStartFocus={(task) => {
            setSelectedTask(task);
            setActiveSubScreen('study_session');
          }}
          onAskAI={(task) => {
            requireAIProvider(() => {
              setSelectedTask(task);
              setCurrentTab('ai');
              setActiveSubScreen(null);
            });
          }}
          onToggleTask={handleToggleTask}
          onAddToSchedule={(task, date, startTime, endTime) => {
            const newEv: ScheduleEvent = {
              id: `sched-${Date.now()}`,
              title: `${task.courseCode ? `${task.courseCode} · ` : ''}${task.title}`,
              startTime,
              endTime,
              date,
              type: 'study',
              courseCode: task.courseCode,
              color: task.courseColor,
              isCompleted: false,
            };
            setSchedule((prev) => [...prev, newEv]);
            setTasks((prev) =>
              prev.map((item) =>
                item.id === task.id
                  ? { ...item, scheduledDate: date, scheduledStartTime: startTime }
                  : item
              )
            );
            playChime('success');
            showToast(`Added "${newEv.title}" to your calendar on ${date} at ${startTime}.`);
          }}
          onToggleSubtask={handleToggleSubtask}
          onAddSubtask={handleAddSubtask}
          onRegenerateAIPlan={async (task) => {
            if (!isAIProviderConfigured(aiConfig)) {
              setIsAISetupPromptOpen(true);
              return;
            }
            await handleRegenerateAIPlan(task);
          }}
          onDeleteTask={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))}
        />
      );
    }

    if (activeSubScreen === 'study_session' && selectedTask) {
      return (
        <StudySessionScreen
          task={selectedTask}
          onClose={() => setActiveSubScreen(null)}
          onAskAIHelp={(task) => {
            requireAIProvider(() => {
              setSelectedTask(task);
              setCurrentTab('ai');
              setActiveSubScreen(null);
            });
          }}
          onCompleteSession={(task, minutes) => {
            setMetrics((prev) => ({
              ...prev,
              tasksCompleted: prev.tasksCompleted + 1,
            }));
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, completed: true, progress: 100 } : t))
            );
          }}
          onToggleSubtask={handleToggleSubtask}
        />
      );
    }

    if (activeSubScreen === 'research') {
      return (
        <ResearchScreen
          researchItems={research}
          onSaveToNotes={(title, content) => {
            const newNote: StudyNote = {
              id: `note-${Date.now()}`,
              title,
              content,
              tags: ['Research', 'StudyAI'],
              createdAt: 'Just now',
            };
            setNotes((prev) => [newNote, ...prev]);
            playChime('success');
          }}
          onAskFollowUp={(query) => {
            setCurrentTab('ai');
            setActiveSubScreen(null);
          }}
          config={aiConfig}
          aiConfigured={isAIProviderConfigured(aiConfig)}
          onAISetupRequired={() => setIsAISetupPromptOpen(true)}
        />
      );
    }

    if (activeSubScreen === 'files') {
      return (
        <FilesScreen
          files={files}
          notes={notes}
          onUploadFile={handleUploadFile}
          onAddNote={(title, content) => {
            const n: StudyNote = {
              id: `note-${Date.now()}`,
              title,
              content,
              tags: ['Class Notes'],
              createdAt: 'Just now',
            };
            setNotes((prev) => [n, ...prev]);
            playChime('success');
          }}
          onAskAIAboutFile={(f) => {
            requireAIProvider(() => {
              setSelectedFileForChat(f);
              setCurrentTab('ai');
              setActiveSubScreen(null);
            });
          }}
          onCreateTasksFromFile={(f) => {
            if (f.extractedDeadlines && f.extractedDeadlines.length > 0) {
              const newTs: Task[] = f.extractedDeadlines.map((dl, idx) => ({
                id: `task-${Date.now()}-${idx}`,
                title: dl.title,
                courseCode: f.courseCode || 'CS101',
                courseColor: '#EF4444',
                type: 'assignment',
                deadline: '2026-10-06T23:59:00Z',
                estimatedMinutes: 45,
                priority: 'high',
                progress: 0,
                completed: false,
                subtasks: [],
                relatedFileIds: [f.id],
                relatedResearchIds: [],
                createdAt: new Date().toISOString(),
              }));
              setTasks((prev) => [...newTs, ...prev]);
              playChime('success');
              showToast(`Extracted and created ${newTs.length} tasks from ${f.name}!`);
            }
          }}
          onReindexFile={handleReindexFile}
          onAddTask={(taskData) => handleCreateTask(taskData, false)}
        />
      );
    }

    if (activeSubScreen === 'progress') {
      return (
        <ProgressScreen
          metrics={metrics}
          onAskAIHowDoing={() => {
            requireAIProvider(() => {
              setCurrentTab('ai');
              setActiveSubScreen(null);
            });
          }}
          onOpenGoals={() => setActiveSubScreen('goals')}
        />
      );
    }

    if (activeSubScreen === 'goals') {
      return (
        <GoalsScreen
          goals={goals}
          onAddGoal={(g) => {
            const newG: Goal = { ...g, id: `goal-${Date.now()}` };
            setGoals((prev) => [...prev, newG]);
            playChime('success');
          }}
        />
      );
    }

    if (activeSubScreen === 'settings') {
      return (
        <SettingsScreen
          user={user}
          config={aiConfig}
          onOpenAIProvider={() => setActiveSubScreen('ai_provider')}
          onOpenNotifications={() => setActiveSubScreen('notifications')}
          onOpenProfile={() => setActiveSubScreen('profile')}
          onOpenAIMemory={() => setIsAIMemoryOpen(true)}
          onToggleTheme={() => setIsDark(!isDark)}
          isDark={isDark}
          onResetData={handleResetData}
        />
      );
    }

    if (activeSubScreen === 'ai_provider') {
      return (
        <AIProviderScreen
          config={aiConfig}
          onSaveConfig={(newC) => setAIConfig(newC)}
          onBack={() => setActiveSubScreen('settings')}
        />
      );
    }

    if (activeSubScreen === 'profile') {
      return (
        <ProfileScreen
          user={user}
          metrics={metrics}
          onBack={() => setActiveSubScreen('settings')}
          onOpenGoals={() => setActiveSubScreen('goals')}
          onOpenStats={() => setActiveSubScreen('progress')}
          onRestartOnboarding={() => setShowOnboarding(true)}
          onSignInWithGoogle={handleGoogleSignIn}
          onSignOut={handleSignOut}
          isFirebaseSynced={Boolean(firebaseUser)}
        />
      );
    }

    if (activeSubScreen === 'notifications') {
      return (
        <NotificationsScreen
          notifications={notifications}
          onBack={() => setActiveSubScreen(null)}
          onSimulateLockscreen={() => setIsLockscreenOpen(true)}
        />
      );
    }

    // Main Bottom Tab Destinations
    switch (currentTab) {
      case 'home':
        return (
          <HomeScreen
            user={user}
            tasks={tasks}
            schedule={schedule}
            notifications={notifications}
            onOpenWhatToDoNow={() => setActiveSubScreen('what_to_do_now')}
            onOpenAIChat={(q) => requireAIProvider(() => setCurrentTab('ai'))}
            onOpenTasks={(courseCode) => {
              setTaskCourseFilter(courseCode);
              setCurrentTab('tasks');
            }}
            onOpenCalendar={() => setCurrentTab('calendar')}
            onOpenNotifications={() => setActiveSubScreen('notifications')}
            onOpenSideMenu={() => setIsSideDrawerOpen(true)}
            onOpenCourse={(courseCode) => openCourseByCode(courseCode)}
            onUpdateEnergy={(lvl) => setUser((prev) => ({ ...prev, energyLevel: lvl }))}
            onSelectTask={(task) => {
              setSelectedTask(task);
              setActiveSubScreen('task_detail');
            }}
            onStartFocusTimer={(task) => {
              setSelectedTask(task);
              setActiveSubScreen('study_session');
            }}
            onSignInWithGoogle={handleGoogleSignIn}
            isFirebaseSynced={Boolean(firebaseUser)}
          />
        );

      case 'courses':
        return (
          <CoursesScreen
            courses={courses}
            tasks={tasks}
            resources={resources}
            onOpenCourse={openCourseById}
            onCreateCourse={handleCreateCourse}
          />
        );

      case 'tasks':
        return (
          <TasksScreen
            tasks={tasks}
            schedule={schedule}
            courseCodeFilter={taskCourseFilter}
            onClearCourseFilter={() => setTaskCourseFilter(undefined)}
            onSelectTask={(task) => {
              setSelectedTask(task);
              setActiveSubScreen('task_detail');
            }}
            onToggleTask={handleToggleTask}
            onAddTask={handleCreateTask}
            onComposerStateChange={setIsTaskComposerOpen}
          />
        );

      case 'ai':
        return (
          <AIChatScreen
            contextTask={selectedTask}
            contextFile={selectedFileForChat}
            courses={courses}
            resources={resources}
            files={files}
            onNavigateToCourse={(courseId, initialTab) => {
              setSelectedCourseId(courseId);
              if (initialTab === 'quiz' || initialTab === 'cards' || initialTab === 'tutor' || initialTab === 'learn') {
                setCourseTutorTab(initialTab);
                setActiveSubScreen('course_tutor');
              } else {
                setActiveSubScreen('course');
              }
              setCurrentTab('courses');
            }}
            onClearContext={() => {
              setSelectedTask(null);
              setSelectedFileForChat(null);
            }}
            onOpenVoiceModal={() => requireAIProvider(() => setIsVoiceModalOpen(true))}
            onExecuteAction={handleExecuteAction}
            config={aiConfig}
            allTasks={tasks}
            schedule={schedule}
            user={user}
            aiConfigured={isAIProviderConfigured(aiConfig)}
            onAISetupRequired={() => setIsAISetupPromptOpen(true)}
          />
        );

      case 'calendar':
        return (
          <CalendarScreen
            schedule={schedule}
            onOpenWeekPlanner={() => requireAIProvider(() => setIsWeekPlannerOpen(true))}
            onAddEvent={(ev) => {
              const newEvent: ScheduleEvent = { ...ev, id: `sched-${Date.now()}` };
              setSchedule((prev) => [...prev, newEvent]);
              playChime('success');
            }}
            onDeleteEvent={(id) => setSchedule((prev) => prev.filter((s) => s.id !== id))}
          />
        );

      case 'more':
        return (
          <MoreScreen
            onNavigate={(dest) => {
              if (dest === 'courses' || dest === 'ai' || dest === 'calendar') {
                if (dest === 'ai') {
                  requireAIProvider(() => setCurrentTab('ai'));
                } else {
                  setCurrentTab(dest as NavTab);
                }
              } else if (dest === 'research') {
                requireAIProvider(() => setActiveSubScreen('research'));
              } else {
                setActiveSubScreen(dest);
              }
            }}
            unreadCount={notifications.filter((n) => !n.read).length}
          />
        );
    }
  };

  return (
    <div className="w-full h-full h-[100dvh] max-h-[100dvh] flex flex-col bg-slate-100 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors overflow-hidden">
      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col justify-between h-full min-h-0 relative bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {/* Onboarding Overlay Flow if active */}
        {showOnboarding ? (
          <OnboardingFlow
            initialUser={user}
            onComplete={(updatedUser) => {
              setUser(updatedUser);
              setShowOnboarding(false);
              playChime('success');
            }}
          />
        ) : (
          <div className="w-full flex-1 flex flex-col justify-between overflow-hidden">
            {/* In-app Toast Notification Banner */}
            {toastMessage && (
              <div className="fixed top-4 left-4 right-4 z-50 transition-all duration-300 pointer-events-auto">
                <div className="bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 text-xs font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-white/10 dark:border-black/10 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <span className="text-base">✨</span>
                    <span className="leading-tight">{toastMessage}</span>
                  </div>
                  <button
                    onClick={() => setToastMessage(null)}
                    className="opacity-70 hover:opacity-100 text-xs px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable Viewport Content */}
            <div
              className={`flex-1 min-h-0 ${
                activeSubScreen === 'resource_reader'
                  ? 'overflow-hidden flex flex-col p-0 h-full'
                  : 'overflow-y-auto px-4 sm:px-6 lg:px-8 pt-4 pb-24'
              } no-scrollbar`}
            >
              {renderCurrentView()}
            </div>

            {/* Fixed Mobile Bottom Nav Bar */}
            {!isTaskComposerOpen && (
              <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800/80">
                <MobileBottomNav
                  currentTab={currentTab}
                  onTabChange={handleTabChange}
                  unreadCount={notifications.filter((n) => !n.read).length}
                />
              </div>
            )}

            {isAISetupPromptOpen && (
              <AISetupPrompt
                onClose={() => setIsAISetupPromptOpen(false)}
                onOpenSettings={() => {
                  setIsAISetupPromptOpen(false);
                  setActiveSubScreen('ai_provider');
                }}
              />
            )}
          </div>
        )}

        {/* Global Modals & Sheets */}
        <QuickActionsSheet
          isOpen={isQuickActionsOpen}
          onClose={() => setIsQuickActionsOpen(false)}
          onAction={(act) => {
            if (act === 'add_task') {
              setCurrentTab('tasks');
            } else if (act === 'ask_ai') {
              requireAIProvider(() => setCurrentTab('ai'));
            } else if (act === 'add_file') {
              setActiveSubScreen('files');
            } else if (act === 'view_calendar') {
              setCurrentTab('calendar');
            }
          }}
        />

        <VoiceAIModal
          isOpen={isVoiceModalOpen}
          onClose={() => setIsVoiceModalOpen(false)}
          onSubmitVoice={(transcript) => {
            requireAIProvider(() => setCurrentTab('ai'));
          }}
        />

        <AIWeekPlannerModal
          isOpen={isWeekPlannerOpen}
          onClose={() => setIsWeekPlannerOpen(false)}
          tasks={tasks}
          schedule={schedule}
          onAddPlanToSchedule={(sessions) => {
            const newEvents: ScheduleEvent[] = sessions.map((s, idx) => ({
              id: `sched-plan-${Date.now()}-${idx}`,
              title: s.title,
              startTime: '14:00',
              endTime: '15:30',
              date: getLocalDateKey(),
              type: 'study',
              color: s.color,
              isCompleted: false,
            }));
            setSchedule((prev) => [...prev, ...newEvents]);
            playChime('success');
          }}
        />

        <AIMemoryModal
          isOpen={isAIMemoryOpen}
          onClose={() => setIsAIMemoryOpen(false)}
          memory={aiMemory}
          onAddMemory={(statement, category) => {
            const item: AIMemoryItem = {
              id: `mem-${Date.now()}`,
              statement,
              category,
              dateAdded: 'Today',
            };
            setAIMemory((prev) => [item, ...prev]);
            playChime('success');
          }}
          onDeleteMemory={(id) => setAIMemory((prev) => prev.filter((m) => m.id !== id))}
        />

        <SideDrawer
          isOpen={isSideDrawerOpen}
          onClose={() => setIsSideDrawerOpen(false)}
          user={user}
          onSignOut={handleSignOut}
          onNavigate={(dest) => {
            if (dest === 'home' || dest === 'tasks' || dest === 'courses' || dest === 'ai' || dest === 'calendar') {
              setCurrentTab(dest as NavTab);
              setActiveSubScreen(null);
            } else {
              setActiveSubScreen(dest);
            }
          }}
        />

        <LockscreenNotificationModal
          isOpen={isLockscreenOpen}
          onClose={() => setIsLockscreenOpen(false)}
          onOpenAppToTask={() => {
            setActiveSubScreen('what_to_do_now');
          }}
        />
      </div>
    </div>
  );
}
