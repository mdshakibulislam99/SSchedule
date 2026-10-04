import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  collection,
  getDocs,
  writeBatch,
  deleteDoc,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, Task, ScheduleEvent, Goal, Course, CourseResource, GoogleCalendarSyncState } from '../types';

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with robust multi-tab persistent offline cache
function initFirestoreWithOfflinePersistence(): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (err) {
    // Falls back to getFirestore if already initialized or not supported in current environment
    return getFirestore(app);
  }
}

export const db: Firestore = initFirestoreWithOfflinePersistence();
export const googleProvider = new GoogleAuthProvider();

// Connection test as requested by Firebase Integration guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or initializing.');
    }
  }
}
testConnection();

// Popup failures that a full-page redirect can recover from.
const POPUP_FALLBACK_CODES = [
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
  'auth/internal-error',
];

// Sign in with Google
export async function signInWithGoogle(): Promise<FirebaseUser | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    const code = String(error?.code || '');
    console.error('Google Sign-In failed:', code || error?.message, error);
    if (POPUP_FALLBACK_CODES.includes(code)) {
      // Popups are unavailable here (blocked, embedded view, or partitioned
      // storage). Fall back to a full-page redirect, which isn't popup-gated.
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

// Completes a sign-in that used the redirect fallback (call once on load).
export async function completeGoogleRedirect(): Promise<FirebaseUser | null> {
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch (error: any) {
    console.error('Google redirect sign-in failed:', error?.code || error?.message, error);
    throw error;
  }
}

// Sign out
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

// Auth State Listener
export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// Firestore Persistence Helpers
export async function syncUserProfileToFirestore(userId: string, profile: UserProfile) {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      ...profile,
      id: userId,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Failed to sync profile to Firestore:', err);
  }
}

export async function fetchUserDataFromFirestore(userId: string): Promise<{
  profile: Partial<UserProfile> | null;
  tasks: Task[];
  schedule: ScheduleEvent[];
  goals: Goal[];
  courses: Course[];
  resources: CourseResource[];
  calendarSync: GoogleCalendarSyncState | null;
}> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    const profile = userDoc.exists() ? (userDoc.data() as UserProfile) : null;

    // Fetch tasks
    const tasksSnapshot = await getDocs(collection(db, 'users', userId, 'tasks'));
    const tasks: Task[] = [];
    tasksSnapshot.forEach((d) => tasks.push(d.data() as Task));

    // Fetch schedule
    const scheduleSnapshot = await getDocs(collection(db, 'users', userId, 'schedule'));
    const schedule: ScheduleEvent[] = [];
    scheduleSnapshot.forEach((d) => schedule.push(d.data() as ScheduleEvent));

    // Fetch goals
    const goalsSnapshot = await getDocs(collection(db, 'users', userId, 'goals'));
    const goals: Goal[] = [];
    goalsSnapshot.forEach((d) => goals.push(d.data() as Goal));

    // Fetch course workspaces
    const coursesSnapshot = await getDocs(collection(db, 'users', userId, 'courses'));
    const courses: Course[] = [];
    coursesSnapshot.forEach((d) => courses.push(d.data() as Course));

    // Fetch course resources
    const resourcesSnapshot = await getDocs(collection(db, 'users', userId, 'resources'));
    const resources: CourseResource[] = [];
    resourcesSnapshot.forEach((d) => resources.push(d.data() as CourseResource));

    // Fetch Google Calendar integration state
    let calendarSync: GoogleCalendarSyncState | null = null;
    try {
      const syncDoc = await getDoc(doc(db, 'users', userId, 'integrations', 'googleCalendar'));
      if (syncDoc.exists()) calendarSync = syncDoc.data() as GoogleCalendarSyncState;
    } catch (err) {
      console.warn('Failed to read Google Calendar sync state:', err);
    }

    return { profile, tasks, schedule, goals, courses, resources, calendarSync };
  } catch (err) {
    console.warn('Error fetching Firestore data:', err);
    return { profile: null, tasks: [], schedule: [], goals: [], courses: [], resources: [], calendarSync: null };
  }
}

export async function syncTasksToFirestore(userId: string, tasks: Task[]) {
  try {
    const batch = writeBatch(db);
    tasks.forEach((t) => {
      const taskRef = doc(db, 'users', userId, 'tasks', t.id);
      batch.set(taskRef, { ...t, userId }, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Failed to sync tasks to Firestore:', err);
  }
}

export async function syncScheduleToFirestore(userId: string, schedule: ScheduleEvent[]) {
  try {
    const batch = writeBatch(db);
    schedule.forEach((s) => {
      const sRef = doc(db, 'users', userId, 'schedule', s.id);
      batch.set(sRef, { ...s, userId }, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Failed to sync schedule to Firestore:', err);
  }
}

export async function syncCoursesToFirestore(userId: string, courses: Course[]) {
  try {
    const batch = writeBatch(db);
    courses.forEach((c) => {
      const cRef = doc(db, 'users', userId, 'courses', c.id);
      batch.set(cRef, { ...c, userId }, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Failed to sync courses to Firestore:', err);
  }
}

export async function syncResourcesToFirestore(userId: string, resources: CourseResource[]) {
  try {
    const batch = writeBatch(db);
    resources.forEach((r) => {
      const rRef = doc(db, 'users', userId, 'resources', r.id);
      batch.set(rRef, { ...r, userId }, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Failed to sync course resources to Firestore:', err);
  }
}

export async function syncGoogleCalendarStateToFirestore(
  userId: string,
  state: GoogleCalendarSyncState,
) {
  try {
    await setDoc(doc(db, 'users', userId, 'integrations', 'googleCalendar'), {
      ...state,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Failed to sync Google Calendar state to Firestore:', err);
  }
}

export async function deleteTaskFromFirestore(userId: string, taskId: string) {
  try {
    await deleteDoc(doc(db, 'users', userId, 'tasks', taskId));
  } catch (err) {
    console.warn('Failed to delete task from Firestore:', err);
  }
}

export async function deleteCourseFromFirestore(userId: string, courseId: string) {
  try {
    await deleteDoc(doc(db, 'users', userId, 'courses', courseId));
  } catch (err) {
    console.warn('Failed to delete course from Firestore:', err);
  }
}
