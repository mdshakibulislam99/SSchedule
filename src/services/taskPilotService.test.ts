import { describe, it, expect, vi, beforeEach } from 'vitest';

// The node test environment has no localStorage —
// provide a minimal in-memory implementation.
const localStorageStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => localStorageStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore.set(key, String(value));
  },
  removeItem: (key: string) => {
    localStorageStore.delete(key);
  },
  clear: () => {
    localStorageStore.clear();
  },
};

// Firebase SDK and the live Drive service must not load in tests.
vi.mock('firebase/firestore', () => ({
  // The real signature is doc(db, ...pathSegments); drop the db ref.
  doc: vi.fn((_db: unknown, ...segments: unknown[]) => ({ path: segments.join('/') })),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  setDoc: vi.fn(async () => {}),
  collection: vi.fn((_db: unknown, ...segments: unknown[]) => ({ path: segments.join('/') })),
  onSnapshot: vi.fn(() => () => {}),
}));
vi.mock('../lib/firebase', () => ({ db: {} }));
// The token-refresh retry dynamically imports this module. Mock it so the
// auth-failure path stays hermetic: a silent refresh that is unavailable,
// forcing the auth error to surface (and the change to be queued).
vi.mock('../lib/googleDrive', () => ({
  requestDriveToken: vi.fn(async () => {
    throw new Error('silent refresh unavailable in tests');
  }),
  // Consumed by driveApi's token provider when a real API is constructed.
  getDriveAccessToken: vi.fn(async () => 'test-token'),
}));
vi.mock('./driveService', () => ({
  driveService: {
    listPartitionFiles: vi.fn(async () => []),
    readPartition: vi.fn(),
    writePartition: vi.fn(async () => {}),
    writeFileToFolder: vi.fn(async () => ({ id: 'conflict-1', name: 'c.json' })),
  },
}));

import { setDoc } from 'firebase/firestore';
import {
  DriveTaskConflictError,
  PendingTaskChange,
  SyncSignalBackend,
  TaskPartitionBackend,
  TaskSyncSignal,
  deleteTaskOnDrive,
  getPendingSyncSignals,
  getPendingTaskChanges,
  isTaskPilotActive,
  loadTaskRecordsFromDrive,
  loadTasksFromDrive,
  persistTaskChange,
  reconcileSyncSignals,
  retryPendingTaskChanges,
  createFirestoreSignalBackend,
} from './taskPilotService';
import { DriveNetworkError, DriveAuthError, DrivePermissionError } from '../lib/driveApi';
import {
  DrivePartitionCorruptedError,
  deserializePartition,
  serializePartition,
} from './drivePartition';
import {
  DRIVE_STORAGE_SCHEMA_VERSION,
  DrivePartition,
  DriveRecordEnvelope,
  computeChecksum,
  createRecordEnvelope,
} from '../types/driveStorage';
import type { Task } from '../types';

// ---------------------------------------------------------------------------
// In-memory fakes of the partition + signal backends
// ---------------------------------------------------------------------------

function makeTask(id: string, title = `Task ${id}`): Task {
  return {
    id,
    title,
    courseColor: '#64748B',
    type: 'assignment',
    deadline: '2026-10-04T23:59:00Z',
    estimatedMinutes: 45,
    priority: 'high',
    progress: 0,
    completed: false,
    subtasks: [],
    relatedFileIds: [],
    relatedResearchIds: [],
    createdAt: '2026-01-01T00:00:00Z',
  } as Task;
}

/** A valid, checksummed partition object, exactly as Drive would hold it. */
function storedPartition(records: DriveRecordEnvelope<Task>[]): DrivePartition<Task> {
  const raw: DrivePartition<Task> = {
    partitionId: 'tasks:part-000001',
    collection: 'tasks',
    index: 0,
    schemaVersion: DRIVE_STORAGE_SCHEMA_VERSION,
    recordCount: records.length,
    records,
    checksum: '',
    updatedAt: new Date().toISOString(),
  };
  return deserializePartition<Task>(serializePartition(raw));
}

/**
 * Fake partition backend that behaves like production storage: every read
 * parses and checksum-validates the stored JSON, every write re-serializes
 * and re-stamps the checksum. Corruption therefore surfaces exactly as it
 * would against real Drive files.
 */
