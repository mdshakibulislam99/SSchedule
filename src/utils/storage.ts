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
  ProgressMetrics,
} from '../types';
import { getLocalDateKey } from './dates';

const INITIAL_SCHEDULE_DATE = getLocalDateKey();

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
  METRICS: 'studyai_metrics',
  THEME: 'studyai_theme',
};

export const INITIAL_USER: UserProfile = {
  id: 'user-alex-1',
  name: 'Alex Carter',
  email: 'alex@example.com',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
  university: 'Stanford University',
  studyField: 'Computer Science',
  year: '2nd Year',
  goals: ['Finish assignments', 'Study for exams', 'Improve grades'],
  energyLevel: 4, // 1-5 scale (Good energy)
  isOnboarded: true, // Default to ready, user can re-trigger onboarding from menu
};

export const INITIAL_COURSES: Course[] = [
  {
    id: 'course-cs101',
    code: 'CS101',
    name: 'Algorithms & Data Structures',
    color: '#EF4444',
    professor: 'Dr. Morgan Lee',
    term: 'Fall 2026',
    credits: 4,
    schedulePattern: 'Mon / Wed · 08:00',
    materialsFileIds: ['file-1'],
    studyPlan: ['Review lecture foundations', 'Complete Assignment 2', 'Practice exam problems'],
  },
  {
    id: 'course-math',
    code: 'Math',
    name: 'Calculus III',
    color: '#F59E0B',
    professor: 'Prof. Rivera',
    term: 'Fall 2026',
    credits: 4,
    schedulePattern: 'Tue / Thu · 10:00',
    materialsFileIds: ['file-2'],
    studyPlan: ['Review vector calculus concepts', 'Complete practice set', 'Prepare for exam'],
  },
  {
    id: 'course-project',
    code: 'Project',
    name: 'Capstone Project',
    color: '#10B981',
    professor: 'Project Studio',
    term: 'Fall 2026',
    credits: 3,
    schedulePattern: 'Weekly milestone',
    materialsFileIds: ['file-3'],
    studyPlan: ['Confirm milestone requirements', 'Build the next deliverable', 'Review with teammates'],
  },
];

export const INITIAL_TASKS: Task[] = [
  {
    id: 'task-1',
    title: 'CS101 Assignment 2',
    description: 'Implement AVL Tree balancing algorithm and write unit test suite.',
    courseCode: 'CS101',
    courseColor: '#EF4444', // Red/Orange
    type: 'assignment',
    deadline: '2026-10-04T23:59:00Z',
    estimatedMinutes: 30,
    priority: 'high',
    progress: 60,
    completed: false,
    relatedFileIds: ['file-1'],
    relatedResearchIds: [],
    aiPlanReason: 'Your deadline is in 2 days and you are currently in a good focus window before afternoon commitments.',
    scheduledTime: 'Today · 30 min',
    createdAt: '2026-10-01T10:00:00Z',
    subtasks: [
      { id: 'sub-1', title: 'Review AVL rotation formulas', completed: true, estimatedMinutes: 10, order: 1 },
      { id: 'sub-2', title: 'Write node balance factor check', completed: true, estimatedMinutes: 15, order: 2 },
      { id: 'sub-3', title: 'Implement double rotation logic', completed: false, estimatedMinutes: 20, order: 3 },
      { id: 'sub-4', title: 'Run automated edge-case test suite', completed: false, estimatedMinutes: 15, order: 4 },
    ],
  },
  {
    id: 'task-2',
    title: 'Math Exam Prep',
    description: 'Calculus III vector field integration problem sets.',
    courseCode: 'Math',
    courseColor: '#F59E0B', // Amber
    type: 'exam',
    deadline: '2026-10-06T18:00:00Z',
    estimatedMinutes: 45,
    priority: 'high',
    progress: 40,
    completed: false,
    relatedFileIds: ['file-2'],
    relatedResearchIds: [],
    aiPlanReason: 'Exam is approaching in 4 days. Morning practice boosts problem retention.',
    scheduledTime: 'Today · 2:00 PM',
    createdAt: '2026-10-01T11:00:00Z',
    subtasks: [
      { id: 'sub-5', title: 'Review Green theorem examples', completed: true, estimatedMinutes: 20, order: 1 },
      { id: 'sub-6', title: 'Solve 5 practice problems', completed: false, estimatedMinutes: 25, order: 2 },
    ],
  },
  {
    id: 'task-3',
    title: 'Project Work',
    description: 'Collaborative UI wireframes and database architecture plan.',
    courseCode: 'Project',
    courseColor: '#10B981', // Emerald
    type: 'project',
    deadline: '2026-10-09T23:59:00Z',
    estimatedMinutes: 60,
    priority: 'medium',
    progress: 20,
    completed: false,
    relatedFileIds: ['file-3'],
    relatedResearchIds: ['res-1'],
    aiPlanReason: 'Steady milestone progression avoids last-minute sprint stress.',
    createdAt: '2026-10-01T12:00:00Z',
    subtasks: [
      { id: 'sub-7', title: 'Review API payload specifications', completed: false, estimatedMinutes: 30, order: 1 },
      { id: 'sub-8', title: 'Connect Supabase Auth credentials', completed: false, estimatedMinutes: 30, order: 2 },
    ],
  },
  {
    id: 'task-4',
    title: 'Read Research Paper',
    description: 'Renewable energy integration in edge computing clusters.',
    courseCode: 'Other',
    courseColor: '#6366F1', // Indigo
    type: 'reading',
    deadline: '2026-10-11T23:59:00Z',
    estimatedMinutes: 30,
    priority: 'low',
    progress: 0,
    completed: false,
    relatedFileIds: [],
    relatedResearchIds: ['res-1'],
    createdAt: '2026-10-01T14:00:00Z',
    subtasks: [],
  },
  {
    id: 'task-5',
    title: 'Review Notes',
    description: 'Post-lecture summary & flashcards recap.',
    courseCode: 'CS101',
    courseColor: '#EF4444',
    type: 'reading',
    deadline: '2026-10-03T18:00:00Z',
    estimatedMinutes: 20,
    priority: 'medium',
    progress: 0,
    completed: false,
    relatedFileIds: ['file-1'],
    relatedResearchIds: [],
    createdAt: '2026-10-02T08:00:00Z',
    subtasks: [],
  },
];

