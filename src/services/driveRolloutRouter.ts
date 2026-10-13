/**
 * Drive rollout router — the single integration point between the app's
 * collection state and the generic collection pilot service.
 *
 * A collection becomes Drive-authoritative only when the per-collection
 * rollout gate allows it (isCollectionDriveAuthoritative); until then this
 * module routes reads and writes to the legacy Firestore path exactly as
 * today. Reuses collectionPilotService — no second data model.
 */

import { COLLECTION_MAPPINGS } from '../types/driveStorage';
import {
  deleteCollectionRecord,
  isCollectionPilotActive,
  loadCollectionRecordsFromDrive,
  persistCollectionChange,
  retryPendingCollectionChanges,
  type CollectionPendingReason,
  type PilotRecord,
} from './collectionPilotService';
import { isCollectionDriveAuthoritative } from './storageInterface';

/** Every content collection this router knows how to persist. */
export const ROUTED_COLLECTIONS: ReadonlyArray<string> = Object.freeze(
  Object.keys(COLLECTION_MAPPINGS).filter((key) => key !== 'tasks'),
);

export interface CollectionWriteOutcome {
  persisted: boolean;
  pending: boolean;
  pendingReason?: CollectionPendingReason;
  revision?: number;
  /** True when the legacy Firestore path handled the write. */
  viaLegacy: boolean;
}

export interface CollectionRouterDeps {
  writeLegacy: (collection: string, records: PilotRecord[]) => void | Promise<void>;
  deleteLegacy?: (collection: string, recordId: string) => void | Promise<void>;
}

function entityTypeFor(collection: string): string {
  return COLLECTION_MAPPINGS[collection]?.entityType ?? collection;
}

/** True when a collection's reads/writes must go to the user's Drive. */
export function shouldUseDriveForCollection(
  collection: string,
  uid: string | null | undefined,
): boolean {
  if (!uid || !isCollectionPilotActive(uid)) return false;
  return isCollectionDriveAuthoritative(collection, uid);
}

/**
 * Persist changed records for one collection. Drive-authoritative
 * collections go through the revision-checked pilot (queued when offline,
 * never redirected to Firestore); everything else uses the legacy path.
 */
export async function persistRoutedCollection<T extends PilotRecord>(
  collection: string,
  uid: string,
  changed: T[],
  baseRevisions: Map<string, number>,
  deps: CollectionRouterDeps,
): Promise<CollectionWriteOutcome[]> {
  if (!shouldUseDriveForCollection(collection, uid)) {
    if (changed.length > 0) {
      await deps.writeLegacy(collection, changed);
    }
    return changed.map(() => ({ persisted: true, pending: false, viaLegacy: true }));
  }
  const entityType = entityTypeFor(collection);
  const outcomes: CollectionWriteOutcome[] = [];
  for (const record of changed) {
    const baseRevision = baseRevisions.get(record.id);
    const result = await persistCollectionChange(
      collection,
      entityType,
      uid,
      record,
      baseRevision === undefined ? 'create' : 'update',
      baseRevision,
    );
    if (result.revision !== undefined) {
      baseRevisions.set(record.id, result.revision);
    }
    outcomes.push({
      persisted: result.persisted,
      pending: result.pending,
      pendingReason: result.pendingReason,
      revision: result.revision,
      viaLegacy: false,
    });
  }
  return outcomes;
}

/**
 * Delete one record. Drive collections become tombstones (recoverable);
 * legacy collections use the existing delete path.
 */
export async function deleteRoutedRecord(
  collection: string,
  uid: string,
  recordId: string,
  baseRevision: number | undefined,
  deps: CollectionRouterDeps,
): Promise<{ viaLegacy: boolean; pending: boolean; pendingReason?: CollectionPendingReason }> {
  if (!shouldUseDriveForCollection(collection, uid)) {
    if (deps.deleteLegacy) {
      await deps.deleteLegacy(collection, recordId);
    }
    return { viaLegacy: true, pending: false };
  }
  const result = await deleteCollectionRecord(
    collection,
    uid,
    recordId,
    'delete',
    baseRevision,
  );
  return { viaLegacy: false, pending: result.pending, pendingReason: result.pendingReason };
}

/**
 * Load the authoritative record list for a collection. Returns
 * viaDrive=false when the collection is legacy-routed (caller keeps its
 * Firestore restore untouched).
 */
export async function loadRoutedCollection<T extends PilotRecord>(
  collection: string,
  uid: string,
): Promise<{ records: T[]; revisions: Map<string, number>; viaDrive: boolean }> {
  if (!shouldUseDriveForCollection(collection, uid)) {
    return { records: [], revisions: new Map(), viaDrive: false };
  }
  const envelopes = await loadCollectionRecordsFromDrive<T>(collection);
  return {
    records: envelopes.filter((e) => !e.deletedAt).map((e) => e.payload),
    revisions: new Map(envelopes.map((e) => [e.id, e.revision])),
    viaDrive: true,
  };
}

/** Flush queued Drive writes for one collection after a reconnect. */
export async function flushRoutedCollection<T extends PilotRecord>(
  collection: string,
  entityType: string,
  uid: string,
): Promise<number> {
  if (!shouldUseDriveForCollection(collection, uid)) return 0;
  return retryPendingCollectionChanges<T>(collection, entityType, uid);
}
