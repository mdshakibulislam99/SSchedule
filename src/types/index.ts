export type PriorityLevel = 'high' | 'medium' | 'low';
export type TaskType = 'assignment' | 'exam' | 'project' | 'reading' | 'habit' | 'personal' | 'admin' | 'health' | 'other';
export type TaskCategory = 'academic' | 'personal' | 'health' | 'admin' | 'work' | 'other';
export type TaskRecurrence = 'none' | 'daily' | 'weekdays' | 'weekly';

export interface TaskReminder {
  enabled: boolean;
  minutesBefore: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  university: string;
  studyField: string;
  year: string;
  goals: string[];
  energyLevel: 1 | 2 | 3 | 4 | 5; // 1: Very Low, 2: Low, 3: Okay, 4: Good, 5: Excellent
  isOnboarded: boolean;
  streak?: number;
  firebaseUid?: string;
  isFirebaseSynced?: boolean;
  photoURL?: string;
}

export interface CourseModule {
  id: string;
  title: string;
  description?: string;
  order: number;
  completed: boolean;
}

export interface Course {
  id: string;
  code: string; // e.g. "CS101", "MATH"
  name: string;
  color: string;
  professor?: string;
  term?: string;
  credits?: number;
  schedulePattern?: string;
  description?: string;
  objectives: string[];      // learning outcomes
  modules: CourseModule[];   // units / weeks that structure the course
  materialsFileIds: string[];
  resourceIds: string[];     // linked CourseResource ids
  studyPlan: string[];
  coverEmoji?: string;
  isArchived?: boolean;
  createdAt?: string;
}

export interface AIGeneratedCourseResult {
  code: string;
  name: string;
  color: string;
  coverEmoji: string;
  professor?: string;
  description?: string;
  objectives: string[];
  modules: CourseModule[];
  initialTasks?: Array<{ title: string; priority: 'low' | 'medium' | 'high'; estimatedMinutes: number }>;
  aiSummary: string;
}

export type CourseResourceType = 'pdf' | 'docx' | 'text' | 'link' | 'slide' | 'video';

export interface CourseResourceReading {
  percent: number;      // 0 - 100 overall scroll progress
  lastPosition: number; // 0 - 100 relative scroll position to resume from
  lastPage?: number;
  lastReadAt?: string;  // ISO timestamp of the last reading session
  completed: boolean;
}

export type ResourceAnnotationKind = 'ink' | 'highlight' | 'text';

export interface ResourceAnnotation {
  id: string;
  resourceId: string;
  pageNumber: number;
  kind: ResourceAnnotationKind;
  points?: { x: number; y: number }[];
  text?: string;
  color: string;
  width: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceAIContext {
  status: 'pending' | 'analyzing' | 'ready' | 'error';
  analyzedAt?: string;
  summary: string;
  keyConcepts: string[];
  denseContext: string; // Pre-indexed structured knowledge digest
  studyQuestions?: string[];
  suggestedTasks?: Array<{
    title: string;
    priority: 'high' | 'medium' | 'low';
    estimatedMinutes: number;
  }>;
}

export interface CourseResource {
  id: string;
  courseId: string;
  courseCode: string;   // convenience for filtering, matches Course.code
  moduleId?: string;
  title: string;
  type: CourseResourceType;
  sourceUrl?: string;
  content: string;      // readable body text (markdown-ish) for the reader view
  /** Original filename when this resource came from an uploaded file. */
  fileName?: string;
  /** MIME type of the original file, used to pick the right viewer. */
  mime?: string;
  /**
   * Base64 data URL of the original file (images / small PDFs) so the reader
   * can open it in a distraction-free viewer. Only set for files under the
   * storage threshold; large files fall back to metadata only.
   */
  fileData?: string;
  /** IndexedDB key for the original file when it is too large for localStorage. */
  fileStorageKey?: string;
  estimatedReadMinutes: number;
  tags: string[];
  createdAt: string;
  reading: CourseResourceReading;
  aiContext?: ResourceAIContext;
}

export interface CourseProgress {
  percent: number;
  tasksCompleted: number;
  tasksTotal: number;
  resourcesRead: number;
  resourcesTotal: number;
  modulesCompleted: number;
  modulesTotal: number;
  lastActivityAt?: string;
}

export interface CourseQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface CourseQuizAttempt {
  id: string;
  score: number; // 0 - 100
  correctCount: number;
  totalQuestions: number;
  takenAt: string;
}

export interface CourseQuiz {
  id: string;
  courseId: string;
  resourceId?: string;
  title: string;
  questions: CourseQuizQuestion[];
  attempts: CourseQuizAttempt[];
  createdAt: string;
}

export interface CourseFlashcard {
  id: string;
  courseId: string;
  resourceId?: string;
  front: string;
  back: string;
  mastered: boolean;
  createdAt: string;
}

export interface CourseKeyTerm {
  term: string;
  definition: string;
}

export interface CourseInsight {
  id: string;
  courseId: string;
  text: string;
  createdAt: string;
}

export interface CourseTutorMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes?: number;
  order?: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  courseCode?: string;
  courseColor: string;
  category?: TaskCategory;
  type: TaskType;
  deadline: string; // ISO string
  scheduledDate?: string; // YYYY-MM-DD; date the student plans to work on it
  scheduledStartTime?: string; // HH:mm; optional focus/reminder time
  recurrence?: TaskRecurrence;
  reminder?: TaskReminder;
  estimatedMinutes: number;
  priority: PriorityLevel;
  progress: number; // 0 - 100
  completed: boolean;
  completedAt?: string;
  subtasks: SubTask[];
  relatedFileIds: string[];
  relatedResearchIds: string[];
  aiPlanReason?: string;
  scheduledTime?: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  title: string;
  category: string;
  targetDate: string;
  progress: number; // 0 - 100
  completed: boolean;
  aiPlanSteps: string[];
}

