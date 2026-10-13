/**
 * Task pilot service — the bounded, explicitly-enabled
 * pilot that routes TASK-ONLY storage to the signed-in
 * user's own Google Drive.
 *
 * Safety properties:
 *  - Off for every account unless explicitly enabled
 *    (isDrivePilotEnabled). The opt-in — NOT the transient
 *    Drive connection state — decides whether Drive is the
 *    authoritative task store. A pilot account keeps Drive as
 *    its authoritative store even when offline or unauthed:
 *    writes are preserved in the per-uid queue and retried,
 *    and are NEVER silently redirected to Firestore.
 *  - Revision-checked writes: a stale baseRevision
 *    blocks the write and preserves the rejected
 *    version in _system/conflicts/ — never a silent
 *    last-write-wins overwrite.
 *  - Offline / auth failures are queued per-uid and
 *    retried idempotently.
 *  - After every successful Drive write a MINIMAL sync
 *    signal (identifiers and revisions only, no task
 *    content) is published to Firestore; a failed
 *    signal is reconciled later.
 *  - Firestore remains authoritative for non-pilot
 *    accounts and for every other collection.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Task } from '../types';
import {
  DrivePartition,
  DriveRecordEnvelope,
  createRecordEnvelope,
  getDeviceId,
} from '../types/driveStorage';
import { driveService } from './driveService';
import { isDrivePilotEnabled } from './storageInterface';
import { findRecord, tombstoneRecord, upsertRecord } from './drivePartition';
import { DriveNetworkError, DriveAuthError, DrivePermissionError } from '../lib/driveApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskOperation = 'create' | 'update' | 'delete';

/** Minimal Firestore sync signal — identifiers and revisions only. */
export interface TaskSyncSignal {
  entityType: 'task';
  recordId: string;
  revision: number;
  updatedAt: string;
  op: TaskOperation;
}

/** A rejected version preserved for manual recovery. */
export interface TaskConflictRecord {
  taskId: string;
  baseRevision: number;
  driveRevision: number;
  localVersion: Task;
  detectedAt: string;
  deviceId: string;
}

export interface PendingTaskChange {
  taskId: string;
  op: TaskOperation;
  task?: Task;
  /** The Drive revision the change was based on. */
  baseRevision?: number;
  queuedAt: string;
}

export interface PendingSyncSignal {
  signal: TaskSyncSignal;
  queuedAt: string;
}

/**
 * Why a task change is not yet on Drive. `persisted === false` with a
 * reason means the change is safely queued locally and Drive remains
 * the authoritative store — the task is NEVER redirected to Firestore.
 */
export type TaskPilotPendingReason =
  /** Temporary network failure — retried automatically when back online. */
  | 'offline'
  /** Access token expired — a silent refresh is attempted; may self-heal. */
  | 'token-expired'
  /** Authorization revoked/disconnected — the user must reconnect Drive. */
  | 'needs-reconnect';

export interface TaskPilotPersistResult {
  persisted: boolean;
  pending: boolean;
  revision?: number;
  /** Present when `pending` is true — drives the accurate status message. */
  pendingReason?: TaskPilotPendingReason;
}

/**
 * Raised when the Drive record moved on since the
 * client read it. The conflicting write is blocked;
 * the local version is preserved in the conflicts
 * folder for manual recovery.
 */
export class DriveTaskConflictError extends Error {
  taskId: string;
  baseRevision: number;
  driveRevision: number;

  constructor(taskId: string, baseRevision: number, driveRevision: number) {
    super(
      `Task "${taskId}" was changed on another device (Drive revision ${driveRevision}; your edit was based on ${baseRevision}). Your version was kept in the Google Drive conflicts folder — reload to see the latest.`,
    );
    this.name = 'DriveTaskConflictError';
    this.taskId = taskId;
    this.baseRevision = baseRevision;
    this.driveRevision = driveRevision;
  }
}

// ---------------------------------------------------------------------------
// Backends (injectable for tests)
// ---------------------------------------------------------------------------

export interface TaskPartitionBackend {
  readPartitions(): Promise<DrivePartition<Task>[]>;
  writePartitions(partitions: DrivePartition<Task>[]): Promise<void>;
  preserveConflict(conflict: TaskConflictRecord): Promise<void>;
}

