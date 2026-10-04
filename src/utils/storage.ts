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
    description:
      'A rigorous introduction to algorithm design, complexity analysis, and the core data structures that power modern software.',
    coverEmoji: '🌲',
    objectives: [
      'Analyze time and space complexity with Big-O notation',
      'Implement balanced trees, heaps, and hash tables',
      'Apply graph traversal and shortest-path algorithms',
      'Prove correctness of recursive and greedy solutions',
    ],
    modules: [
      { id: 'mod-cs101-1', title: 'Complexity & Big-O Analysis', description: 'Asymptotic notation and recurrence relations', order: 1, completed: true },
      { id: 'mod-cs101-2', title: 'Balanced Trees', description: 'AVL trees, rotations, and balancing invariants', order: 2, completed: false },
      { id: 'mod-cs101-3', title: 'Hashing & Heaps', description: 'Hash functions, collisions, and priority queues', order: 3, completed: false },
      { id: 'mod-cs101-4', title: 'Graph Algorithms', description: 'BFS, DFS, Dijkstra, and topological sort', order: 4, completed: false },
    ],
    materialsFileIds: ['file-1'],
    resourceIds: ['res-cs101-avl', 'res-cs101-complexity', 'res-cs101-graphs'],
    studyPlan: ['Review lecture foundations', 'Complete Assignment 2', 'Practice exam problems'],
    createdAt: '2026-08-15T09:00:00Z',
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
    description:
      'Multivariable calculus covering vector fields, multiple integrals, and the major theorems of vector analysis.',
    coverEmoji: '📐',
    objectives: [
      'Evaluate double and triple integrals in multiple coordinate systems',
      'Compute line and surface integrals of vector fields',
      'Apply Green\u2019s, Stokes\u2019, and Divergence theorems',
      'Model physical systems using vector calculus',
    ],
    modules: [
      { id: 'mod-math-1', title: 'Partial Derivatives', description: 'Gradients, directional derivatives, and optimization', order: 1, completed: true },
      { id: 'mod-math-2', title: 'Multiple Integrals', description: 'Double/triple integrals and change of variables', order: 2, completed: false },
      { id: 'mod-math-3', title: 'Vector Fields', description: 'Line integrals, flux, and circulation', order: 3, completed: false },
      { id: 'mod-math-4', title: 'Integral Theorems', description: 'Green, Stokes, and Divergence theorems', order: 4, completed: false },
    ],
    materialsFileIds: ['file-2'],
    resourceIds: ['res-math-divergence', 'res-math-multiple-integrals'],
    studyPlan: ['Review vector calculus concepts', 'Complete practice set', 'Prepare for exam'],
    createdAt: '2026-08-15T09:10:00Z',
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
    description:
      'A semester-long team project where students design, build, and ship a full-stack product from concept to demo day.',
    coverEmoji: '🚀',
    objectives: [
      'Translate a problem statement into scoped requirements',
      'Design pragmatic system and data architectures',
      'Collaborate with version control and code review',
      'Ship and present a working deliverable',
    ],
    modules: [
      { id: 'mod-project-1', title: 'Discovery & Scoping', description: 'Problem definition and requirements', order: 1, completed: true },
      { id: 'mod-project-2', title: 'Architecture', description: 'System design and data modeling', order: 2, completed: false },
      { id: 'mod-project-3', title: 'Implementation', description: 'Build the core deliverable', order: 3, completed: false },
      { id: 'mod-project-4', title: 'Ship & Present', description: 'Demo, documentation, and handoff', order: 4, completed: false },
    ],
    materialsFileIds: ['file-3'],
    resourceIds: ['res-project-scoping'],
    studyPlan: ['Confirm milestone requirements', 'Build the next deliverable', 'Review with teammates'],
    createdAt: '2026-08-15T09:20:00Z',
  },
];

