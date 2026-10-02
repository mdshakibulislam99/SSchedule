import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  collection,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, Task, ScheduleEvent, Goal } from '../types';

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
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

// Sign in with Google
export async function signInWithGoogle(): Promise<FirebaseUser | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Google Sign-In failed:', error);
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

    return { profile, tasks, schedule, goals };
  } catch (err) {
    console.warn('Error fetching Firestore data:', err);
    return { profile: null, tasks: [], schedule: [], goals: [] };
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
