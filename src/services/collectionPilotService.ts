/**
 * Generic per-collection Drive pilot.
 *
 * Generalizes the proven task pilot (revision-checked CRUD, tombstones,
 * per-uid offline queue, token-refresh retry, minimal Firestore signals)
 * to ANY partitioned collection — schedules, notes, and (later) the rest.
 *
 * The task pilot (`taskPilotService.ts`) stays exactly as-is for tasks so
 * its behavior and tests are untouched; this module is the reusable core
 * the remaining collections route through. Both write the SAME minimal
 * signal schema ({ entityType, recordId, revision, updatedAt, op }) into
 * `users/{uid}/sync-signals/{recordId}`, governed by the same payload-free
 * Firestore rule.
 *
 * A collection becomes Drive-authoritative for an account only when that
 * account is an explicit Drive pilot (isDrivePilotEnabled). Drive stays
 * authoritative even when offline/unauthed — failures queue per-uid and
 * are retried, never redirected to Firestore.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  DrivePartition,
  DriveRecordEnvelope,
  createRecordEnvelope,
  getDeviceId,
} from '../types/driveStorage';
import { driveService } from './driveService';
import { isDrivePilotEnabled } from './storageInterface';
import { findRecord, tombstoneRecord, upsertRecord } from './drivePartition';
import {
  DriveAuthError,
  DriveNetworkError,
  DrivePermissionError,
} from '../lib/driveApi';

export type CollectionOperation = 'create' | 'update' | 'delete';

/** A record stored in Drive must carry a stable string id. */
export type PilotRecord = { id: string };

export interface CollectionSyncSignal {
  entityType: string;
  recordId: string;
  revision: number;
  updatedAt: string;
  op: CollectionOperation;
}

export interface CollectionConflictRecord<T> {
  collection: string;
  recordId: string;
  baseRevision: number;
  driveRevision: number;
  localVersion: T;
  detectedAt: string;
  deviceId: string;
}

export interface PendingCollectionChange<T> {
  recordId: string;
  op: CollectionOperation;
  record?: T;
  /** The Drive revision the change was based on. */
  baseRevision?: number;
  queuedAt: string;
}

export type CollectionPendingReason = 'offline' | 'needs-reconnect';

export interface CollectionPersistResult {
  persisted: boolean;
  pending: boolean;
  revision?: number;
  pendingReason?: CollectionPendingReason;
}

export class DriveCollectionConflictError extends Error {
  collection: string;
  recordId: string;
  baseRevision: number;
  driveRevision: number;

  constructor(collection: string, recordId: string, baseRevision: number, driveRevision: number) {
    super(
      `"${recordId}" (${collection}) was changed on another device (Drive revision ${driveRevision}; your edit was based on ${baseRevision}). Your version was kept in the Google Drive conflicts folder — reload to see the latest.`,
    );
    this.name = 'DriveCollectionConflictError';
    this.collection = collection;
    this.recordId = recordId;
    this.baseRevision = baseRevision;
    this.driveRevision = driveRevision;
  }
}

// ---------------------------------------------------------------------------
// Injectable backends (mirror the task pilot so tests stay deterministic)
// ---------------------------------------------------------------------------

export interface CollectionPartitionBackend<T> {
  readPartitions(): Promise<DrivePartition<T>[]>;
  writePartitions(partitions: DrivePartition<T>[]): Promise<void>;
  preserveConflict(conflict: CollectionConflictRecord<T>): Promise<void>;
}

export interface CollectionSignalBackend {
  publish(signal: CollectionSyncSignal): Promise<void>;
  read(recordId: string): Promise<CollectionSyncSignal | null>;
}

/** Firestore sync-signal backend: minimal metadata only. */
export function createFirestoreSignalBackend(uid: string): CollectionSignalBackend {
  return {
    async publish(signal) {
      await setDoc(
        doc(db, 'users', uid, 'sync-signals', signal.recordId),
        signal,
        { merge: true },
      );
    },
    async read(recordId) {
      const snap = await getDoc(doc(db, 'users', uid, 'sync-signals', recordId));
      return snap.exists() ? (snap.data() as CollectionSyncSignal) : null;
    },
  };
}

/** The real partition backend over the authorized Drive connection. */
export function createDrivePartitionBackend<T extends PilotRecord>(
  collection: string,
): CollectionPartitionBackend<T> {
  return {
    async readPartitions() {
      const files = await driveService.listPartitionFiles(collection);
      const partitions: DrivePartition<T>[] = [];
      for (const file of files) {
        partitions.push(
          (await driveService.readPartition(collection, file.id)) as DrivePartition<T>,
        );
      }
      return partitions;
    },
    async writePartitions(partitions) {
      for (const partition of partitions) {
        await driveService.writePartition(partition);
      }
    },
    async preserveConflict(conflict) {
      const name = `${collection}-${conflict.recordId}-${Date.now()}.json`;
      await driveService.writeFileToFolder('_system/conflicts', name, conflict);
    },
  };
}

