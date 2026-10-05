import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
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
import { loadGis } from './googleCalendar';

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

// Popup failures that a token client or redirect can recover from.
const POPUP_FALLBACK_CODES = [
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
  'auth/internal-error',
  'auth/unauthorized-domain',
];

// Sign in with Google
export async function signInWithGoogle(): Promise<FirebaseUser | null> {
  // 1. First, attempt standard Firebase popup
  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (popupErr: any) {
    const code = String(popupErr?.code || '');
    console.warn('Firebase signInWithPopup failed:', code || popupErr?.message, popupErr);

    // If popup was explicitly closed by user, don't fall back, rethrow
    if (code === 'auth/popup-closed-by-user') {
      throw popupErr;
    }

    // 2. Fallback: Google Identity Services (GIS) OAuth Token Client
    // This succeeds inside sandboxed iframes, partitioned cookies, and local/preview environments
    try {
      await loadGis();
      const oauthClientId =
        (firebaseConfig as { oAuthClientId?: string }).oAuthClientId ||
        '830377325312-6lfn62e4ev345tvd4u61cd4bc45l92ol.apps.googleusercontent.com';

      if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2 && oauthClientId) {
        const accessToken = await new Promise<string>((resolve, reject) => {
          try {
            const client = (window as any).google.accounts.oauth2.initTokenClient({
              client_id: oauthClientId,
              scope: 'openid email profile https://www.googleapis.com/auth/calendar.events',
              callback: (resp: any) => {
                if (resp?.access_token) {
                  resolve(resp.access_token);
                } else {
                  reject(new Error(resp?.error_description || resp?.error || 'Google login cancelled'));
                }
              },
              error_callback: (err: any) => {
                reject(new Error(err?.message || 'Google identity popup error'));
              },
            });
            client.requestAccessToken({ prompt: 'select_account' });
          } catch (gisInitErr) {
            reject(gisInitErr);
          }
        });

        if (accessToken) {
          const credential = GoogleAuthProvider.credential(null, accessToken);
          const cred = await signInWithCredential(auth, credential);
          return cred.user;
        }
      }
    } catch (gisErr: any) {
      console.warn('GIS OAuth fallback failed:', gisErr);
    }

    // 3. Last resort fallback: Redirect flow (only outside iframes)
    if (POPUP_FALLBACK_CODES.includes(code) && typeof window !== 'undefined' && window.self === window.top) {
      try {
        await signInWithRedirect(auth, googleProvider);
        return null;
      } catch (redirErr) {
        console.warn('signInWithRedirect failed:', redirErr);
      }
    }

    throw popupErr;
  }
}

// Create account with Email & Password
export async function createAccountWithEmail(email: string, pass: string, displayName?: string): Promise<FirebaseUser> {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  if (displayName && cred.user) {
    try {
      await updateProfile(cred.user, { displayName });
    } catch {}
  }
  return cred.user;
}

// Sign in with Email & Password
export async function signInWithEmail(email: string, pass: string): Promise<FirebaseUser> {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  return cred.user;
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
