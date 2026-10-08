import { useEffect, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { offlineSyncService } from '../services/offlineSyncService';
import type { OfflineSyncCollection } from '../types';

/**
 * Mirrors local deletions into Firestore for one collection.
 *
 * Keeps a snapshot of the ids seen on the previous render and enqueues a
 * Firestore delete for every id that disappeared, so removing an item locally
 * (single delete, "clear all", or cascading course removal) also removes it
 * from the cloud instead of resurrecting on the next restore.
 *
 * The first run after a sign-in only establishes the snapshot without
 * deleting, so the login-time restore can never wipe cloud data.
 */
export function useCloudDeleteSync<T extends { id: string }>(
  items: T[],
  collection: OfflineSyncCollection,
  firebaseUser: FirebaseUser | null,
  isPaused: boolean = false,
): void {
  const knownIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!firebaseUser || isPaused) {
      knownIdsRef.current = null;
      return;
    }
    const uid = firebaseUser.uid;
    const nextIds = new Set(items.map((item) => item.id));
    const knownIds = knownIdsRef.current;

    // Safety guard: only delete individual items when transitioning between non-empty states.
    // If the entire collection was cleared (nextIds.size === 0), that happens on logout,
    // account switch, or state resets, and must NEVER wipe the user's remote cloud database.
    if (knownIds && knownIds.size > 0 && nextIds.size > 0) {
      knownIds.forEach((id) => {
        if (!nextIds.has(id)) offlineSyncService.enqueueDelete(uid, collection, id);
      });
    }
    knownIdsRef.current = nextIds;
  }, [items, collection, firebaseUser, isPaused]);
}