export interface SyncSignalBackend {
  publish(signal: TaskSyncSignal): Promise<void>;
  read(recordId: string): Promise<TaskSyncSignal | null>;
}

/** Firestore sync-signal backend: minimal metadata only. */
export function createFirestoreSignalBackend(uid: string): SyncSignalBackend {
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
      return snap.exists() ? (snap.data() as TaskSyncSignal) : null;
    },
  };
}

/** The real partition backend over the authorized Drive connection. */
export function createDrivePartitionBackend(): TaskPartitionBackend {
  return {
    async readPartitions() {
      const files = await driveService.listPartitionFiles('tasks');
      const partitions: DrivePartition<Task>[] = [];
      for (const file of files) {
        partitions.push(
          (await driveService.readPartition('tasks', file.id)) as DrivePartition<Task>,
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
      const name = `task-${conflict.taskId}-${Date.now()}.json`;
      await driveService.writeFileToFolder('_system/conflicts', name, conflict);
    },
  };
}

// ---------------------------------------------------------------------------
// Per-uid pending queues (localStorage, idempotent)
// ---------------------------------------------------------------------------

const TASK_QUEUE_PREFIX = 'sschedule_drive_taskq_';
const SIGNAL_QUEUE_PREFIX = 'sschedule_drive_sigq_';

function readQueue<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

function writeQueue<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export function getPendingTaskChanges(uid: string): PendingTaskChange[] {
  return readQueue<PendingTaskChange>(TASK_QUEUE_PREFIX + uid);
}

export function getPendingSyncSignals(uid: string): PendingSyncSignal[] {
  return readQueue<PendingSyncSignal>(SIGNAL_QUEUE_PREFIX + uid);
}

function enqueuePendingChange(uid: string, change: PendingTaskChange): void {
  const pending = readQueue<PendingTaskChange>(TASK_QUEUE_PREFIX + uid);
  // One entry per task: a newer local change supersedes
  // an older queued one for the same task id.
  const filtered = pending.filter((c) => c.taskId !== change.taskId);
  filtered.push(change);
  writeQueue(TASK_QUEUE_PREFIX + uid, filtered);
}

// ---------------------------------------------------------------------------
// Pilot gate
// ---------------------------------------------------------------------------

/**
 * Whether Google Drive is the authoritative task store for this
 * account. This is decided by the explicit per-uid opt-in ONLY.
 *
 * The transient Drive connection state deliberately does NOT gate
 * this: a pilot account stays Drive-authoritative even when offline
 * or unauthenticated. Writes are then preserved in the per-uid queue
 * and retried — they are never redirected to Firestore, which would
 * create a divergent copy of the task data.
 */
export function isTaskPilotActive(uid: string | null | undefined): boolean {
  return Boolean(uid) && isDrivePilotEnabled(uid);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function loadTaskRecordsFromDrive(
  backend: TaskPartitionBackend = createDrivePartitionBackend(),
): Promise<DriveRecordEnvelope<Task>[]> {
  const partitions = await backend.readPartitions();
  return partitions.flatMap((p) => p.records);
}

export async function loadTasksFromDrive(
  backend: TaskPartitionBackend = createDrivePartitionBackend(),
): Promise<Task[]> {
  const records = await loadTaskRecordsFromDrive(backend);
  return records.filter((r) => !r.deletedAt).map((r) => r.payload);
}

// ---------------------------------------------------------------------------
// Writes (revision-checked, conflict-preserving)
// ---------------------------------------------------------------------------

function isNetworkError(err: unknown): boolean {
  return (
    err instanceof DriveNetworkError ||
    err instanceof TypeError ||
    (err instanceof Error && /network|offline|fetch/i.test(err.message))
  );
}

/**
 * True for expired/revoked Drive authorization (401, or a 403 whose
 * reason indicates the grant is gone). These are NOT network failures:
 * the change is still preserved in the per-uid queue, but the user must
 * reconnect (or the silent refresh must succeed) before it can land.
 * Crucially, an auth failure never redirects the write to Firestore.
 */
function isAuthError(err: unknown): boolean {
  if (err instanceof DriveAuthError) return true;
  if (err instanceof DrivePermissionError) {
    // 403 with these reasons means the authorization grant is gone
    // (revoked / not granted), as opposed to a transient file error.
    return (
      err.reason === 'authError' ||
      err.reason === 'insufficientPermissions' ||
      err.reason === 'forbidden' ||
      err.reason === undefined
    );
  }
  return (
    err instanceof Error &&
    /unauthorized|invalid_grant|invalid_token|reconnect|expired|401/i.test(
      err.message,
    )
  );
}

/**
 * Maps a Drive failure to the pending reason used for queueing and
 * status messaging, or null when the error is neither offline nor an
 * auth problem (e.g. quota exceeded, corrupted partition) and should
 * therefore surface to the caller unchanged.
 */
function classifyRecoverableFailure(err: unknown): TaskPilotPendingReason | null {
  if (isNetworkError(err)) return 'offline';
  if (isAuthError(err)) return 'needs-reconnect';
  return null;
}

/**
 * Attempts one silent token refresh, then retries the operation once.
 * Used so an expired access token self-heals without a user-visible
 * failure. If the refresh itself fails, the original error is returned
 * and the caller queues the change / prompts for reconnection.
 */
async function withTokenRefreshRetry<T>(
  op: () => Promise<T>,
): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (!isAuthError(err)) throw err;
    try {
      const { requestDriveToken } = await import('../lib/googleDrive');
      await requestDriveToken({ silent: true });
    } catch {
      // Silent refresh unavailable (redirect/popup required or no
      // network). Fall through to surface the original auth error.
    }
    // Retry once with the refreshed token; if it still fails, let the
    // final error propagate so the caller can queue / prompt.
    return op();
  }
}

export async function persistTaskChange(
  uid: string,
  task: Task,
  op: TaskOperation,
  baseRevision?: number,
  backend: TaskPartitionBackend = createDrivePartitionBackend(),
  signalBackend: SyncSignalBackend = createFirestoreSignalBackend(uid),
): Promise<TaskPilotPersistResult> {
  let partitions: DrivePartition<Task>[];
  let existing: { record: DriveRecordEnvelope<Task> } | null;

  try {
    partitions = await withTokenRefreshRetry(() => backend.readPartitions());
    existing = findRecord(partitions, task.id);
  } catch (err) {
    const reason = classifyRecoverableFailure(err);
    if (reason) {
      // Offline OR auth failure: preserve the change in the per-uid
      // queue. Drive stays authoritative — never redirect to Firestore.
      enqueuePendingChange(uid, {
        taskId: task.id,
        op,
        task,
        baseRevision,
        queuedAt: new Date().toISOString(),
      });
      return { persisted: false, pending: true, pendingReason: reason };
    }
    throw err;
  }

  // A revision mismatch means another device wrote since the
  // client read the task. Block the write and preserve both
  // versions — never a silent overwrite.
  if (existing && baseRevision !== undefined && existing.record.revision !== baseRevision) {
    await backend.preserveConflict({
      taskId: task.id,
      baseRevision,
      driveRevision: existing.record.revision,
      localVersion: task,
      detectedAt: new Date().toISOString(),
      deviceId: getDeviceId(),
    });
    throw new DriveTaskConflictError(task.id, baseRevision, existing.record.revision);
  }

  // Idempotent duplicate-create guard: if the record already exists
  // live on Drive and this "create" carries identical content (a
  // retried operation), report success without bumping the revision.
  // A create with DIFFERENT content for an existing live id is a
  // conflict — preserve it and block, never silently overwrite.
  if (op === 'create' && existing && !existing.record.deletedAt && baseRevision === undefined) {
    if (JSON.stringify(existing.record.payload) === JSON.stringify(task)) {
      return { persisted: true, pending: false, revision: existing.record.revision };
    }
    await backend.preserveConflict({
      taskId: task.id,
      baseRevision: existing.record.revision,
      driveRevision: existing.record.revision,
      localVersion: task,
      detectedAt: new Date().toISOString(),
      deviceId: getDeviceId(),
    });
    throw new DriveTaskConflictError(task.id, existing.record.revision, existing.record.revision);
  }

  const envelope = createRecordEnvelope(task, {
    entityType: 'task',
    revision: (existing?.record.revision ?? 0) + 1,
    createdAt: existing?.record.createdAt ?? task.createdAt,
    baseRevision: existing?.record.revision,
  });

  try {
    await withTokenRefreshRetry(() =>
      backend.writePartitions(upsertRecord(partitions, 'tasks', envelope)),
    );
  } catch (err) {
    const reason = classifyRecoverableFailure(err);
    if (reason) {
      // The write did not land. Preserve it in the per-uid queue with
      // the Drive revision it was based on, so a retry re-checks the
      // base revision and never overwrites a newer remote record.
      enqueuePendingChange(uid, {
        taskId: task.id,
        op,
        task,
        baseRevision: existing?.record.revision ?? baseRevision,
        queuedAt: new Date().toISOString(),
      });
      return { persisted: false, pending: true, pendingReason: reason };
    }
    throw err;
  }

  await publishSyncSignal(
    uid,
    {
      entityType: 'task',
      recordId: task.id,
      revision: envelope.revision,
      updatedAt: envelope.updatedAt,
      op,
    },
    signalBackend,
  );

  return { persisted: true, pending: false, revision: envelope.revision };
}

export async function deleteTaskOnDrive(
  uid: string,
  taskId: string,
  baseRevision?: number,
  backend: TaskPartitionBackend = createDrivePartitionBackend(),
  signalBackend: SyncSignalBackend = createFirestoreSignalBackend(uid),
): Promise<TaskPilotPersistResult> {
  let partitions: DrivePartition<Task>[];
  let existing: { record: DriveRecordEnvelope<Task> } | null;

  try {
    partitions = await withTokenRefreshRetry(() => backend.readPartitions());
    existing = findRecord(partitions, taskId);
  } catch (err) {
    const reason = classifyRecoverableFailure(err);
    if (reason) {
      // Offline OR auth failure: keep the deletion queued per-uid. Drive
      // stays authoritative — never mirror the delete into Firestore.
      enqueuePendingChange(uid, {
        taskId,
        op: 'delete',
        baseRevision,
        queuedAt: new Date().toISOString(),
      });
      return { persisted: false, pending: true, pendingReason: reason };
    }
    throw err;
  }

  // Idempotent: already gone from Drive — nothing to tombstone.
  // (Covers both a record that never existed and one that is
  // already a tombstone from an earlier delete.)
  if (!existing || existing.record.deletedAt) {
    await publishSyncSignal(
      uid,
      {
        entityType: 'task',
        recordId: taskId,
        revision: baseRevision ?? 0,
        updatedAt: new Date().toISOString(),
        op: 'delete',
      },
      signalBackend,
    );
    return { persisted: true, pending: false };
  }

  if (baseRevision !== undefined && existing.record.revision !== baseRevision) {
    // The task changed elsewhere since it was read. Do not delete
    // a modified task silently — keep the change queued.
    enqueuePendingChange(uid, {
      taskId,
      op: 'delete',
      baseRevision,
      queuedAt: new Date().toISOString(),
    });
    return { persisted: false, pending: true };
  }

  try {
    await withTokenRefreshRetry(() =>
      backend.writePartitions(tombstoneRecord(partitions, taskId, getDeviceId())),
    );
  } catch (err) {
    const reason = classifyRecoverableFailure(err);
    if (reason) {
      enqueuePendingChange(uid, {
        taskId,
        op: 'delete',
        baseRevision: existing.record.revision,
        queuedAt: new Date().toISOString(),
      });
      return { persisted: false, pending: true, pendingReason: reason };
    }
    throw err;
  }

  await publishSyncSignal(
    uid,
    {
      entityType: 'task',
      recordId: taskId,
      revision: existing.record.revision + 1,
      updatedAt: new Date().toISOString(),
      op: 'delete',
    },
    signalBackend,
  );

  return { persisted: true, pending: false };
}

// ---------------------------------------------------------------------------
// Minimal Firestore sync signals
// ---------------------------------------------------------------------------

async function publishSyncSignal(
  uid: string,
  signal: TaskSyncSignal,
  signalBackend: SyncSignalBackend,
): Promise<void> {
  try {
    await signalBackend.publish(signal);
  } catch (err) {
    // The Drive write already succeeded — queue the signal so a
    // reconciliation pass can re-publish it without duplicating
    // the task record.
    console.warn('Sync signal publish failed, queued for reconciliation:', err);
    const pending = readQueue<PendingSyncSignal>(SIGNAL_QUEUE_PREFIX + uid);
    pending.push({ signal, queuedAt: new Date().toISOString() });
    writeQueue(SIGNAL_QUEUE_PREFIX + uid, pending);
  }
}

/**
 * Reconciliation: re-publishes every queued signal and verifies
 * each Drive record's revision has a matching signal in
 * Firestore. Idempotent — signals are keyed by task id and
 * carry the revision they describe.
 */
export async function reconcileSyncSignals(
  uid: string,
  backend: TaskPartitionBackend = createDrivePartitionBackend(),
  signalBackend: SyncSignalBackend = createFirestoreSignalBackend(uid),
): Promise<number> {
  let published = 0;

  const queued = readQueue<PendingSyncSignal>(SIGNAL_QUEUE_PREFIX + uid);
  const remaining: PendingSyncSignal[] = [];
  for (const item of queued) {
    try {
      await signalBackend.publish(item.signal);
      published++;
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(SIGNAL_QUEUE_PREFIX + uid, remaining);

  const records = await loadTaskRecordsFromDrive(backend);
  for (const record of records) {
    try {
      const signal = await signalBackend.read(record.id);
      if (signal && signal.revision === record.revision) continue;
      await signalBackend.publish({
        entityType: 'task',
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

/**
 * Retries queued changes against the current Drive state.
 *
 * Idempotency: an update is skipped when Drive already holds a
 * newer revision than the queued change was based on (the write
 * landed, or another device moved on); a delete is skipped when
 * the record is already gone. A delete that no longer matches
 * the Drive revision stays queued — the conflicting version must
 * be resolved by a person, not by a silent overwrite.
 */
export async function retryPendingTaskChanges(
  uid: string,
  backend: TaskPartitionBackend = createDrivePartitionBackend(),
  signalBackend: SyncSignalBackend = createFirestoreSignalBackend(uid),
): Promise<number> {
  const pending = readQueue<PendingTaskChange>(TASK_QUEUE_PREFIX + uid);
  if (pending.length === 0) return 0;

  const remaining: PendingTaskChange[] = [];
  let applied = 0;

  for (const change of pending) {
    try {
      const partitions = await withTokenRefreshRetry(() => backend.readPartitions());
      const existing = findRecord(partitions, change.taskId);

      if (change.op === 'delete') {
        // Idempotent: already gone from Drive (never existed, or
        // already tombstoned) — nothing left to do.
        if (!existing || existing.record.deletedAt) continue;
        if (
          change.baseRevision !== undefined &&
          existing.record.revision !== change.baseRevision
        ) {
          remaining.push(change); // conflict — keep queued
          continue;
        }
        await backend.writePartitions(
          tombstoneRecord(partitions, change.taskId, getDeviceId()),
        );
        await publishSyncSignal(
          uid,
          {
            entityType: 'task',
            recordId: change.taskId,
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
      if (!change.task) continue;
      if (
        existing &&
        change.baseRevision !== undefined &&
        existing.record.revision > change.baseRevision
      ) {
        // A newer revision already landed (ours or another
        // device's) — never roll it back.
        continue;
      }
      // Idempotent duplicate-create: the queued create re-applies
      // content identical to what Drive already holds — skip it.
      if (
        change.op === 'create' &&
        existing &&
        !existing.record.deletedAt &&
        JSON.stringify(existing.record.payload) === JSON.stringify(change.task)
      ) {
        continue;
      }
      const envelope = createRecordEnvelope(change.task, {
        entityType: 'task',
        revision: (existing?.record.revision ?? 0) + 1,
        createdAt: existing?.record.createdAt ?? change.task.createdAt,
        baseRevision: existing?.record.revision,
      });
      await backend.writePartitions(upsertRecord(partitions, 'tasks', envelope));
      await publishSyncSignal(
        uid,
        {
          entityType: 'task',
          recordId: change.taskId,
          revision: envelope.revision,
          updatedAt: envelope.updatedAt,
          op: existing ? 'update' : 'create',
        },
        signalBackend,
      );
      applied++;
    } catch (err) {
      if (classifyRecoverableFailure(err)) {
        // Offline or auth failure: keep the change queued for the next
        // reconnect/retry. It is never discarded and never redirected
        // to Firestore.
        remaining.push(change);
      } else {
        console.warn('Pending task change failed permanently:', change.taskId, err);
      }
    }
  }

  writeQueue(TASK_QUEUE_PREFIX + uid, remaining);
  return applied;
}