export const INITIAL_RESOURCES: CourseResource[] = [
  {
    id: 'res-cs101-avl',
    courseId: 'course-cs101',
    courseCode: 'CS101',
    moduleId: 'mod-cs101-2',
    title: 'AVL Trees: Rotations & Balance Factors',
    type: 'pdf',
    content: `# AVL Trees

An **AVL tree** is a self-balancing binary search tree where, for every node, the heights of the left and right subtrees differ by at most one. This keeps the tree height at O(log n), guaranteeing fast search, insert, and delete.

## The Balance Factor

The balance factor of a node is:

> balance(n) = height(left subtree of n) - height(right subtree of n)

For a valid AVL tree every node must have a balance factor in {-1, 0, +1}. Any other value triggers a rotation.

## The Four Rotation Cases

When a node becomes unbalanced after an insertion, one of four cases applies:

1. **Left-Left (LL)** - a single right rotation on the unbalanced node.
2. **Right-Right (RR)** - a single left rotation on the unbalanced node.
3. **Left-Right (LR)** - a left rotation on the left child, then a right rotation on the node.
4. **Right-Left (RL)** - a right rotation on the right child, then a left rotation on the node.

## Why This Matters

Because the tree is rebalanced on every insert and delete, the worst-case height stays logarithmic. This is the main advantage of AVL trees over plain binary search trees, which can degrade to O(n) when keys are inserted in sorted order.

## Worked Example

Insert 30, 20, 10 into an empty AVL tree. After inserting 10, the root 30 has balance factor +2 along the left spine - a Left-Left case. A single **right rotation** at 30 rebalances the tree so that 20 becomes the new root.

## Key Takeaways

- Balance factor must stay within -1, 0, +1.
- Rotations restore balance in O(1) time.
- Insertion and deletion remain O(log n).`,
    estimatedReadMinutes: 6,
    tags: ['Trees', 'Balancing', 'Algorithms'],
    createdAt: '2026-09-01T10:00:00Z',
    reading: { percent: 0, lastPosition: 0, completed: false },
  },
  {
    id: 'res-cs101-complexity',
    courseId: 'course-cs101',
    courseCode: 'CS101',
    moduleId: 'mod-cs101-1',
    title: 'Asymptotic Analysis & Big-O Notation',
    type: 'text',
    content: `# Asymptotic Analysis

Asymptotic analysis describes how the running time or memory of an algorithm grows as the input size n becomes large. We ignore constants and lower-order terms because they matter less at scale.

## Common Complexity Classes

- **O(1)** - constant time, independent of input size.
- **O(log n)** - logarithmic, e.g. binary search.
- **O(n)** - linear, a single pass over the data.
- **O(n log n)** - typical of efficient sorting such as merge sort.
- **O(n^2)** - quadratic, common in naive nested loops.

## Recurrence Relations

Divide-and-conquer algorithms are naturally described by recurrences. Merge sort satisfies:

> T(n) = 2T(n/2) + O(n)

Solving this recurrence gives T(n) = O(n log n).

## Upper vs Lower Bounds

- **Big-O** gives an upper bound.
- **Big-Omega** gives a lower bound.
- **Big-Theta** is a tight bound.

## Practical Advice

Always ask: what is the worst case, the average case, and the best case? Averages often depend on assumptions about input distribution.`,
    estimatedReadMinutes: 4,
    tags: ['Complexity', 'Foundations'],
    createdAt: '2026-09-01T10:05:00Z',
    reading: { percent: 100, lastPosition: 100, lastReadAt: '2026-10-01T09:00:00Z', completed: true },
  },
  {
    id: 'res-cs101-graphs',
    courseId: 'course-cs101',
    courseCode: 'CS101',
    moduleId: 'mod-cs101-4',
    title: 'Graph Traversal & Shortest Paths',
    type: 'slide',
    content: `# Graph Traversal

A graph G = (V, E) is a set of vertices V and edges E. Traversal algorithms visit every reachable vertex exactly once.

## Breadth-First Search (BFS)

BFS explores level by level using a **queue**. It finds the shortest path in terms of number of edges in an unweighted graph.

## Depth-First Search (DFS)

DFS explores as deep as possible before backtracking, using a **stack** (or recursion). It is the basis for topological sort and cycle detection.

## Dijkstra's Algorithm

For weighted graphs with non-negative weights, Dijkstra's algorithm computes single-source shortest paths using a **min-priority queue**. Each vertex is settled once, giving O((V + E) log V) with a binary heap.

## Topological Sort

A topological order of a directed acyclic graph lists vertices so that every edge points forward. It is used for dependency resolution and course scheduling.`,
    estimatedReadMinutes: 5,
    tags: ['Graphs', 'BFS', 'DFS', 'Dijkstra'],
    createdAt: '2026-09-01T10:10:00Z',
    reading: { percent: 0, lastPosition: 0, completed: false },
  },
  {
    id: 'res-math-divergence',
    courseId: 'course-math',
    courseCode: 'Math',
    moduleId: 'mod-math-4',
    title: 'The Divergence Theorem',
    type: 'pdf',
    content: `# The Divergence Theorem

The Divergence Theorem relates the flux of a vector field through a closed surface to the triple integral of its divergence over the enclosed volume.

> Flux through S = triple integral of (div F) dV

## Intuition

Think of the vector field as the velocity of a fluid. The divergence measures how much the fluid is expanding at each point. The theorem says: the total flow out of a closed surface equals the total expansion inside.

## Conditions

- S must be a closed, piecewise-smooth surface.
- F must have continuous partial derivatives on the enclosed region.

## Worked Example

Let F = <x, y, z> and let S be the unit sphere. Here div F = 3 everywhere, so the flux equals 3 times the volume of the sphere, giving 4 pi.

## Applications

- Deriving the continuity equation in fluid dynamics
- Gauss's law in electrostatics
- Simplifying difficult surface integrals into volume integrals`,
    estimatedReadMinutes: 5,
    tags: ['Vector Calculus', 'Theorems'],
    createdAt: '2026-09-02T11:00:00Z',
    reading: { percent: 20, lastPosition: 20, completed: false },
  },
  {
    id: 'res-math-multiple-integrals',
    courseId: 'course-math',
    courseCode: 'Math',
    moduleId: 'mod-math-2',
    title: 'Multiple Integrals & Change of Variables',
    type: 'text',
    content: `# Multiple Integrals

Double integrals integrate a function over a region in the plane; triple integrals integrate over a solid in space.

## Iterated Integrals

A double integral over a rectangle can be evaluated as an iterated integral:

> double integral of f(x, y) dA = integral of integral of f(x, y) dy dx

Fubini's Theorem lets us choose the order of integration when the function is continuous.

## Change of Variables

When a region is awkward in Cartesian coordinates, transform it. The **Jacobian determinant** accounts for how area or volume scales under the transformation.

For polar coordinates the Jacobian is r, giving dA = r dr d(theta).

## Choosing Coordinates

- **Rectangular** for box-like regions.
- **Polar** for circular symmetry in the plane.
- **Cylindrical** for solids with rotational symmetry.
- **Spherical** for balls, cones, and radial fields.`,
    estimatedReadMinutes: 4,
    tags: ['Integrals', 'Coordinates'],
    createdAt: '2026-09-02T11:05:00Z',
    reading: { percent: 0, lastPosition: 0, completed: false },
  },
  {
    id: 'res-project-scoping',
    courseId: 'course-project',
    courseCode: 'Project',
    moduleId: 'mod-project-1',
    title: 'Scoping a Capstone Project',
    type: 'docx',
    content: `# Scoping Your Capstone

Great projects fail more often from poor scoping than from poor engineering. Scope is the boundary of what you will and will not build.

## Start With the Problem

Write a one-sentence problem statement in plain language. If you cannot explain the problem without jargon, you do not yet understand it well enough to build.

## Define Success

List 3-5 measurable outcomes. "Users can complete checkout in under two minutes" is testable; "make it fast" is not.

## Cut Relentlessly

For every feature, ask: does this prove the core idea? If not, move it to a "later" list. A small feature that works beats a large feature that half-works.

## Milestones

Break the semester into weekly milestones, each with a concrete deliverable you can demo. Protect the last two weeks for integration and polish.

## Risk Checklist

- What is the hardest technical unknown?
- What external dependency could block you?
- Who is the customer and have you talked to them?`,
    estimatedReadMinutes: 4,
    tags: ['Planning', 'Milestones'],
    createdAt: '2026-09-03T12:00:00Z',
    reading: { percent: 0, lastPosition: 0, completed: false },
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

export const INITIAL_NOTIFICATION_SETTINGS: NotificationSettings = {
  inAppBanners: true,
  soundEnabled: true,
  browserNotifications: false,
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
      const parsed: Course[] = data ? JSON.parse(data) : INITIAL_COURSES;
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
      return INITIAL_COURSES;
    }
  },
  saveCourses(courses: Course[]) {
    localStorage.setItem(STORAGE_KEYS.COURSES, JSON.stringify(courses));
  },

  getResources(): CourseResource[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RESOURCES);
      const list: CourseResource[] = data ? JSON.parse(data) : INITIAL_RESOURCES;
      return list.map(ensureResourceAIContext);
    } catch {
      return INITIAL_RESOURCES.map(ensureResourceAIContext);
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
      const list: StudyFile[] = data ? JSON.parse(data) : INITIAL_FILES;
      return list.map(ensureFileAIContext);
    } catch {
      return INITIAL_FILES.map(ensureFileAIContext);
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
      return data ? JSON.parse(data) : INITIAL_NOTES;
    } catch {
      return INITIAL_NOTES;
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

  exportBackup(): string {
    const backup: Record<string, any> = {
      app: 'ChronoPulse AI',
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
