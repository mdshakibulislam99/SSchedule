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

/**
 * One chapter / section / slide of an uploaded document.
 * The complete chapter text lives in IndexedDB under `textKey`
 * so any chapter can be reloaded for learning without re-uploading.
 */
export interface DocumentChapter {
  /** 1-based position in the document. */
  index: number;
  title: string;
  /** IndexedDB key holding this chapter's complete text. */
  textKey: string;
  /** Character count of the stored chapter text. */
  charCount: number;
  /** PDF page range (1-based) when known. */
  startPage?: number;
  endPage?: number;
  /** Slide number when the document is a presentation. */
  slide?: number;
  /** Character offsets into the full extracted text (App slices & persists from these). */
  startChar: number;
  endChar: number;
  /** AI digest of just this chapter. */
  digest?: string;
  keyConcepts?: string[];
}

/** Structural map of an uploaded document (chapters, sections, slides). */
export interface DocumentStructure {
  /** What one "chapter" represents in this document. */
  unit: 'chapter' | 'section' | 'slide' | 'page-range';
  fileName: string;
  totalChars: number;
  chapters: DocumentChapter[];
}

/** Character span of one physical page inside the full extracted text. */
export interface DocumentPageSpan {
  /** 1-based page number. */
  page: number;
  startChar: number;
  endChar: number;
}

/** A stored per-page entry of a document index. */
export interface DocumentIndexedPage extends DocumentPageSpan {
  /** IndexedDB key holding this page's complete text. */
  textKey: string;
  charCount: number;
}

/**
 * Page-level index of an uploaded document: every physical page is
 * addressable by page number, with its complete text stored locally
 * (IndexedDB) and mirrored to Google Drive for pilot accounts.
 */
export interface DocumentPageIndex {
  unit: 'page';
  totalPages: number;
  /** Per-page spans + storage keys (pages beyond the local cap are
   *  still addressable via the full extracted text offsets). */
  pages: DocumentIndexedPage[];
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
  /** Per-chapter digests when the document was structurally indexed. */
  chapters?: DocumentChapter[];
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
  repetitions?: number;
  interval?: number;
  easeFactor?: number;
  nextReviewDate?: string;
  lastReviewed?: string;
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

/**
 * Persisted state for the Google Drive connection — the user's
 * data store. `folderId` is the app's "SScheduleData" root folder,
 * resolved by name on every (re)connect so it always re-attaches
 * to the same folder. The additional fields are minimal account
 * metadata only — OAuth tokens are never stored here.
 */
export interface GoogleDriveSyncState {
  connected: boolean;
  email?: string;
  folderId: string;
  folderName: string;
  connectedAt?: string;
  lastSyncedAt?: string;
  updatedAt?: string;
  /** Drive storage schema version of the initialized structure. */
  schemaVersion?: number;
  /** Firestore→Drive migration lifecycle state. */
  migrationStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'VERIFIED' | 'COMPLETE';
  /** Drive partition revision at the last checkpoint. */
  revision?: number;
  /** 'legacy' = Firestore primary (default); 'pilot' = Drive primary. */
  storageRole?: 'legacy' | 'pilot';
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
  /**
   * IndexedDB key for the FULL extracted text of this file, so the entire
   * document context is preserved and can be reloaded for AI learning.
   */
  extractedTextKey?: string;
  /** Number of characters of text extracted from the file (0 = nothing extractable). */
  extractedChars?: number;
  /** Chapter/section/slide map of the document for targeted learning. */
  structure?: DocumentStructure;
  /** Per-page index (PDFs / slide decks): every page addressable by number. */
  pageIndex?: DocumentPageIndex;
  aiContext?: ResourceAIContext;
}

/**
 * Payload an upload screen hands to `handleUploadFile`: a partial
 * StudyFile plus the freshly extracted document artifacts (full text,
 * chapter structure, and per-page spans) that the App persists into
 * IndexedDB and mirrors to Drive before AI indexing.
 */
export interface StudyFileUpload extends Partial<StudyFile> {
  extractedContent?: string;
  structure?: DocumentStructure;
  /** Per-page spans from the extractor (PDFs/slide decks). */
  pages?: DocumentPageSpan[] | null;
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
    | 'create_subtasks'
    | 'update_course'
    | 'create_module'
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
    /**
     * Puter API token (puter.com/dashboard#account → "Create token").
     * Stored and used exactly like the other provider keys. This is the
     * reliable way to connect Puter in the packaged APK/iOS app AND on the
     * web: Puter's normal popup `auth.signIn()` shows a blank page in mobile
     * WebViews, but a token calls Puter's OpenAI-compatible endpoint directly.
     */
    puter?: string;
  };
  customEndpoint?: string;
  models: {
    openai: string;
    gemini: string;
    claude: string;
    custom: string;
    puter?: string;
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

export interface AppVersionConfig {
  latestVersion: string;
  minRequiredVersion: string;
  forceUpdate: boolean;
  gracePeriodDays?: number; // Days the user is granted before being hard-blocked (default: 7)
  downloadUrl: string;
  /** Browser URL of the GitHub release page (fallback when no APK asset exists). */
  releasePageUrl?: string;
  /** Name of the APK asset selected from the GitHub release (if any). */
  apkAssetName?: string | null;
  title?: string;
  message?: string;
  releaseNotes?: string[];
  updatedAt?: string;
}

export interface AppUpdateCheckResult {
  isUpdateRequired: boolean;
  isUpdateAvailable: boolean;
  isGracePeriodActive: boolean;
  isHardBlocked: boolean;
  daysRemaining: number;
  gracePeriodDays: number;
  deadlineDate: string;
  currentVersion: string;
  minRequiredVersion: string;
  latestVersion: string;
  downloadUrl: string;
  title: string;
  message: string;
  releaseNotes: string[];
}

export type OfflineSyncCollection =
  | 'tasks'
  | 'schedule'
  | 'courses'
  | 'resources'
  | 'goals'
  | 'files'
  | 'notes'
  | 'research'
  | 'aiMemory'
  | 'conversations'
  | 'notifications'
  | 'metrics'
  | 'quizzes'
  | 'flashcards'
  | 'annotations'
  | 'profile'
  | 'integrations';

export type OfflineSyncAction = 'upsert' | 'delete' | 'batch_upsert';

export interface OfflineQueueItem {
  id: string;
  userId: string;
  collection: OfflineSyncCollection;
  docId: string;
  action: OfflineSyncAction;
  data?: any;
  timestamp: string;
  retryCount: number;
  lastError?: string;
}

export interface OfflineSyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}
