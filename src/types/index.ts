export type PriorityLevel = 'high' | 'medium' | 'low';
export type TaskType = 'assignment' | 'exam' | 'project' | 'reading' | 'other';

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

export interface Course {
  id: string;
  code: string; // e.g. "CS101", "MATH"
  name: string;
  color: string;
  professor?: string;
  schedulePattern?: string;
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
  courseCode: string;
  courseColor: string;
  type: TaskType;
  deadline: string; // ISO string
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
  type: 'pdf' | 'docx' | 'image' | 'text';
  uploadedAt: string;
  summary?: string;
  extractedDeadlines?: { title: string; date: string }[];
  keyTopics?: string[];
  courseCode?: string;
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