export const INITIAL_SCHEDULE: ScheduleEvent[] = [
  {
    id: 'sched-1',
    title: 'CS101 Lecture',
    type: 'class',
    startTime: '08:00',
    endTime: '09:30',
    date: INITIAL_SCHEDULE_DATE,
    courseCode: 'CS101',
    location: 'Turing Hall 102',
    color: '#EF4444',
    isCompleted: true,
  },
  {
    id: 'sched-2',
    title: 'Lunch Break',
    type: 'break',
    startTime: '12:00',
    endTime: '13:00',
    date: INITIAL_SCHEDULE_DATE,
    location: 'Student Union Cafeteria',
    color: '#10B981',
    isCompleted: false,
  },
  {
    id: 'sched-3',
    title: 'Math Exam Prep',
    type: 'study',
    startTime: '14:00',
    endTime: '16:00',
    date: INITIAL_SCHEDULE_DATE,
    courseCode: 'Math',
    location: 'Green Library 2nd Floor',
    color: '#F59E0B',
    isCompleted: false,
  },
  {
    id: 'sched-4',
    title: 'Gym Session',
    type: 'gym',
    startTime: '18:00',
    endTime: '19:00',
    date: INITIAL_SCHEDULE_DATE,
    location: 'Campus Fitness Center',
    color: '#10B981',
    isCompleted: false,
  },
  {
    id: 'sched-5',
    title: 'CS101 Evening Study',
    type: 'study',
    startTime: '20:00',
    endTime: '21:00',
    date: INITIAL_SCHEDULE_DATE,
    courseCode: 'CS101',
    color: '#6366F1',
    isCompleted: false,
  },
];

export const INITIAL_GOALS: Goal[] = [
  {
    id: 'goal-1',
    title: 'Finish CS101 Assignment 2',
    category: 'Assignments',
    targetDate: 'Apr 23',
    progress: 60,
    completed: false,
    aiPlanSteps: ['Review Lecture notes', 'Code tree rotation', 'Pass test cases', 'Submit to Gradescope'],
  },
  {
    id: 'goal-2',
    title: 'Prepare for Math Exam',
    category: 'Exams',
    targetDate: 'Apr 25',
    progress: 40,
    completed: false,
    aiPlanSteps: ['Green theorem chapter review', 'Formula flashcards', 'Mock timed exam'],
  },
  {
    id: 'goal-3',
    title: 'Build Project Prototype',
    category: 'Projects',
    targetDate: 'Apr 28',
    progress: 20,
    completed: false,
    aiPlanSteps: ['Design system tokens', 'Database schema setup', 'Client API integration'],
  },
  {
    id: 'goal-4',
    title: 'Improve Overall Grades to 3.8+ GPA',
    category: 'Academic',
    targetDate: 'This semester',
    progress: 75,
    completed: false,
    aiPlanSteps: ['Maintain 20h study rhythm weekly', 'Attend all professor office hours'],
  },
];

