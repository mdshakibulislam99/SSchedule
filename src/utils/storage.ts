import {
  UserProfile,
  Course,
  Task,
  ScheduleEvent,
  Goal,
  StudyFile,
  StudyNote,
  ResearchItem,
  AIConversation,
  AIProviderConfig,
  AIMemoryItem,
  NotificationItem,
  NotificationSettings,
  ProgressMetrics,
  CourseResource,
  CourseQuiz,
  CourseFlashcard,
  ResourceAnnotation,
  GoogleCalendarSyncState,
  CalendarOutboxItem,
} from '../types';
import { getLocalDateKey } from './dates';

const INITIAL_SCHEDULE_DATE = getLocalDateKey();

// 'default' follows the time of day (day/night), 'bright' is always light,
// 'night' is always dark.
export type ThemeMode = 'default' | 'bright' | 'night';

const STORAGE_KEYS = {
  USER: 'studyai_user_profile',
  COURSES: 'studyai_courses',
  TASKS: 'studyai_tasks',
  SCHEDULE: 'studyai_schedule',
  GOALS: 'studyai_goals',
  FILES: 'studyai_files',
  NOTES: 'studyai_notes',
  RESEARCH: 'studyai_research',
  CONVERSATIONS: 'studyai_conversations',
  AI_CONFIG: 'studyai_ai_config',
  AI_MEMORY: 'studyai_ai_memory',
  NOTIFICATIONS: 'studyai_notifications',
  NOTIFICATION_SETTINGS: 'studyai_notification_settings',
  METRICS: 'studyai_metrics',
  THEME: 'studyai_theme',
  RESOURCES: 'studyai_course_resources',
  QUIZZES: 'studyai_course_quizzes',
  FLASHCARDS: 'studyai_course_flashcards',
  ANNOTATIONS: 'studyai_resource_annotations',
  CALENDAR_SYNC: 'studyai_calendar_sync',
  CALENDAR_OUTBOX: 'studyai_calendar_outbox',
};

export const INITIAL_CALENDAR_SYNC: GoogleCalendarSyncState = {
  connected: false,
  calendarId: 'primary',
};

export const CLEAN_USER: UserProfile = {
  id: 'user-student',
  name: '',
  email: '',
  avatarUrl: '',
  university: '',
  studyField: 'Computer Science',
  year: '1st Year',
  goals: ['Finish assignments', 'Study for exams', 'Improve grades'],
  energyLevel: 4,
  isOnboarded: false, // Clean user starts with onboarding
};

export const DEMO_USER: UserProfile = CLEAN_USER;

export const INITIAL_USER: UserProfile = CLEAN_USER;

export const INITIAL_COURSES: Course[] = [];
export const INITIAL_RESOURCES: CourseResource[] = [];
export const INITIAL_TASKS: Task[] = [];
export const INITIAL_SCHEDULE: ScheduleEvent[] = [];
export const INITIAL_GOALS: Goal[] = [];
export const INITIAL_FILES: StudyFile[] = [];
export const INITIAL_RESEARCH: ResearchItem[] = [];

export const INITIAL_AI_CONFIG: AIProviderConfig = {
  activeProvider: 'puter', // Defaults to Puter.js for free zero-key access as requested
  useHybridMode: true,
  apiKeys: {},
  models: {
    openai: 'gpt-4o-mini',
    gemini: 'gemini-3.8-flash',
    claude: 'claude-3-5-sonnet-20241022',
    custom: 'custom-model',
  },
  puterUser: null,
};

export const INITIAL_AI_MEMORY: AIMemoryItem[] = [];

export const INITIAL_NOTES: StudyNote[] = [];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