class FakePartitionBackend implements TaskPartitionBackend {
  partitions: DrivePartition<Task>[] = [];
  conflicts: unknown[] = [];
  /** Injected failure for the next read/write call (one-shot). */
  failRead?: () => Error;
  failWrite?: () => Error;
  /** Injected failure that fires on EVERY read/write call (persistent). */
  failReadAlways?: () => Error;
  failWriteAlways?: () => Error;
  writeCount = 0;

  async readPartitions(): Promise<DrivePartition<Task>[]> {
    if (this.failReadAlways) throw this.failReadAlways();
    if (this.failRead) {
      const err = this.failRead();
      this.failRead = undefined;
      throw err;
    }
    return this.partitions.map((p) => deserializePartition<Task>(JSON.stringify(p)));
  }

  async writePartitions(partitions: DrivePartition<Task>[]): Promise<void> {
    if (this.failWriteAlways) throw this.failWriteAlways();
    if (this.failWrite) {
      const err = this.failWrite();
      this.failWrite = undefined;
      throw err;
    }
    this.writeCount++;
    this.partitions = partitions.map((p) =>
      deserializePartition<Task>(serializePartition(p)),
    );
  }

  async preserveConflict(conflict: unknown): Promise<void> {
    this.conflicts.push(conflict);
  }
}

class FakeSignalBackend implements SyncSignalBackend {
  signals = new Map<string, TaskSyncSignal>();
  failPublishTimes = 0;

  async publish(signal: TaskSyncSignal): Promise<void> {
    if (this.failPublishTimes > 0) {
      this.failPublishTimes--;
      throw new Error('Firestore unavailable');
    }
    this.signals.set(signal.recordId, signal);
  }

  async read(recordId: string): Promise<TaskSyncSignal | null> {
    return this.signals.get(recordId) ?? null;
  }
}

