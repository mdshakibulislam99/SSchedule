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

export type CourseResourceType = 'pdf' | 'docx' | 'text' | 'link' | 'slide' | 'video';

export interface CourseResourceReading {
  percent: number;      // 0 - 100 overall scroll progress
  lastPosition: number; // 0 - 100 relative scroll position to resume from
  lastReadAt?: string;  // ISO timestamp of the last reading session
  completed: boolean;
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
}

export interface AIActionProposal {
  id: string;
  type: 'add_schedule' | 'create_task' | 'create_study_plan' | 'reschedule_event' | 'create_goal' | 'save_note';
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
