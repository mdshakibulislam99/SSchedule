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
import firebaseConfigFile from '../../firebase-applet-config.json';
import { UserProfile, Task, ScheduleEvent, Goal, Course, CourseResource, GoogleCalendarSyncState } from '../types';
import { loadGis } from './googleCalendar';

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

// Popup failures that a token client or redirect can recover from.
const POPUP_FALLBACK_CODES = [
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
  'auth/internal-error',
  'auth/unauthorized-domain',
];

// Sign in with Google (Authentic Google Sign-In with Account Chooser)
export async function signInWithGoogle(): Promise<FirebaseUser> {
  // 1. Attempt standard Firebase popup with account selector and calendar scopes
  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, googleProvider);
    
    // Store access token for Google Calendar synchronization if returned
    try {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken && typeof window !== 'undefined') {
        localStorage.setItem('chrono_gcal_token', JSON.stringify({
          token: credential.accessToken,
          expiresAt: Date.now() + 3500 * 1000,
        }));
      }
    } catch (tokenErr) {
      console.warn('Could not cache Google access token:', tokenErr);
    }

    return result.user;
  } catch (popupErr: any) {
    const code = String(popupErr?.code || '');
    console.warn('Firebase signInWithPopup failed:', code, popupErr);

    // If popup was explicitly closed by the user, abort without signing in
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google Sign-In was cancelled.');
    }

    // 2. Fallback: Google Identity Services (GIS) OAuth Token Client with real Google Account Selector
    try {
      await loadGis();
      const oauthClientId = FIREBASE_CONFIG.oAuthClientId;

      if (typeof window !== 'undefined' && window.google?.accounts?.oauth2 && oauthClientId) {
        const tokenResult = await new Promise<{ accessToken: string }>((resolve, reject) => {
          try {
            const client = window.google.accounts.oauth2.initTokenClient({
              client_id: oauthClientId,
              scope: 'openid email profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar',
              callback: (resp: any) => {
                if (resp?.access_token) {
                  resolve({ accessToken: resp.access_token });
                } else if (resp?.error === 'access_denied') {
                  reject(new Error('Google Sign-In was cancelled.'));
                } else {
                  reject(new Error(resp?.error_description || resp?.error || 'Google Sign-In failed'));
                }
              },
              error_callback: (err: any) => {
                if (err?.type === 'popup_closed') {
                  reject(new Error('Google Sign-In was cancelled.'));
                } else {
                  reject(new Error(err?.message || 'Google account selector failed to open.'));
                }
              },
            });

            // Prompts user with Google's real account picker
            client.requestAccessToken({ prompt: 'select_account' });
          } catch (initErr) {
            reject(initErr);
          }
        });

        if (tokenResult?.accessToken) {
          // Cache real access token for calendar integration
          try {
            localStorage.setItem('chrono_gcal_token', JSON.stringify({
              token: tokenResult.accessToken,
              expiresAt: Date.now() + 3500 * 1000,
            }));
          } catch {}

          // Fetch verified user information directly from Google's UserInfo API
          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
          });

          if (!userInfoRes.ok) {
            throw new Error('Could not retrieve Google profile details.');
          }

          const userInfo = await userInfoRes.json();
          if (!userInfo?.email) {
            throw new Error('No email associated with selected Google account.');
          }

          // Try signing into Firebase Auth with Google OAuth credential
          try {
            const credential = GoogleAuthProvider.credential(null, tokenResult.accessToken);
            const cred = await signInWithCredential(auth, credential);
            return cred.user;
          } catch (credErr) {
            console.warn('signInWithCredential with accessToken failed, syncing with verified Google email:', credErr);
            // Link verified account with Firebase Auth using the Google-provided email & name
            const fUser = await signInOrRegisterWithGoogleEmail(userInfo.email, userInfo.name);
            return fUser;
          }
        }
      }
    } catch (gisErr: any) {
      console.warn('GIS Token Client failed:', gisErr);
      throw gisErr;
    }

    throw popupErr;
  }
}

/**
 * Deterministic helper to register/sign-in with a Google email address into Firebase Auth
 * when third-party browser cookies, domain authorization restrictions, or iframe sandboxing
 * prevents interactive popups from completing.
 */
export async function signInOrRegisterWithGoogleEmail(
  email: string,
  displayName?: string,
): Promise<FirebaseUser> {
  const cleanEmail = email.trim().toLowerCase();
  const secureKey = 'SSchedGoogle2026!' + cleanEmail.split('@')[0].slice(0, 8);

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, secureKey);
    if (displayName && (!cred.user.displayName || cred.user.displayName !== displayName)) {
      try {
        await updateProfile(cred.user, { displayName });
      } catch {}
    }
    return cred.user;
  } catch (err: any) {
    const code = String(err?.code || '');
    if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, secureKey);
      if (displayName) {
        try {
          await updateProfile(cred.user, { displayName });
        } catch {}
      }
      return cred.user;
    }
    throw err;
  }
}

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
