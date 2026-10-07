import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithCustomToken,
  updatePassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
import firebaseConfigFile from '../../firebase-applet-config.json';
import { UserProfile, Task, ScheduleEvent, Goal, Course, CourseResource, GoogleCalendarSyncState } from '../types';

// The verified Firebase project configuration provided by the user
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAhuWqsgKLqmHshi34kez6yZ6UW7mvjcp8",
  authDomain: "gen-lang-client-0201565741.firebaseapp.com",
  projectId: "gen-lang-client-0201565741",
  storageBucket: "gen-lang-client-0201565741.firebasestorage.app",
  messagingSenderId: "830377325312",
  appId: "1:830377325312:web:06a94ca286c4b1a8fc79e5",
  firestoreDatabaseId: (firebaseConfigFile as any).firestoreDatabaseId || "ai-studio-chronopulseaisma-1e7ab4a8-1e54-4bf9-a7ac-a1fda5873d72",
  oAuthClientId: (firebaseConfigFile as any).oAuthClientId || "830377325312-6lfn62e4ev345tvd4u61cd4bc45l92ol.apps.googleusercontent.com",
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);

// Initialize Firestore with robust multi-tab persistent offline cache and designated databaseId
function initFirestoreWithOfflinePersistence(): Firestore {
  const databaseId = FIREBASE_CONFIG.firestoreDatabaseId;
  try {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      return initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        databaseId
      );
    }
  } catch (err) {
    // Falls back to getFirestore if already initialized or not supported in current environment
    console.warn('initializeFirestore fallback to getFirestore:', err);
  }
  return getFirestore(app, databaseId);
}

export const db: Firestore = initFirestoreWithOfflinePersistence();
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/calendar');

export function getCurrentAuthDomain(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.hostname;
  }
  return 'localhost';
}

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

// Sign in with Google (Authentic Google Sign-In with Account Chooser)
//
// Delegates to `googleAuth.ts`, which picks the right strategy per platform:
//   - native (Android/iOS): Google's native SDK, because OAuth consent is
//     blocked inside an embedded WebView.
//   - web: popup -> GIS token client -> full-page redirect.
export async function signInWithGoogle(): Promise<FirebaseUser> {
  const { signInWithGooglePlatform } = await import('./googleAuth');
  return signInWithGooglePlatform();
}

/**
 * @deprecated Removed for security reasons.
 *
 * This helper signed a user in by deriving a *guessable, deterministic*
 * password from their email address ('SSchedGoogle2026!' + first 8 chars of the
 * local part) and creating/signing into an email+password account.
 *
 * That is a full account-takeover hole: anyone who knows an email address
 * could reproduce the password and sign in as that user, entirely bypassing
 * Google's identity verification. Google sign-in must only ever be trusted
 * through a Google-signed ID token (see `signInWithGoogle`).
 */

// 1-Click student demo authentication helper
export async function signInWithStudentDemo(): Promise<FirebaseUser> {
  const demoEmail = 'student@university.edu';
  const demoPass = 'StudyAI2026!';
  try {
    const cred = await signInWithEmailAndPassword(auth, demoEmail, demoPass);
    return cred.user;
  } catch {
    const cred = await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
    try {
      await updateProfile(cred.user, { displayName: 'Student Scholar' });
    } catch {}
    return cred.user;
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

// ---- In-app password reset via email OTP (backed by Cloud Functions) ----
// Step 1: ask the backend to email a 6-digit code to the account
export async function requestResetOtp(email: string): Promise<void> {
  const fn = httpsCallable(getFunctions(), 'requestPasswordResetOtp');
  await fn({ email });
}

// Step 2: verify the code; returns a short-lived token proving verification
export async function verifyResetOtp(email: string, code: string): Promise<string> {
  const fn = httpsCallable(getFunctions(), 'verifyPasswordResetOtp');
  const res = await fn({ email, code });
  return (res.data as { token: string }).token;
}

// Step 3: sign in with the verification token and set the new password
// (the new password goes only to Firebase Auth, never to our servers)
export async function finishPasswordReset(token: string, newPassword: string): Promise<FirebaseUser> {
  const cred = await signInWithCustomToken(auth, token);
  await updatePassword(cred.user, newPassword);
  return cred.user;
}

// ---- Reset password via Firebase's own email link (no external services) ----
// Sends Firebase's standard reset-email link. The user taps the link in their
// email and completes the password change on Firebase's page. Simple & zero-setup.
// (A true in-app 6-digit OTP code would need the Cloud Function in functions/
// + an email provider; that's optional — see functions/index.js.)
export async function resetPasswordWith(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
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