export const INITIAL_FILES: StudyFile[] = [
  {
    id: 'file-1',
    name: 'Lecture_Notes.pdf',
    size: '2.4 MB',
    type: 'pdf',
    uploadedAt: 'Yesterday',
    courseCode: 'CS101',
    summary: 'Comprehensive notes covering Balanced Binary Trees, AVL Rotations, and Time Complexity proofs.',
    keyTopics: ['AVL Trees', 'Balance Factor', 'Rotations', 'O(log n) Guarantees'],
    extractedDeadlines: [
      { title: 'CS101 Assignment 2', date: 'April 23, 11:59 PM' },
      { title: 'Midterm 2 Exam', date: 'May 4, 10:00 AM' },
    ],
  },
  {
    id: 'file-2',
    name: 'Research_Paper.pdf',
    size: '4.8 MB',
    type: 'pdf',
    uploadedAt: 'Apr 1',
    courseCode: 'Other',
    summary: 'State-of-the-art review on clean power transition and solar efficiency advancements.',
    keyTopics: ['Solar PV', 'Grid Stability', 'Clean Tech'],
  },
  {
    id: 'file-3',
    name: 'Project_Plan.docx',
    size: '1.2 MB',
    type: 'docx',
    uploadedAt: '3 days ago',
    courseCode: 'Project',
    summary: 'Capstone system architecture specification, database schemas, and team sprint timeline.',
    keyTopics: ['Architecture', 'FastAPI', 'Supabase', 'Sprint Milestones'],
  },
];

export const INITIAL_RESEARCH: ResearchItem[] = [
  {
    id: 'res-1',
    topic: 'Renewable Energy Technologies',
    summary: "Renewable energy is rapidly becoming the world's primary source of new electricity generation. Solar photovoltaics and onshore wind now offer the lowest levelized cost of energy across major global markets.",
    keyFindings: [
      'Solar energy is the fastest growing renewable technology worldwide.',
      'Wind power is cost-competitive with fossil generation in over 85% of countries.',
      'Hydroelectric power remains the largest single source of clean dispatchable electricity.',
      'Biomass and battery storage are critical for addressing intermittency in microgrids.',
    ],
    sources: [
      { title: 'IEA - World Energy Outlook 2026', url: 'https://iea.org', domain: 'iea.org' },
      { title: 'NASA - Clean Energy Research Division', url: 'https://nasa.gov', domain: 'nasa.gov' },
      { title: 'Google Scholar - Sustainable Energy Papers', url: 'https://scholar.google.com', domain: 'scholar.google.com' },
    ],
    notes: [
      'Focus the literature review section on grid stability and battery chemistry.',
      'Cite the 2026 IEA benchmark figures in Chapter 2.',
    ],
    createdAt: '2026-10-01T15:00:00Z',
  },
];

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

export const INITIAL_AI_MEMORY: AIMemoryItem[] = [
  {
    id: 'mem-1',
    statement: 'Prefers studying difficult analytical concepts in the morning (8:00 AM – 11:00 AM).',
    category: 'schedule',
    dateAdded: 'Apr 1, 2026',
  },
  {
    id: 'mem-2',
    statement: 'Usually benefits from a 10-minute restorative break after 45 to 60 minutes of deep focus.',
    category: 'preference',
    dateAdded: 'Apr 2, 2026',
  },
  {
    id: 'mem-3',
    statement: 'Calculus & Math problem sets require visual step-by-step breakdowns rather than long text.',
    category: 'weakness',
    dateAdded: 'Apr 2, 2026',
  },
  {
    id: 'mem-4',
    statement: 'Targeting a 3.8+ GPA this semester with focus on Computer Science algorithms.',
    category: 'strength',
    dateAdded: 'Apr 3, 2026',
  },
];