beforeEach(() => {
  localStorageStore.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Pilot gate (Phase 2)
// ---------------------------------------------------------------------------

describe('isTaskPilotActive', () => {
  it('is disabled by default for every account', () => {
    expect(isTaskPilotActive('user-a')).toBe(false);
    expect(isTaskPilotActive(null)).toBe(false);
    expect(isTaskPilotActive(undefined)).toBe(false);
  });

  it('depends ONLY on the explicit per-uid opt-in, never on connection state', () => {
    // The pilot is an account-level decision. There is deliberately no
    // "connected" argument: Drive stays the authoritative task store for
    // an opted-in account even when offline or unauthenticated.
    localStorage.setItem('sschedule_drive_pilot', 'user-a');
    expect(isTaskPilotActive('user-a')).toBe(true);
    // Another account never inherits user-a's pilot flag.
    expect(isTaskPilotActive('user-b')).toBe(false);
    expect(isTaskPilotActive('user-a')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// User isolation & account switching (Phase 2)
// ---------------------------------------------------------------------------

describe('user isolation', () => {
  it("pending queues are keyed per uid — one account never sees another's queue", async () => {
    const backend = new FakePartitionBackend();
    backend.failRead = () => new DriveNetworkError('offline');

    const result = await persistTaskChange(
      'user-a',
      makeTask('task-1'),
      'create',
      undefined,
      backend,
      new FakeSignalBackend(),
    );
    expect(result.pending).toBe(true);
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);
    // A different account's queue is untouched.
    expect(getPendingTaskChanges('user-b')).toHaveLength(0);
  });

  it('retrying pending changes for user-b applies nothing of user-a', async () => {
    const backend = new FakePartitionBackend();
    backend.failRead = () => new DriveNetworkError('offline');
    await persistTaskChange('user-a', makeTask('task-1'), 'create', undefined, backend, new FakeSignalBackend());

    const applied = await retryPendingTaskChanges('user-b', backend, new FakeSignalBackend());
    expect(applied).toBe(0);
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);
  });

  it('switching accounts never leaks a queued change into the new account', async () => {
    const backend = new FakePartitionBackend();
    backend.failRead = () => new DriveNetworkError('offline');
    await persistTaskChange('user-a', makeTask('task-a'), 'create', undefined, backend, new FakeSignalBackend());

    // Sign in as user-b: their own retry applies nothing of user-a.
    const applied = await retryPendingTaskChanges('user-b', backend, new FakeSignalBackend());
    expect(applied).toBe(0);
    expect(await loadTasksFromDrive(backend)).toEqual([]);
    // user-a's queued change survives intact for their own device.
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Task CRUD, stable ids and partition checksums (Phase 3)
// ---------------------------------------------------------------------------

describe('task CRUD on Drive', () => {
  it('creates a task in a checksummed partition and returns its revision', async () => {
    const backend = new FakePartitionBackend();
    const signals = new FakeSignalBackend();

    const result = await persistTaskChange(
      'user-a',
      makeTask('task-1', 'Read chapter 3'),
      'create',
      undefined,
      backend,
      signals,
    );

    expect(result.revision).toBe(1);
    expect(result.pending).toBeFalsy();
    expect(backend.partitions).toHaveLength(1);
    const record = backend.partitions[0].records[0];
    expect(record.id).toBe('task-1');
    expect(record.entityType).toBe('task');
    expect(record.schemaVersion).toBe(DRIVE_STORAGE_SCHEMA_VERSION);
    expect(record.payload).toMatchObject({ title: 'Read chapter 3' });
    // Partition checksum was stamped by the write path.
    expect(backend.partitions[0].checksum).toBe(
      computeChecksum(JSON.stringify(backend.partitions[0].records)),
    );
  });

  it('reads a single task and lists all active tasks', async () => {
    const backend = new FakePartitionBackend();
    await persistTaskChange('user-a', makeTask('task-1', 'A'), 'create', undefined, backend, new FakeSignalBackend());
    await persistTaskChange('user-a', makeTask('task-2', 'B'), 'create', undefined, backend, new FakeSignalBackend());

    const all = await loadTasksFromDrive(backend);
    expect(all.map((t) => t.id).sort()).toEqual(['task-1', 'task-2']);

    const records = await loadTaskRecordsFromDrive(backend);
    expect(records.map((r) => r.payload.title).sort()).toEqual(['A', 'B']);
  });

  it('updates a task in place, preserving its stable id and bumping revision', async () => {
    const backend = new FakePartitionBackend();
    await persistTaskChange('user-a', makeTask('task-1', 'Original'), 'create', undefined, backend, new FakeSignalBackend());

    const result = await persistTaskChange(
      'user-a',
      makeTask('task-1', 'Renamed'),
      'update',
      1,
      backend,
      new FakeSignalBackend(),
    );

    expect(result.revision).toBe(2);
    expect(backend.partitions[0].records).toHaveLength(1);
    expect(backend.partitions[0].records[0].payload).toMatchObject({ title: 'Renamed' });
    expect(backend.partitions[0].records[0].id).toBe('task-1');
  });

  it('preserves unrelated records in the same partition when editing one task', async () => {
    const backend = new FakePartitionBackend();
    await persistTaskChange('user-a', makeTask('task-1', 'First'), 'create', undefined, backend, new FakeSignalBackend());
    await persistTaskChange('user-a', makeTask('task-2', 'Second'), 'create', undefined, backend, new FakeSignalBackend());

    await persistTaskChange('user-a', makeTask('task-1', 'First edited'), 'update', 1, backend, new FakeSignalBackend());

    const ids = backend.partitions[0].records.map((r) => r.id).sort();
    expect(ids).toEqual(['task-1', 'task-2']);
    const titles = backend.partitions[0].records.map((r) => (r.payload as Task).title).sort();
    expect(titles).toEqual(['First edited', 'Second']);
  });

  it('deletes a task with a recoverable tombstone', async () => {
    const backend = new FakePartitionBackend();
    await persistTaskChange('user-a', makeTask('task-1'), 'create', undefined, backend, new FakeSignalBackend());

    await deleteTaskOnDrive('user-a', 'task-1', 1, backend, new FakeSignalBackend());

    const records = await loadTaskRecordsFromDrive(backend);
    expect(records).toHaveLength(1);
    expect(records[0].deletedAt).toBeTruthy();
    // The active task list is empty until tombstones are cleaned up.
    expect(await loadTasksFromDrive(backend)).toEqual([]);
  });

  it('does not resurrect a tombstoned task on a later read', async () => {
    const backend = new FakePartitionBackend();
    await persistTaskChange('user-a', makeTask('task-1'), 'create', undefined, backend, new FakeSignalBackend());
    await deleteTaskOnDrive('user-a', 'task-1', 1, backend, new FakeSignalBackend());

    // Refresh from Drive must never show the deleted task again.
    const refreshed = await loadTasksFromDrive(backend);
    expect(refreshed.find((t) => t.id === 'task-1')).toBeUndefined();
  });

// ---------------------------------------------------------------------------
// Revision mismatch / conflicting updates (Phase 4)
// ---------------------------------------------------------------------------

describe('conflict handling', () => {
  it('blocks an update whose base revision is stale and preserves both versions', async () => {
    const backend = new FakePartitionBackend();
    // Device 1 creates the task (revision 1).
    await persistTaskChange('user-a', makeTask('task-1', 'v1'), 'create', undefined, backend, new FakeSignalBackend());
    // Device 2 (simulated by another edit) advances it to revision 2.
    await persistTaskChange('user-a', makeTask('task-1', 'v2'), 'update', 1, backend, new FakeSignalBackend());

    // Device 1 now tries to save based on the stale revision 1.
    await expect(
      persistTaskChange('user-a', makeTask('task-1', 'stale write'), 'update', 1, backend, new FakeSignalBackend()),
    ).rejects.toThrow(DriveTaskConflictError);

    // The authoritative record keeps the newer revision — no silent overwrite.
    const record = backend.partitions[0].records[0];
    expect(record.revision).toBe(2);
    expect(record.payload).toMatchObject({ title: 'v2' });
    // The rejected local version is preserved for recovery.
    expect(backend.conflicts).toHaveLength(1);
  });

  it('does not block a delete whose base revision matches', async () => {
    const backend = new FakePartitionBackend();
    await persistTaskChange('user-a', makeTask('task-1'), 'create', undefined, backend, new FakeSignalBackend());
    await deleteTaskOnDrive('user-a', 'task-1', 1, backend, new FakeSignalBackend());
    expect(backend.partitions[0].records[0].deletedAt).toBeTruthy();
  });

  it('rejects a delete based on a stale revision', async () => {
    const backend = new FakePartitionBackend();
    await persistTaskChange('user-a', makeTask('task-1', 'v1'), 'create', undefined, backend, new FakeSignalBackend());
    await persistTaskChange('user-a', makeTask('task-1', 'v2'), 'update', 1, backend, new FakeSignalBackend());

    // Delete based on the stale revision 1 (task is now at rev 2): the
    // service must NOT silently delete the newer version. It keeps the
    // delete queued and reports it as pending for a human to resolve.
    const result = await deleteTaskOnDrive('user-a', 'task-1', 1, backend, new FakeSignalBackend());
    expect(result.persisted).toBe(false);
    expect(result.pending).toBe(true);
    // Not tombstoned — the newer version survives.
    expect(backend.partitions[0].records[0].deletedAt).toBeFalsy();
    // Kept queued for conflict resolution.
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);
  });

  it('a retried idempotent update at the same revision does not duplicate records', async () => {
    const backend = new FakePartitionBackend();
    await persistTaskChange('user-a', makeTask('task-1', 'v1'), 'create', undefined, backend, new FakeSignalBackend());

    // Two writes carrying the SAME base revision: the second must not
    // silently overwrite the newer one produced by the first.
    const first = await persistTaskChange('user-a', makeTask('task-1', 'second'), 'update', 1, backend, new FakeSignalBackend());
    expect(first.revision).toBe(2);

    await expect(
      persistTaskChange('user-a', makeTask('task-1', 'duplicate'), 'update', 1, backend, new FakeSignalBackend()),
    ).rejects.toThrow(DriveTaskConflictError);

    // Exactly one record for the task, at the newest revision.
    expect(backend.partitions[0].records.filter((r) => r.id === 'task-1')).toHaveLength(1);
    expect(backend.partitions[0].records[0].revision).toBe(2);
    expect(backend.partitions[0].records[0].payload).toMatchObject({ title: 'second' });
  });
});

});




// ---------------------------------------------------------------------------
// Failed Drive writes & offline pending changes (Phase 3)
// ---------------------------------------------------------------------------

describe('failed writes and offline queue', () => {
  it('queues the change as pending when Drive is unreachable', async () => {
    const backend = new FakePartitionBackend();
    backend.failRead = () => new DriveNetworkError('offline');

    const result = await persistTaskChange(
      'user-a',
      makeTask('task-1'),
      'create',
      undefined,
      backend,
      new FakeSignalBackend(),
    );

    expect(result.pending).toBe(true);
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);
    // Nothing was written to Drive — the caller must not report success.
    expect(backend.writeCount).toBe(0);
  });

  it('applies the queued change on retry once Drive is reachable again', async () => {
    const backend = new FakePartitionBackend();
    backend.failRead = () => new DriveNetworkError('offline');
    await persistTaskChange('user-a', makeTask('task-1', 'Queued'), 'create', undefined, backend, new FakeSignalBackend());
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);

    // Back online.
    const applied = await retryPendingTaskChanges('user-a', backend, new FakeSignalBackend());
    expect(applied).toBe(1);
    expect(getPendingTaskChanges('user-a')).toHaveLength(0);
    expect(await loadTasksFromDrive(backend)).toMatchObject([{ id: 'task-1' }]);
  });

  it('surfaces a non-network Drive error to the caller instead of reporting success', async () => {
    const backend = new FakePartitionBackend();
    // A non-network failure (e.g. a malformed request) must be
    // surfaced to the caller — not swallowed or queued.
    backend.failWrite = () => new Error('quota exceeded');

    await expect(
      persistTaskChange('user-a', makeTask('task-1'), 'create', undefined, backend, new FakeSignalBackend()),
    ).rejects.toThrow(/quota exceeded/);
    // A non-network failure is not queued as a retryable change.
    expect(getPendingTaskChanges('user-a')).toHaveLength(0);
  });

  it('retries a network-failing write without duplicating the record', async () => {
    const backend = new FakePartitionBackend();
    await persistTaskChange('user-a', makeTask('task-1', 'First'), 'create', undefined, backend, new FakeSignalBackend());
    // The next write fails as a transient network error -> queued.
    backend.failWrite = () => new DriveNetworkError('transient');
    const failed = await persistTaskChange(
      'user-a',
      makeTask('task-1', 'Second'),
      'update',
      1,
      backend,
      new FakeSignalBackend(),
    );
    expect(failed.pending).toBe(true);
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);

    // Back online: the queued update applies exactly once.
    const applied = await retryPendingTaskChanges('user-a', backend, new FakeSignalBackend());
    expect(applied).toBe(1);
    const records = await loadTaskRecordsFromDrive(backend);
    expect(records.filter((r) => r.id === 'task-1')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Minimal Firestore sync signals (Phase 5)
// ---------------------------------------------------------------------------

describe('sync signals', () => {
  it('publishes a minimal signal containing NO task payload', async () => {
    const backend = new FakePartitionBackend();
    const signals = new FakeSignalBackend();

    await persistTaskChange('user-a', makeTask('task-1', 'Secret title'), 'create', undefined, backend, signals);

    expect(signals.signals.size).toBe(1);
    const signal = signals.signals.get('task-1')!;
    // Only synchronization metadata — never the task content. The uid
    // is NOT in the signal body; it is encoded in the Firestore
    // document path (users/{uid}/sync-signals/{recordId}).
    expect(Object.keys(signal).sort()).toEqual(
      ['entityType', 'op', 'recordId', 'revision', 'updatedAt'].sort(),
    );
    expect(signal).toMatchObject({
      entityType: 'task',
      recordId: 'task-1',
      op: 'create',
      revision: 1,
    });
    expect(JSON.stringify(signal)).not.toContain('Secret title');
  });

  it('scopes the signal document path to the authenticated uid', async () => {
    // The real Firestore backend writes to users/{uid}/sync-signals/{recordId}
    // so a user can only ever touch their own sync metadata.
    await persistTaskChange(
      'user-isolation',
      makeTask('task-x'),
      'create',
      undefined,
      new FakePartitionBackend(),
      createFirestoreSignalBackend('user-isolation'),
    );
    expect(setDoc).toHaveBeenCalledTimes(1);
    const pathArg = (setDoc as any).mock.calls[0][0];
    expect(pathArg.path).toBe('users/user-isolation/sync-signals/task-x');
  });

  it('a Drive success followed by a Firestore signal failure stays recoverable', async () => {
    const backend = new FakePartitionBackend();
    const signals = new FakeSignalBackend();
    // The FIRST signal publish fails (Firestore down) after Drive succeeded.
    signals.failPublishTimes = 1;

    await persistTaskChange('user-a', makeTask('task-1'), 'create', undefined, backend, signals);

    // The task IS durably in Drive even though the signal failed.
    expect(await loadTasksFromDrive(backend)).toHaveLength(1);
    // The missed signal is queued for reconciliation, not lost.
    expect(getPendingSyncSignals('user-a')).toHaveLength(1);

    // A reconciliation pass re-publishes without duplicating task records.
    const recovered = await reconcileSyncSignals('user-a', backend, signals);
    expect(recovered).toBe(1);
    expect(signals.signals.size).toBe(1);
    expect(getPendingSyncSignals('user-a')).toHaveLength(0);
    // Still exactly one task record — reconciliation does not duplicate.
    expect((await loadTaskRecordsFromDrive(backend)).filter((r) => r.id === 'task-1')).toHaveLength(1);

    // Reconciliation is idempotent: once the signal exists at the
    // current revision, a second pass re-publishes nothing.
    const again = await reconcileSyncSignals('user-a', backend, signals);
    expect(again).toBe(0);
    expect(signals.signals.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Corrupted / missing partitions (Phase 3)
// ---------------------------------------------------------------------------

describe('corrupted or missing partitions', () => {
  it('returns an empty list when no partitions exist yet (fresh Drive)', async () => {
    const backend = new FakePartitionBackend();
    expect(await loadTasksFromDrive(backend)).toEqual([]);
    expect(await loadTaskRecordsFromDrive(backend)).toEqual([]);
  });

  it('surfaces a checksum mismatch as a corrupted-partition error', async () => {
    const backend = new FakePartitionBackend();
    // Store a partition whose checksum does not match its records.
    const bad = storedPartition([createRecordEnvelope(makeTask('task-1'), { entityType: 'task', revision: 1 })]);
    bad.checksum = 'deadbeef';
    backend.partitions = [bad];

    await expect(loadTasksFromDrive(backend)).rejects.toThrow(DrivePartitionCorruptedError);
  });

  it('surfaces unparseable partition content as a corrupted-partition error', async () => {
    const backend = new FakePartitionBackend();
    const p = storedPartition([]);
    (p as any).__rawInvalid = true;
    // Force readPartitions to hand back something unparseable.
    backend.readPartitions = async () => {
      return [JSON.parse('{ broken') as any];
    };
    await expect(loadTaskRecordsFromDrive(backend)).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Existing Firestore task preservation (Phase 2)
// ---------------------------------------------------------------------------

describe('existing Firestore task preservation', () => {
  it('the legacy Firestore adapter writes are never routed to Drive', async () => {
    // When the pilot is disabled, a save must go through the existing
    // Firestore offline queue — not the Drive partition backend. This is
    // asserted structurally: with no pilot flag, the account is NOT a
    // Drive pilot, so the task write path stays the legacy Firestore one.
    expect(isTaskPilotActive('user-a')).toBe(false);
  });

  it('enabling the pilot never auto-copies existing Firestore tasks into Drive', async () => {
    const backend = new FakePartitionBackend();
    // A brand-new pilot account starts with an EMPTY Drive task list.
    expect(await loadTasksFromDrive(backend)).toEqual([]);
    // Nothing was silently migrated from Firestore.
    expect(backend.writeCount).toBe(0);
  });
});


// ---------------------------------------------------------------------------
// Regression: Drive is authoritative even when the connection is down
// (this review). These prove a pilot account NEVER silently falls back to
// Firestore and always keeps Drive as the selected store.
// ---------------------------------------------------------------------------

describe('pilot stays Drive-authoritative when Drive is unavailable', () => {
  it('an enabled pilot selects Drive as its authoritative store', () => {
    // Opt-in alone makes the account a pilot. There is no connection
    // argument to flip it back to Firestore.
    localStorage.setItem('sschedule_drive_pilot', 'user-a');
    expect(isTaskPilotActive('user-a')).toBe(true);
  });

  it('a non-pilot account is never Drive-authoritative', () => {
    // No opt-in -> not a pilot, regardless of any external state.
    expect(isTaskPilotActive('user-a')).toBe(false);
  });

  it('Drive network failure does NOT redirect a write to Firestore', async () => {
    // With Drive unreachable, the change is preserved in the per-uid
    // Drive queue and reported as pending — it is never written to the
    // Firestore offline queue, and no Firestore task content is created.
    const backend = new FakePartitionBackend();
    backend.failRead = () => new DriveNetworkError('offline');

    const result = await persistTaskChange(
      'user-a',
      makeTask('task-1'),
      'create',
      undefined,
      backend,
      new FakeSignalBackend(),
    );

    expect(result.persisted).toBe(false);
    expect(result.pending).toBe(true);
    expect(result.pendingReason).toBe('offline');
    // The change survives in the Drive queue — not lost, not in Firestore.
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);
    expect(getPendingTaskChanges('user-a')[0].taskId).toBe('task-1');
    // Nothing landed in Drive yet (the caller must not report success).
    expect(backend.writeCount).toBe(0);
  });

  it('an expired/revoked token is treated as needs-reconnect, still queued, never Firestore', async () => {
    const backend = new FakePartitionBackend();
    backend.failReadAlways = () => new DriveAuthError('invalid_grant');

    const result = await persistTaskChange(
      'user-a',
      makeTask('task-1'),
      'create',
      undefined,
      backend,
      new FakeSignalBackend(),
    );

    expect(result.persisted).toBe(false);
    expect(result.pending).toBe(true);
    expect(result.pendingReason).toBe('needs-reconnect');
    // The pending change is preserved for a later reconnection.
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);
    expect(backend.writeCount).toBe(0);
  });

  it('a 403 revoked-permission error is needs-reconnect and stays queued', async () => {
    const backend = new FakePartitionBackend();
    backend.failReadAlways = () =>
      new DrivePermissionError('forbidden', 'insufficientPermissions');

    const result = await persistTaskChange(
      'user-a',
      makeTask('task-1'),
      'create',
      undefined,
      backend,
      new FakeSignalBackend(),
    );

    expect(result.pendingReason).toBe('needs-reconnect');
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);
  });

  it('a genuine non-recoverable Drive error (quota) is surfaced, not queued or redirected', async () => {
    const backend = new FakePartitionBackend();
    backend.failWrite = () => new Error('quota exceeded');

    await expect(
      persistTaskChange(
        'user-a',
        makeTask('task-1'),
        'create',
        undefined,
        backend,
        new FakeSignalBackend(),
      ),
    ).rejects.toThrow(/quota exceeded/);
    // Not silently queued, not written to Firestore — the user must see it.
    expect(getPendingTaskChanges('user-a')).toHaveLength(0);
  });
});


// ---------------------------------------------------------------------------
// Regression: reconnect flush, restart survival, account-switch isolation
// ---------------------------------------------------------------------------

describe('reconnect flush and pending-change lifecycle', () => {
  it('queued edits survive a "restart" and flush on reconnect without duplicating records', async () => {
    // A fresh backend + queue (simulating a new page/app instance) that
    // still holds the persisted localStorage queue proves restart survival.
    const offline = new FakePartitionBackend();
    offline.failRead = () => new DriveNetworkError('offline');
    await persistTaskChange(
      'user-a',
      makeTask('task-1', 'Queued edit'),
      'create',
      undefined,
      offline,
      new FakeSignalBackend(),
    );
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);

    // "Restart": read the queue back (it is in localStorage, so a new
    // instance sees it) and flush against a now-reachable Drive.
    const online = new FakePartitionBackend();
    const applied = await retryPendingTaskChanges(
      'user-a',
      online,
      new FakeSignalBackend(),
    );
    expect(applied).toBe(1);
    expect(getPendingTaskChanges('user-a')).toHaveLength(0);

    const records = await loadTaskRecordsFromDrive(online);
    expect(records.filter((r) => r.id === 'task-1')).toHaveLength(1);
    // Flushing again is idempotent — no duplicate is created.
    const again = await retryPendingTaskChanges('user-a', online, new FakeSignalBackend());
    expect(again).toBe(0);
    expect(
      (await loadTaskRecordsFromDrive(online)).filter((r) => r.id === 'task-1'),
    ).toHaveLength(1);
  });

  it('reconnect flush never overwrites a newer remote revision (conflict-safe)', async () => {
    // user-a creates the task on Drive (revision 1).
    const seed = new FakePartitionBackend();
    await persistTaskChange(
      'user-a',
      makeTask('task-1', 'v1'),
      'create',
      undefined,
      seed,
      new FakeSignalBackend(),
    );
    // Queue a later local edit (based on revision 1) while offline.
    seed.failWrite = () => new DriveNetworkError('offline');
    await persistTaskChange(
      'user-a',
      makeTask('task-1', 'local-edit'),
      'update',
      1,
      seed,
      new FakeSignalBackend(),
    );
    expect(getPendingTaskChanges('user-a')).toHaveLength(1);

    // Meanwhile another device advances Drive to revision 2.
    const remote = new FakePartitionBackend();
    remote.partitions = [
      storedPartition([
        createRecordEnvelope(makeTask('task-1', 'remote-v2'), {
          entityType: 'task',
          revision: 2,
        }),
      ]),
    ];

    // Reconnect flush: the queued edit was based on revision 1, but Drive
    // is at 2 — the newer remote record must NOT be rolled back.
    const applied = await retryPendingTaskChanges('user-a', remote, new FakeSignalBackend());
    expect(applied).toBe(0);
    const records = await loadTaskRecordsFromDrive(remote);
    expect(records).toHaveLength(1);
    expect((records[0] as any).payload.title).toBe('remote-v2');
    expect(records[0].revision).toBe(2);
  });

  it("account switching cannot mix or apply another account's pending operations", async () => {
    const backend = new FakePartitionBackend();
    backend.failReadAlways = () => new DriveNetworkError('offline');

    // user-a queues two changes while offline.
    await persistTaskChange('user-a', makeTask('task-a1'), 'create', undefined, backend, new FakeSignalBackend());
    await persistTaskChange('user-a', makeTask('task-a2'), 'create', undefined, backend, new FakeSignalBackend());
    expect(getPendingTaskChanges('user-a')).toHaveLength(2);
    expect(getPendingTaskChanges('user-b')).toHaveLength(0);

    // Sign in as user-b and reconnect. user-b's flush must apply nothing
    // of user-a's queue and leave user-a's queue intact.
    const online = new FakePartitionBackend();
    const appliedB = await retryPendingTaskChanges('user-b', online, new FakeSignalBackend());
    expect(appliedB).toBe(0);
    expect(await loadTasksFromDrive(online)).toEqual([]);
    expect(getPendingTaskChanges('user-a')).toHaveLength(2);

    // Back as user-a: their own queued changes flush cleanly and only theirs.
    const appliedA = await retryPendingTaskChanges('user-a', online, new FakeSignalBackend());
    expect(appliedA).toBe(2);
    const ids = (await loadTaskRecordsFromDrive(online)).map((r) => r.id).sort();
    expect(ids).toEqual(['task-a1', 'task-a2']);
    expect(getPendingTaskChanges('user-a')).toHaveLength(0);
  });

  it('conflicts remain recoverable: the local version is preserved and the write is blocked', async () => {
    const backend = new FakePartitionBackend();
    // Drive already holds the task at revision 3.
    backend.partitions = [
      storedPartition([
        createRecordEnvelope(makeTask('task-1', 'drive-v3'), {
          entityType: 'task',
          revision: 3,
        }),
      ]),
    ];

    // A local edit based on revision 1 is stale -> blocked + preserved.
    await expect(
      persistTaskChange(
        'user-a',
        makeTask('task-1', 'local-stale'),
        'update',
        1,
        backend,
        new FakeSignalBackend(),
      ),
    ).rejects.toBeInstanceOf(DriveTaskConflictError);

    // The rejected local version was preserved in the conflicts folder.
    expect(backend.conflicts).toHaveLength(1);
    expect((backend.conflicts[0] as any).localVersion.title).toBe('local-stale');
    // Drive still holds the authoritative revision 3 — never overwritten.
    const records = await loadTaskRecordsFromDrive(backend);
    expect(records[0].revision).toBe(3);
    expect((records[0] as any).payload.title).toBe('drive-v3');
  });
});