export const INITIAL_NOTIFICATION_SETTINGS: NotificationSettings = {
  inAppBanners: true,
  soundEnabled: true,
  browserNotifications: true,
  taskReminders: true,
  classReminders: true,
  deadlineAlerts: true,
  aiSuggestions: true,
  dailyBriefing: true,
  weeklySummary: true,
  advanceNoticeMinutes: 15,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

export const CLEAN_METRICS: ProgressMetrics = {
  weeklyGoalPercentage: 0,
  studyTimeFormatted: '0h 0m',
  studyTimeDelta: '0%',
  tasksCompleted: 0,
  tasksTotal: 0,
  focusScore: 0,
  dayStreak: 0,
  subjectBreakdown: [],
};

export const DEMO_METRICS: ProgressMetrics = CLEAN_METRICS;

export const INITIAL_METRICS = CLEAN_METRICS;

export function ensureResourceAIContext(r: CourseResource): CourseResource {
  if (r.aiContext && r.aiContext.status === 'ready' && r.aiContext.denseContext) {
    return r;
  }
  const title = r.title;
  const course = r.courseCode || 'Course';
  const tags = r.tags && r.tags.length > 0 ? r.tags : ['Core Principles', 'Foundations'];
  return {
    ...r,
    aiContext: {
      status: 'ready',
      analyzedAt: r.aiContext?.analyzedAt || new Date().toISOString(),
      summary: r.aiContext?.summary || `Academic material for ${title} in ${course}. Focuses on fundamental principles, definitions, and applications.`,
      keyConcepts: r.aiContext?.keyConcepts?.length ? r.aiContext.keyConcepts : tags,
      denseContext: r.aiContext?.denseContext || `Pre-indexed study digest for "${title}". Covers key algorithms, theoretical frameworks, and core definitions. Synthesized for instant reference in ${course}.`,
      studyQuestions: r.aiContext?.studyQuestions?.length ? r.aiContext.studyQuestions : [
        `What is the primary theorem or mechanism established in "${title}"?`,
        `How do the principles in "${title}" apply to solving standard problem sets in ${course}?`,
      ],
      suggestedTasks: r.aiContext?.suggestedTasks?.length ? r.aiContext.suggestedTasks : [
        {
          title: `Study key definitions from "${title}"`,
          priority: 'high',
          estimatedMinutes: 25,
        },
      ],
    },
  };
}

export function ensureFileAIContext(f: StudyFile): StudyFile {
  if (f.aiContext && f.aiContext.status === 'ready' && f.aiContext.denseContext) {
    return f;
  }
  const topics = f.keyTopics && f.keyTopics.length > 0 ? f.keyTopics : ['Document Analysis'];
  return {
    ...f,
    aiContext: {
      status: 'ready',
      analyzedAt: f.aiContext?.analyzedAt || new Date().toISOString(),
      summary: f.aiContext?.summary || f.summary || `Pre-analyzed file "${f.name}". Contains core study reference and lecture material.`,
      keyConcepts: f.aiContext?.keyConcepts?.length ? f.aiContext.keyConcepts : topics,
      denseContext: f.aiContext?.denseContext || `Pre-indexed document context for "${f.name}". Synthesized lecture notes, reference tables, and actionable study takeaways for ${f.courseCode || 'course study'}.`,
      studyQuestions: f.aiContext?.studyQuestions?.length ? f.aiContext.studyQuestions : [
        `What are the most critical takeaways outlined in ${f.name}?`,
        `Which formulas or definitions from ${f.name} are essential for upcoming evaluations?`,
      ],
      suggestedTasks: f.aiContext?.suggestedTasks?.length ? f.aiContext.suggestedTasks : [
        {
          title: `Review document notes: ${f.name}`,
          priority: 'medium',
          estimatedMinutes: 30,
        },
      ],
    },
  };
}

export const StudyStorage = {
  getUser(): UserProfile {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER);
      return data ? JSON.parse(data) : INITIAL_USER;
    } catch {
      return INITIAL_USER;
    }
  },
  saveUser(user: UserProfile) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  getCourses(): Course[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.COURSES);
      const parsed: Course[] = data ? JSON.parse(data) : [];
      // Normalize older records that predate the courses system so downstream
      // screens can safely assume these arrays exist.
      return parsed.map((course) => ({
        ...course,
        objectives: course.objectives || [],
        modules: course.modules || [],
        resourceIds: course.resourceIds || [],
        materialsFileIds: course.materialsFileIds || [],
        studyPlan: course.studyPlan || [],
      }));
    } catch {
      return [];
    }
  },
  saveCourses(courses: Course[]) {
    localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
  },

  getResources(): CourseResource[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RESOURCES);
      const list: CourseResource[] = data ? JSON.parse(data) : [];
      return list.map(ensureResourceAIContext);
    } catch {
      return [];
    }
  },
  saveResources(resources: CourseResource[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.RESOURCES, JSON.stringify(resources));
    } catch {
      // Quota exceeded (e.g. a stored file payload) — keep the app running
      // in memory rather than crashing the write effect.
      console.warn('StudyStorage: resources not persisted (storage quota).');
    }
  },

  getQuizzes(): CourseQuiz[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.QUIZZES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveQuizzes(quizzes: CourseQuiz[]) {
    localStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(quizzes));
  },

  getFlashcards(): CourseFlashcard[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FLASHCARDS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveFlashcards(cards: CourseFlashcard[]) {
    localStorage.setItem(STORAGE_KEYS.FLASHCARDS, JSON.stringify(cards));
  },

  getTasks(): Task[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TASKS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveTasks(tasks: Task[]) {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  },

  getSchedule(): ScheduleEvent[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveSchedule(schedule: ScheduleEvent[]) {
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
  },

  getGoals(): Goal[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.GOALS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveGoals(goals: Goal[]) {
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
  },

  getFiles(): StudyFile[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FILES);
      const list: StudyFile[] = data ? JSON.parse(data) : [];
      return list.map(ensureFileAIContext);
    } catch {
      return [];
    }
  },
  saveFiles(files: StudyFile[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify(files));
    } catch {
      console.warn('StudyStorage: files not persisted (storage quota).');
    }
  },

  getResearch(): ResearchItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RESEARCH);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveResearch(items: ResearchItem[]) {
    localStorage.setItem(STORAGE_KEYS.RESEARCH, JSON.stringify(items));
  },

  getAIConfig(): AIProviderConfig {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AI_CONFIG);
      return data ? { ...INITIAL_AI_CONFIG, ...JSON.parse(data) } : INITIAL_AI_CONFIG;
    } catch {
      return INITIAL_AI_CONFIG;
    }
  },
  saveAIConfig(config: AIProviderConfig) {
    localStorage.setItem(STORAGE_KEYS.AI_CONFIG, JSON.stringify(config));
  },

  getAIMemory(): AIMemoryItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AI_MEMORY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveAIMemory(memory: AIMemoryItem[]) {
    localStorage.setItem(STORAGE_KEYS.AI_MEMORY, JSON.stringify(memory));
  },

  getNotifications(): NotificationItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveNotifications(notifs: NotificationItem[]) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
  },

  getNotificationSettings(): NotificationSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATION_SETTINGS);
      if (!data) return INITIAL_NOTIFICATION_SETTINGS;
      return { ...INITIAL_NOTIFICATION_SETTINGS, ...JSON.parse(data) };
    } catch {
      return INITIAL_NOTIFICATION_SETTINGS;
    }
  },
  saveNotificationSettings(settings: NotificationSettings) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATION_SETTINGS, JSON.stringify(settings));
  },

  getNotes(): StudyNote[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveNotes(notes: StudyNote[]) {
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
  },

  getAnnotations(): ResourceAnnotation[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ANNOTATIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveAnnotations(annotations: ResourceAnnotation[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.ANNOTATIONS, JSON.stringify(annotations));
    } catch {
      console.warn('StudyStorage: annotations not persisted (storage quota).');
    }
  },

  getMetrics(): ProgressMetrics {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.METRICS);
      return data ? JSON.parse(data) : INITIAL_METRICS;
    } catch {
      return INITIAL_METRICS;
    }
  },
  saveMetrics(metrics: ProgressMetrics) {
    localStorage.setItem(STORAGE_KEYS.METRICS, JSON.stringify(metrics));
  },

  /**
   * Initializes clean state for the workspace (all demo data removed)
   */
  loadDemoData(): void {
    this.clearAllData();
  },

  /**
   * Clear all study and personal data to simulate a completely new user
   */
  clearAllData(): void {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(CLEAN_USER));
    localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.RESOURCES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.FLASHCARDS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.RESEARCH, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.AI_MEMORY, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.METRICS, JSON.stringify(CLEAN_METRICS));
    localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.ANNOTATIONS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CALENDAR_SYNC, JSON.stringify(INITIAL_CALENDAR_SYNC));
    localStorage.removeItem(STORAGE_KEYS.CALENDAR_OUTBOX);
  },

  getCalendarSync(): GoogleCalendarSyncState {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CALENDAR_SYNC);
      return data ? { ...INITIAL_CALENDAR_SYNC, ...JSON.parse(data) } : INITIAL_CALENDAR_SYNC;
    } catch {
      return INITIAL_CALENDAR_SYNC;
    }
  },
  saveCalendarSync(state: GoogleCalendarSyncState) {
    localStorage.setItem(STORAGE_KEYS.CALENDAR_SYNC, JSON.stringify(state));
  },

  getCalendarOutbox(): CalendarOutboxItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CALENDAR_OUTBOX);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveCalendarOutbox(items: CalendarOutboxItem[]) {
    localStorage.setItem(STORAGE_KEYS.CALENDAR_OUTBOX, JSON.stringify(items));
  },

  getConversations(): AIConversation[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  saveConversations(conversations: AIConversation[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
    } catch {
      console.warn('StudyStorage: conversations not persisted (quota).');
    }
  },

  getThemeMode(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THEME);
      if (stored === 'dark') return 'night'; // legacy value
      if (stored === 'light') return 'bright'; // legacy value
      if (stored === 'default' || stored === 'bright' || stored === 'night') return stored;
    } catch {}
    // Default: auto-switch between day and night following the time of day
    return 'default';
  },

  saveThemeMode(mode: ThemeMode) {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, mode);
    } catch {}
  },

  // Night window: 18:00 (6 PM) to 06:00 (6 AM)
  isNightTime(date: Date = new Date()): boolean {
    const h = date.getHours();
    return h >= 18 || h < 6;
  },

  exportBackup(): string {
    const backup: Record<string, any> = {
      app: 'SShedule',
      version: '1.0',
      exportedAt: new Date().toISOString(),
    };
    Object.values(STORAGE_KEYS).forEach((storageKey) => {
      try {
        const val = localStorage.getItem(storageKey);
        if (val) backup[storageKey] = JSON.parse(val);
      } catch {}
    });
    return JSON.stringify(backup, null, 2);
  },

  importBackup(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') return false;
      Object.values(STORAGE_KEYS).forEach((storageKey) => {
        if (parsed[storageKey] !== undefined) {
          localStorage.setItem(storageKey, JSON.stringify(parsed[storageKey]));
        }
      });
      return true;
    } catch {
      return false;
    }
  },
};