export const INITIAL_NOTES: StudyNote[] = [
  {
    id: 'note-1',
    title: 'AVL Tree Rotation Invariants',
    content: 'Left-Left case requires single right rotation on root node. Left-Right case requires left rotation on left child followed by right rotation on parent.',
    courseCode: 'CS101',
    tags: ['Algorithms', 'Exam Prep'],
    createdAt: 'Yesterday',
  },
  {
    id: 'note-2',
    title: 'Vector Field Surface Flux Notes',
    content: 'Flux = double integral of F dot n dS. For closed surfaces, apply Divergence Theorem directly to reduce surface integral to triple volume integral.',
    courseCode: 'Math',
    tags: ['Calculus', 'Formulas'],
    createdAt: 'Apr 1',
  },
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: "It's time to study! 🎯",
    message: 'Your next best step is to finish CS101 Assignment 2 (30 min).',
    timestamp: 'Just now',
    read: false,
    type: 'reminder',
    actionLabel: 'Start Now',
  },
  {
    id: 'notif-2',
    title: 'Upcoming Deadline Alert',
    message: 'CS101 Assignment 2 is due in 2 days (Apr 23, 11:59 PM).',
    timestamp: '1 hour ago',
    read: false,
    type: 'deadline',
  },
  {
    id: 'notif-3',
    title: 'Schedule Updated by AI',
    message: 'Added 45 min Math Exam Prep session tomorrow afternoon to match your energy peak.',
    timestamp: '3 hours ago',
    read: true,
    type: 'insight',
  },
];

export const INITIAL_METRICS: ProgressMetrics = {
  weeklyGoalPercentage: 68,
  studyTimeFormatted: '28h 45m',
  studyTimeDelta: '+12%',
  tasksCompleted: 18,
  tasksTotal: 24,
  focusScore: 8.4,
  dayStreak: 7,
  subjectBreakdown: [
    { course: 'CS101', percentage: 32, color: '#EF4444' },
    { course: 'Math', percentage: 25, color: '#F59E0B' },
    { course: 'Project', percentage: 22, color: '#10B981' },
    { course: 'Other', percentage: 21, color: '#6366F1' },
  ],
};

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
      return data ? JSON.parse(data) : INITIAL_COURSES;
    } catch {
      return INITIAL_COURSES;
    }
  },
  saveCourses(courses: Course[]) {
    localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
  },

  getTasks(): Task[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TASKS);
      return data ? JSON.parse(data) : INITIAL_TASKS;
    } catch {
      return INITIAL_TASKS;
    }
  },
  saveTasks(tasks: Task[]) {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  },

  getSchedule(): ScheduleEvent[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
      return data ? JSON.parse(data) : INITIAL_SCHEDULE;
    } catch {
      return INITIAL_SCHEDULE;
    }
  },
  saveSchedule(schedule: ScheduleEvent[]) {
    localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
  },

  getGoals(): Goal[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.GOALS);
      return data ? JSON.parse(data) : INITIAL_GOALS;
    } catch {
      return INITIAL_GOALS;
    }
  },
  saveGoals(goals: Goal[]) {
    localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
  },

  getFiles(): StudyFile[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.FILES);
      return data ? JSON.parse(data) : INITIAL_FILES;
    } catch {
      return INITIAL_FILES;
    }
  },
  saveFiles(files: StudyFile[]) {
    localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify(files));
  },

  getResearch(): ResearchItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RESEARCH);
      return data ? JSON.parse(data) : INITIAL_RESEARCH;
    } catch {
      return INITIAL_RESEARCH;
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
      return data ? JSON.parse(data) : INITIAL_AI_MEMORY;
    } catch {
      return INITIAL_AI_MEMORY;
    }
  },
  saveAIMemory(memory: AIMemoryItem[]) {
    localStorage.setItem(STORAGE_KEYS.AI_MEMORY, JSON.stringify(memory));
  },

  getNotifications(): NotificationItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      return data ? JSON.parse(data) : INITIAL_NOTIFICATIONS;
    } catch {
      return INITIAL_NOTIFICATIONS;
    }
  },
  saveNotifications(notifs: NotificationItem[]) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
  },

  getNotes(): StudyNote[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTES);
      return data ? JSON.parse(data) : INITIAL_NOTES;
    } catch {
      return INITIAL_NOTES;
    }
  },
  saveNotes(notes: StudyNote[]) {
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
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
};