export type ScheduleEventType = 'class' | 'study' | 'break' | 'gym' | 'exam' | 'project';

export type ScheduleEventSource = 'local' | 'google';

export interface ScheduleEvent {
  id: string;
  title: string;
  type: ScheduleEventType;
  startTime: string; // "08:00"
  endTime: string;   // "09:30"
  date: string;      // "YYYY-MM-DD"
  courseCode?: string;
  location?: string;
  color: string;
  isCompleted?: boolean;
  isMissed?: boolean;
  /** Google Calendar event id when this block is linked to a Google event. */
  googleEventId?: string;
  /** Which Google calendar the linked event lives in (normally 'primary'). */
  googleCalendarId?: string;
  /** Google 'etag' at the last sync, used for conflict detection. */
  googleEtag?: string;
  /** Google 'updated' timestamp at the last sync. */
  googleUpdatedAt?: string;
  /** Where this block originated. */
  source?: ScheduleEventSource;
  /** ISO timestamp of the last local edit (last-write-wins reconciliation). */
  updatedAt?: string;
}

/** Persisted state for the two-way Google Calendar connection. */
export interface GoogleCalendarSyncState {
  connected: boolean;
  email?: string;
  calendarId: string; // Google calendar id, normally 'primary'
  syncToken?: string; // incremental sync token
  lastSyncedAt?: string;
  lastSyncError?: string;
}

/** A pending Google Calendar write that has not yet been confirmed. */
export interface CalendarOutboxItem {
  id: string;
  op: 'create' | 'update' | 'delete';
  event: ScheduleEvent;
  attempts: number;
}

export interface StudyFile {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'docx' | 'ppt' | 'image' | 'text';
  uploadedAt: string;
  summary?: string;
  extractedDeadlines?: { title: string; date: string }[];
  keyTopics?: string[];
  courseCode?: string;
  /** Base64 data URL of the file bytes (set when small enough to store). */
  dataUrl?: string;
  /** IndexedDB key for larger files that cannot fit in localStorage. */
  fileStorageKey?: string;
  aiContext?: ResourceAIContext;
}

export interface StudyNote {
  id: string;
  title: string;
  content: string;
  courseCode?: string;
  tags: string[];
  createdAt: string;
}

export interface ResearchItem {
  id: string;
  topic: string;
  summary: string;
  keyFindings: string[];
  sources: { title: string; url: string; domain: string }[];
  notes: string[];
  createdAt: string;
}

export interface AIMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  suggestedChips?: string[];
  actions?: AIActionProposal[];
  contextLabel?: string;
  isError?: boolean;
}

export interface AIActionProposal {
  id: string;
  type:
    | 'add_schedule'
    | 'edit_schedule'
    | 'create_task'
    | 'edit_task'
    | 'delete_task'
    | 'delete_schedule'
    | 'create_study_plan'
    | 'reschedule_event'
    | 'create_goal'
    | 'save_note';
  title: string;
  description: string;
  details: Record<string, any>;
  status: 'pending' | 'confirmed' | 'dismissed';
}

export interface AIConversation {
  id: string;
  title: string;
  messages: AIMessage[];
  contextTaskId?: string;
  contextFileId?: string;
  courseId?: string;
  updatedAt: string;
}

export type AIProviderType = 'openai' | 'gemini' | 'claude' | 'puter' | 'custom';

export interface AIProviderConfig {
  activeProvider: AIProviderType;
  useHybridMode: boolean;
  apiKeys: {
    openai?: string;
    gemini?: string;
    claude?: string;
    custom?: string;
  };
  customEndpoint?: string;
  models: {
    openai: string;
    gemini: string;
    claude: string;
    custom: string;
  };
  puterUser: {
    username: string;
    email?: string;
  } | null;
}

export interface AIMemoryItem {
  id: string;
  statement: string;
  category: 'preference' | 'schedule' | 'strength' | 'weakness';
  dateAdded: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'reminder' | 'deadline' | 'insight' | 'reschedule';
  actionLabel?: string;
}

export interface NotificationSettings {
  // Channels & Sound
  inAppBanners: boolean;
  soundEnabled: boolean;
  browserNotifications: boolean;

  // Categories
  taskReminders: boolean;
  classReminders: boolean;
  deadlineAlerts: boolean;
  aiSuggestions: boolean;
  dailyBriefing: boolean;
  weeklySummary: boolean;

  // Timing & Quiet Hours
  advanceNoticeMinutes: number; // e.g. 5, 10, 15, 30
  quietHoursEnabled: boolean;
  quietHoursStart: string; // e.g. "22:00"
  quietHoursEnd: string; // e.g. "07:00"
}

export interface ProgressMetrics {
  weeklyGoalPercentage: number;
  studyTimeFormatted: string; // e.g. "28h 45m"
  studyTimeDelta: string;     // e.g. "+12%"
  tasksCompleted: number;
  tasksTotal: number;
  focusScore: number;         // e.g. 8.4
  productivityScore?: number;
  dayStreak: number;          // e.g. 7
  subjectBreakdown: {
    course: string;
    percentage: number;
    color: string;
  }[];
}
