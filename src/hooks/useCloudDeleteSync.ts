import { useEffect, useRef } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { offlineSyncService } from '../services/offlineSyncService';
import type { OfflineSyncCollection } from '../types';
import { isCollectionDriveAuthoritative } from '../services/storageInterface';
import { deleteCollectionRecord } from '../services/collectionPilotService';
import { COLLECTION_MAPPINGS } from '../types/driveStorage';
import { deleteTaskOnDrive } from '../services/taskPilotService';

/**
 * Mirrors local deletions into Firestore for one collection.
 *
 * Keeps a snapshot of the ids seen on the previous render and enqueues a
 * Firestore delete for every id that disappeared, so removing an item locally
 * (single delete, "clear all", or cascading course removal) also removes it
 * from the cloud instead of resurrecting on the next restore.
 *
 * The first run after a sign-in only establishes the snapshot without
 * deleting, so the login-time restore can never wipe cloud data. Restore
 * and sign-out pause this hook; an intentional clear of the last item still
 * produces a remote tombstone.
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

    if (knownIds && knownIds.size > 0) {
      knownIds.forEach((id) => {
        if (nextIds.has(id)) return;
        if (isCollectionDriveAuthoritative(collection, uid)) {
          const deletion = collection === 'tasks'
            ? deleteTaskOnDrive(uid, id)
            : deleteCollectionRecord(
              collection,
              COLLECTION_MAPPINGS[collection]?.entityType ?? collection,
              uid,
              id,
            );
          void deletion.catch((error) => {
            console.warn(`Drive deletion failed for ${collection}/${id}:`, error);
          });
        } else {
          offlineSyncService.enqueueDelete(uid, collection, id);
        }
      });
    }
    knownIdsRef.current = nextIds;
  }, [items, collection, firebaseUser, isPaused]);
}