// ---------------------------------------------------------------------------
// Per-uid pending queues (localStorage, idempotent, keyed by collection)
// ---------------------------------------------------------------------------

function queueKey(collection: string, uid: string): string {
  return `sschedule_drive_${collection}q_${uid}`;
}
function signalQueueKey(uid: string): string {
  return `sschedule_drive_sigq_${uid}`;
}

function readQueue<V>(key: string): V[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as V[];
  } catch {
    return [];
  }
}

function writeQueue<V>(key: string, items: V[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export function getPendingCollectionChanges<T>(
  collection: string,
  uid: string,
): PendingCollectionChange<T>[] {
  return readQueue<PendingCollectionChange<T>>(queueKey(collection, uid));
}

function enqueuePendingChange<T>(
  collection: string,
  uid: string,
  change: PendingCollectionChange<T>,
): void {
  const pending = readQueue<PendingCollectionChange<T>>(queueKey(collection, uid));
  // One entry per record: a newer local change supersedes an older one.
  const filtered = pending.filter((c) => c.recordId !== change.recordId);
  filtered.push(change);
  writeQueue(queueKey(collection, uid), filtered);
}

// ---------------------------------------------------------------------------
// Failure classification (identical rules to the task pilot)
// ---------------------------------------------------------------------------

function isNetworkError(err: unknown): boolean {
  return (
    err instanceof DriveNetworkError ||
    err instanceof TypeError ||
    (err instanceof Error && /network|offline|fetch/i.test(err.message))
  );
}

function isAuthError(err: unknown): boolean {
  if (err instanceof DriveAuthError) return true;
  if (err instanceof DrivePermissionError) {
    return (
      err.reason === 'authError' ||
      err.reason === 'insufficientPermissions' ||
      err.reason === 'forbidden' ||
      err.reason === undefined
    );
  }
  return (
    err instanceof Error &&
    /unauthorized|invalid_grant|invalid_token|reconnect|expired|401/i.test(err.message)
  );
}

function classifyRecoverableFailure(err: unknown): CollectionPendingReason | null {
  if (isNetworkError(err)) return 'offline';
  if (isAuthError(err)) return 'needs-reconnect';
  return null;
}

/** One silent token refresh, then retry — lets an expired token self-heal. */
async function withTokenRefreshRetry<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (!isAuthError(err)) throw err;
    try {
      const { requestDriveToken } = await import('../lib/googleDrive');
      await requestDriveToken({ silent: true });
    } catch {
      // Silent refresh unavailable — surface the original auth error.
    }
    return op();
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function loadCollectionRecordsFromDrive<T extends PilotRecord>(
  collection: string,
  backend: CollectionPartitionBackend<T> = createDrivePartitionBackend<T>(collection),
): Promise<DriveRecordEnvelope<T>[]> {
  const partitions = await backend.readPartitions();
  return partitions.flatMap((p) => p.records);
}

export async function loadCollectionFromDrive<T extends PilotRecord>(
  collection: string,
  backend: CollectionPartitionBackend<T> = createDrivePartitionBackend<T>(collection),
): Promise<T[]> {
  const records = await loadCollectionRecordsFromDrive(collection, backend);
  return records.filter((r) => !r.deletedAt).map((r) => r.payload);
}


// ---------------------------------------------------------------------------
// Writes (revision-checked, conflict-preserving)
// ---------------------------------------------------------------------------

export async function persistCollectionChange<T extends PilotRecord>(
  collection: string,
  entityType: string,
  uid: string,
  record: T,
  op: CollectionOperation,
  baseRevision?: number,
  backend: CollectionPartitionBackend<T> = createDrivePartitionBackend<T>(collection),
  signalBackend: CollectionSignalBackend = createFirestoreSignalBackend(uid),
): Promise<CollectionPersistResult> {
  let partitions: DrivePartition<T>[];
  let existing: { record: DriveRecordEnvelope<T> } | null;

  try {
    partitions = await withTokenRefreshRetry(() => backend.readPartitions());
    existing = findRecord(partitions, record.id);
  } catch (err) {
    const reason = classifyRecoverableFailure(err);
    if (reason) {
      enqueuePendingChange(collection, uid, {
        recordId: record.id,
        op,
        record,
        baseRevision,
        queuedAt: new Date().toISOString(),
      });
      return { persisted: false, pending: true, pendingReason: reason };
    }
    throw err;
  }

  // Revision mismatch → block, preserve both versions, never overwrite.
  if (existing && baseRevision !== undefined && existing.record.revision !== baseRevision) {
    await backend.preserveConflict({
      collection,
      recordId: record.id,
      baseRevision,
      driveRevision: existing.record.revision,
      localVersion: record,
      detectedAt: new Date().toISOString(),
      deviceId: getDeviceId(),
    });
    throw new DriveCollectionConflictError(
      collection,
      record.id,
      baseRevision,
      existing.record.revision,
    );
  }

  // Idempotent duplicate-create guard.
  if (op === 'create' && existing && !existing.record.deletedAt && baseRevision === undefined) {
    if (JSON.stringify(existing.record.payload) === JSON.stringify(record)) {
      return { persisted: true, pending: false, revision: existing.record.revision };
    }
    await backend.preserveConflict({
      collection,
      recordId: record.id,
      baseRevision: existing.record.revision,
      driveRevision: existing.record.revision,
      localVersion: record,
      detectedAt: new Date().toISOString(),
      deviceId: getDeviceId(),
    });
    throw new DriveCollectionConflictError(
      collection,
      record.id,
      existing.record.revision,
      existing.record.revision,
    );
  }

  const envelope = createRecordEnvelope(record, {
    entityType,
    revision: (existing?.record.revision ?? 0) + 1,
    createdAt: existing?.record.createdAt ?? (record as any).createdAt,
    baseRevision: existing?.record.revision,
  });

  try {
    await withTokenRefreshRetry(() =>
      backend.writePartitions(upsertRecord(partitions, collection, envelope)),
    );
  } catch (err) {
    const reason = classifyRecoverableFailure(err);
    if (reason) {
      enqueuePendingChange(collection, uid, {
        recordId: record.id,
        op,
        record,
        baseRevision: existing?.record.revision ?? baseRevision,
        queuedAt: new Date().toISOString(),
      });
      return { persisted: false, pending: true, pendingReason: reason };
    }
    throw err;
  }

  await publishSignal(
    uid,
    {
      entityType,
      recordId: record.id,
      revision: envelope.revision,
      updatedAt: envelope.updatedAt,
      op,
    },
    signalBackend,
  );

  return { persisted: true, pending: false, revision: envelope.revision };
}


export async function deleteCollectionRecord<T extends PilotRecord>(
  collection: string,
  entityType: string,
  uid: string,
  recordId: string,
  baseRevision?: number,
  backend: CollectionPartitionBackend<T> = createDrivePartitionBackend<T>(collection),
  signalBackend: CollectionSignalBackend = createFirestoreSignalBackend(uid),
): Promise<CollectionPersistResult> {
  let partitions: DrivePartition<T>[];
  let existing: { record: DriveRecordEnvelope<T> } | null;

  try {
    partitions = await withTokenRefreshRetry(() => backend.readPartitions());
    existing = findRecord(partitions, recordId);
  } catch (err) {
    const reason = classifyRecoverableFailure(err);
    if (reason) {
      enqueuePendingChange(collection, uid, {
        recordId,
        op: 'delete',
        baseRevision,
        queuedAt: new Date().toISOString(),
      });
      return { persisted: false, pending: true, pendingReason: reason };
    }
    throw err;
  }

  // Idempotent: already gone / already tombstoned.
  if (!existing || existing.record.deletedAt) {
    await publishSignal(
      uid,
      {
        entityType,
        recordId,
        revision: baseRevision ?? 0,
        updatedAt: new Date().toISOString(),
        op: 'delete',
      },
      signalBackend,
    );
    return { persisted: true, pending: false };
  }

  if (baseRevision !== undefined && existing.record.revision !== baseRevision) {
    // Changed elsewhere — do not delete a modified record silently.
    enqueuePendingChange(collection, uid, {
      recordId,
      op: 'delete',
      baseRevision,
      queuedAt: new Date().toISOString(),
    });
    return { persisted: false, pending: true };
  }

  try {
    await withTokenRefreshRetry(() =>
      backend.writePartitions(tombstoneRecord(partitions, recordId, getDeviceId())),
    );
  } catch (err) {
    const reason = classifyRecoverableFailure(err);
    if (reason) {
      enqueuePendingChange(collection, uid, {
        recordId,
        op: 'delete',
        baseRevision: existing.record.revision,
        queuedAt: new Date().toISOString(),
      });
      return { persisted: false, pending: true, pendingReason: reason };
    }
    throw err;
  }

  await publishSignal(
    uid,
    {
      entityType,
      recordId,
      revision: existing.record.revision + 1,
      updatedAt: new Date().toISOString(),
      op: 'delete',
    },
    signalBackend,
  );

  return { persisted: true, pending: false };
}

// ---------------------------------------------------------------------------
// Minimal Firestore sync signals + reconciliation
// ---------------------------------------------------------------------------

async function publishSignal(
  uid: string,
  signal: CollectionSyncSignal,
  signalBackend: CollectionSignalBackend,
): Promise<void> {
  try {
    await signalBackend.publish(signal);
  } catch (err) {
    // Drive write already succeeded — queue the signal for reconciliation.
    console.warn('Sync signal publish failed, queued for reconciliation:', err);
    const pending = readQueue<{ signal: CollectionSyncSignal; queuedAt: string }>(
      signalQueueKey(uid),
    );
    pending.push({ signal, queuedAt: new Date().toISOString() });
    writeQueue(signalQueueKey(uid), pending);
  }
}

export async function reconcileCollectionSignals<T extends PilotRecord>(
  collection: string,
  entityType: string,
  uid: string,
  backend: CollectionPartitionBackend<T> = createDrivePartitionBackend<T>(collection),
  signalBackend: CollectionSignalBackend = createFirestoreSignalBackend(uid),
): Promise<number> {
  let published = 0;

  const queued = readQueue<{ signal: CollectionSyncSignal; queuedAt: string }>(
    signalQueueKey(uid),
  );
  const remaining: typeof queued = [];
  for (const item of queued) {
    try {
      await signalBackend.publish(item.signal);
      published++;
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(signalQueueKey(uid), remaining);

  const records = await loadCollectionRecordsFromDrive(collection, backend);
  for (const record of records) {
    try {
      const signal = await signalBackend.read(record.id);
      if (signal && signal.revision === record.revision) continue;
      await signalBackend.publish({
        entityType,
        recordId: record.id,
        revision: record.revision,
        updatedAt: record.updatedAt,
        op: record.deletedAt ? 'delete' : 'update',
      });
      published++;
    } catch (err) {
      console.warn('Signal reconciliation failed for', record.id, err);
    }
  }

  return published;
}


// ---------------------------------------------------------------------------
// Offline pending changes (idempotent retry)
// ---------------------------------------------------------------------------

export async function retryPendingCollectionChanges<T extends PilotRecord>(
  collection: string,
  entityType: string,
  uid: string,
  backend: CollectionPartitionBackend<T> = createDrivePartitionBackend<T>(collection),
  signalBackend: CollectionSignalBackend = createFirestoreSignalBackend(uid),
): Promise<number> {
  const pending = readQueue<PendingCollectionChange<T>>(queueKey(collection, uid));
  if (pending.length === 0) return 0;

  const remaining: PendingCollectionChange<T>[] = [];
  let applied = 0;

  for (const change of pending) {
    try {
      const partitions = await withTokenRefreshRetry(() => backend.readPartitions());
      const existing = findRecord(partitions, change.recordId);

      if (change.op === 'delete') {
        if (!existing || existing.record.deletedAt) continue;
        if (
          change.baseRevision !== undefined &&
          existing.record.revision !== change.baseRevision
        ) {
          remaining.push(change); // conflict — keep queued
          continue;
        }
        await backend.writePartitions(
          tombstoneRecord(partitions, change.recordId, getDeviceId()),
        );
        await publishSignal(
          uid,
          {
            entityType,
            recordId: change.recordId,
            revision: existing.record.revision + 1,
            updatedAt: new Date().toISOString(),
            op: 'delete',
          },
          signalBackend,
        );
        applied++;
        continue;
      }

      // create / update
      if (!change.record) continue;
      if (
        existing &&
        change.baseRevision !== undefined &&
        existing.record.revision > change.baseRevision
      ) {
        continue; // newer revision already landed — never roll back
      }
      if (
        change.op === 'create' &&
        existing &&
        !existing.record.deletedAt &&
        JSON.stringify(existing.record.payload) === JSON.stringify(change.record)
      ) {
        continue; // idempotent duplicate-create
      }
      const envelope = createRecordEnvelope(change.record, {
        entityType,
        revision: (existing?.record.revision ?? 0) + 1,
        createdAt: existing?.record.createdAt ?? (change.record as any).createdAt,
        baseRevision: existing?.record.revision,
      });
      await backend.writePartitions(upsertRecord(partitions, collection, envelope));
      await publishSignal(
        uid,
        {
          entityType,
          recordId: change.recordId,
          revision: envelope.revision,
          updatedAt: envelope.updatedAt,
          op: existing ? 'update' : 'create',
        },
        signalBackend,
      );
      applied++;
    } catch (err) {
      if (classifyRecoverableFailure(err)) {
        remaining.push(change);
      } else {
        console.warn('Pending collection change failed permanently:', change.recordId, err);
      }
    }
  }

  writeQueue(queueKey(collection, uid), remaining);
  return applied;
}

// ---------------------------------------------------------------------------
// Pilot gate (shared with the task pilot's opt-in)
// ---------------------------------------------------------------------------

/** Drive is the authoritative store for this collection when the account is piloted. */
export function isCollectionPilotActive(uid: string | null | undefined): boolean {
  return Boolean(uid) && isDrivePilotEnabled(uid);
}

