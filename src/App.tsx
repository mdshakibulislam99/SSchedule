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
  fetchUserDataFromFirestore,
} from './lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';

import { OnboardingFlow } from './components/screens/OnboardingFlow';
import { HomeScreen } from './components/screens/HomeScreen';
import { WhatToDoNowScreen } from './components/screens/WhatToDoNowScreen';
import { TasksScreen } from './components/screens/TasksScreen';
import { TaskDetailScreen } from './components/screens/TaskDetailScreen';
import { CourseWorkspaceScreen } from './components/screens/CourseWorkspaceScreen';
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
} from './types';
import { StudyStorage } from './utils/storage';
import { playChime } from './utils/audio';
import { AIOrchestrator } from './services/aiOrchestrator';
import { getLocalDateKey } from './utils/dates';

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
  const [selectedCourseCode, setSelectedCourseCode] = useState<string | null>(null);
  const [selectedFileForChat, setSelectedFileForChat] = useState<StudyFile | null>(null);

  // Modals state
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isWeekPlannerOpen, setIsWeekPlannerOpen] = useState(false);
  const [isAIMemoryOpen, setIsAIMemoryOpen] = useState(false);
  const [isSideDrawerOpen, setIsSideDrawerOpen] = useState(false);
  const [isTaskComposerOpen, setIsTaskComposerOpen] = useState(false);
  const [isLockscreenOpen, setIsLockscreenOpen] = useState(false);
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
          }

          if (cloudData.tasks && cloudData.tasks.length > 0) {
            setTasks(cloudData.tasks);
          }
          if (cloudData.schedule && cloudData.schedule.length > 0) {
            setSchedule(cloudData.schedule);
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
    setActiveSubScreen(null);
    setSelectedCourseCode(null);
    if (tab !== 'tasks') setTaskCourseFilter(undefined);
    setCurrentTab(tab);
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

    if (activeSubScreen === 'course' && selectedCourseCode) {
      const course = courses.find((item) => item.code === selectedCourseCode);
      if (course) {
        return (
          <CourseWorkspaceScreen
            course={course}
            tasks={tasks}
            files={files}
            schedule={schedule}
            onBack={() => setActiveSubScreen(null)}
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
          />
        );
      }
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
            setSelectedTask(task);
            setCurrentTab('ai');
            setActiveSubScreen(null);
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
            setSelectedTask(task);
            setCurrentTab('ai');
            setActiveSubScreen(null);
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
          onRegenerateAIPlan={handleRegenerateAIPlan}
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
            setSelectedTask(task);
            setCurrentTab('ai');
            setActiveSubScreen(null);
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
        />
      );
    }

    if (activeSubScreen === 'files') {
      return (
        <FilesScreen
          files={files}
          notes={notes}
          onUploadFile={(newF) => {
            const f: StudyFile = {
              id: `file-${Date.now()}`,
              name: newF.name || 'Document.pdf',
              size: newF.size || '1.5 MB',
              type: newF.type || 'pdf',
              uploadedAt: 'Just now',
              summary: newF.summary || 'Summary generated by StudyAI.',
              extractedDeadlines: newF.extractedDeadlines || [],
              keyTopics: newF.keyTopics || ['Study Notes'],
            };
            setFiles((prev) => [f, ...prev]);
            playChime('success');
          }}
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
            setSelectedFileForChat(f);
            setCurrentTab('ai');
            setActiveSubScreen(null);
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
        />
      );
    }

    if (activeSubScreen === 'progress') {
      return (
        <ProgressScreen
          metrics={metrics}
          onAskAIHowDoing={() => {
            setCurrentTab('ai');
            setActiveSubScreen(null);
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
            onOpenAIChat={(q) => setCurrentTab('ai')}
            onOpenTasks={(courseCode) => {
              setTaskCourseFilter(courseCode);
              setCurrentTab('tasks');
            }}
            onOpenCalendar={() => setCurrentTab('calendar')}
            onOpenNotifications={() => setActiveSubScreen('notifications')}
            onOpenSideMenu={() => setIsSideDrawerOpen(true)}
            onOpenCourse={(courseCode) => {
              setSelectedCourseCode(courseCode);
              setActiveSubScreen('course');
            }}
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
            onAddTask={(taskData, autoPlan) => {
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
            }}
            onComposerStateChange={setIsTaskComposerOpen}
          />
        );

      case 'ai':
        return (
          <AIChatScreen
            contextTask={selectedTask}
            contextFile={selectedFileForChat}
            onClearContext={() => {
              setSelectedTask(null);
              setSelectedFileForChat(null);
            }}
            onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
            onExecuteAction={handleExecuteAction}
            config={aiConfig}
            allTasks={tasks}
            schedule={schedule}
            user={user}
          />
        );

      case 'calendar':
        return (
          <CalendarScreen
            schedule={schedule}
            onOpenWeekPlanner={() => setIsWeekPlannerOpen(true)}
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
              if (dest === 'ai' || dest === 'calendar') {
                setCurrentTab(dest as NavTab);
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
    <div className="w-full min-h-[100dvh] flex flex-col bg-slate-100 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors">
      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col justify-between min-h-[100dvh] relative bg-slate-50 dark:bg-slate-950">
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
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pt-4 pb-24 no-scrollbar">
              {renderCurrentView()}
            </div>

            {/* Fixed Mobile Bottom Nav Bar */}
            {!isTaskComposerOpen && (
              <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200/80 dark:border-slate-800/80">
                <MobileBottomNav
                  currentTab={currentTab}
                  onTabChange={handleTabChange}
                  unreadCount={notifications.filter((n) => !n.read).length}
                />
              </div>
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
              setCurrentTab('ai');
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
            setCurrentTab('ai');
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
            if (dest === 'home' || dest === 'tasks' || dest === 'ai' || dest === 'calendar') {
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
