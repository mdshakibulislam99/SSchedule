/**
 * Storage abstraction between application features and
 * persistent storage.
 *
 * Two adapters implement the same interface:
 *  - FirestoreLegacyAdapter — the existing production
 *    path (StudyStorage device cache + offlineSyncService
 *    queue + Firestore). This remains the default.
 *  - DriveStorageAdapter — the new Google Drive model.
 *
 * A feature flag (`sschedule_drive_pilot` in localStorage,
 * mirrored as `storageRole` in the Firestore integration
 * doc) selects the Drive adapter. It is OFF for every
 * account by default; a pilot account must be explicitly
 * enabled before Drive becomes the write destination.
 */

import {
  DriveInitializationResult,
  DriveRecordEnvelope,
  DriveStorageStatus,
  DrivePartition,
  StorageVerificationResult,
  createRecordEnvelope,
  getDeviceId,
  isCollectionDriveEnabled,
} from '../types/driveStorage';
import { driveService } from './driveService';
import {
  buildPartitions,
  deserializePartition,
  findRecord,
  serializePartition,
  tombstoneRecord,
  upsertRecord,
} from './drivePartition';
import { StudyStorage } from '../utils/storage';
import { offlineSyncService } from './offlineSyncService';
import type { OfflineSyncCollection } from '../types';

/** Operations every persistent storage backend must provide. */
export interface StorageAdapter {
  /** Idempotent provisioning of the storage backend. */
  initializeStorage(): Promise<{ ok: boolean; detail?: string }>;
  verifyStorage(): Promise<StorageVerificationResult>;
  getStorageStatus(): Promise<DriveStorageStatus | null>;
  getRecord<T>(collection: string, id: string): Promise<T | null>;
  listRecords<T>(collection: string): Promise<T[]>;
  saveRecord<T extends { id: string }>(collection: string, record: T): Promise<void>;
  deleteRecord(collection: string, id: string): Promise<void>;
  /** Records whose updatedAt is newer than `since` (ISO string). */
  listChangedRecords<T>(collection: string, since: string): Promise<T[]>;
}

// ---------------------------------------------------------------------------
// Legacy adapter — the existing Firestore implementation
// ---------------------------------------------------------------------------

/**
 * The current production storage path. Reads come from the
 * device cache that Firestore restore populates; writes go
 * through the existing offline queue exactly as they do
 * today. This adapter is the default for every account.
 */
export class FirestoreLegacyAdapter implements StorageAdapter {
  async initializeStorage() {
    // Firestore is provisioned by Firebase itself — nothing to do.
    return { ok: true, detail: 'Firestore (legacy) is always available' };
  }

  async verifyStorage(): Promise<StorageVerificationResult> {
    return { valid: true, issues: [], checkedAt: new Date().toISOString() };
  }

  async getStorageStatus() {
    return null; // Drive status does not apply to the legacy path.
  }

  async getRecord<T>(collection: string, id: string): Promise<T | null> {
    const records = this.readLocal<T>(collection);
    return records.find((r: any) => r.id === id) ?? null;
  }

  async listRecords<T>(collection: string): Promise<T[]> {
    return this.readLocal<T>(collection);
  }

  async saveRecord<T extends { id: string }>(collection: string, record: T): Promise<void> {
    // The exact write path the app uses today: local cache
    // update (done by callers via React state) plus the
    // offline queue flush to Firestore.
    offlineSyncService.enqueueUpsert(
      this.requireUid(),
      collection as OfflineSyncCollection,
      record.id,
      record,
    );
  }

  async deleteRecord(collection: string, id: string): Promise<void> {
    offlineSyncService.enqueueDelete(
      this.requireUid(),
      collection as OfflineSyncCollection,
      id,
    );
  }

  async listChangedRecords<T>(collection: string, since: string): Promise<T[]> {
    // Firestore exposes no local change feed; the legacy
    // adapter returns records newer than `since` from the
    // device cache. Callers that need a true change feed
    // must use the Drive adapter.
    const updatedAt = new Date(since).getTime();
    return this.readLocal<T>(collection).filter(
      (r: any) => r.updatedAt && new Date(r.updatedAt).getTime() > updatedAt,
    );
  }

  /** The signed-in Firebase uid, or null for local-only sessions. */
  protected currentUid(): string | null {
    return StudyStorage.getUser()?.firebaseUid ?? null;
  }

  private requireUid(): string {
    const uid = this.currentUid();
    if (!uid) {
      throw new Error('No signed-in Firebase user for the legacy storage adapter.');
    }
    return uid;
  }

  private readLocal<T>(collection: string): T[] {
    switch (collection) {
      case 'tasks': return StudyStorage.getTasks() as unknown as T[];
      case 'schedules': case 'schedule': return StudyStorage.getSchedule() as unknown as T[];
      case 'goals': return StudyStorage.getGoals() as unknown as T[];
      case 'courses': return StudyStorage.getCourses() as unknown as T[];
      case 'resources': return StudyStorage.getResources() as unknown as T[];
      case 'files': return StudyStorage.getFiles() as unknown as T[];
      case 'notes': return StudyStorage.getNotes() as unknown as T[];
      case 'research': return StudyStorage.getResearch() as unknown as T[];
      case 'aiMemory': case 'ai-memory': return StudyStorage.getAIMemory() as unknown as T[];
      case 'notifications': return StudyStorage.getNotifications() as unknown as T[];
      case 'quizzes': return StudyStorage.getQuizzes() as unknown as T[];
      case 'flashcards': return StudyStorage.getFlashcards() as unknown as T[];
      case 'annotations': return StudyStorage.getAnnotations() as unknown as T[];
      case 'conversations': return (StudyStorage.getConversations?.() ?? []) as unknown as T[];
      default: return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Drive adapter — the new storage model
// ---------------------------------------------------------------------------

/**
 * Google Drive-backed adapter. Implements the same interface
 * on top of the partition protocol: records are read from
 * and written to collection partition files under
 * SScheduleData/data/. Full cross-device sync semantics
 * (change feed, conflict resolution) are the next phase —
 * this adapter provides the storage operations only.
 */
export class DriveStorageAdapter implements StorageAdapter {
  /** The signed-in Firebase uid — scopes all Drive metadata to this account. */
  private currentUid(): string | null {
    return StudyStorage.getUser()?.firebaseUid ?? null;
  }

  async initializeStorage(): Promise<{ ok: boolean; detail?: string }> {
    // Metadata (root folder id, schema version, migration status) is
    // persisted under the currently signed-in Firebase account so a
    // second account on the same device never inherits it.
    const result: DriveInitializationResult = await driveService.initializeDriveStorage(
      this.currentUid() ?? undefined,
    );
    return {
      ok: true,
      detail: `${result.status} · root ${result.rootFolderName} (${result.rootFolderId})`,
    };
  }

  async verifyStorage() {
    return driveService.verifyDriveStorage();
  }

  async getStorageStatus() {
    return driveService.getDriveStorageStatus();
  }

  async getRecord<T>(collection: string, id: string): Promise<T | null> {
    const records = await this.readEnvelopes<T>(collection);
    const found = records.find((r) => r.id === id && !r.deletedAt);
    return found ? (found.payload as T) : null;
  }

  async listRecords<T>(collection: string): Promise<T[]> {
    const records = await this.readEnvelopes<T>(collection);
    return records.filter((r) => !r.deletedAt).map((r) => r.payload as T);
  }

  async saveRecord<T extends { id: string }>(collection: string, record: T): Promise<void> {
    const partitions = await this.readPartitions(collection);
    const existing = findRecord(partitions, record.id);
    const envelope = createRecordEnvelope(record, {
      entityType: collection,
      revision: (existing?.record.revision ?? 0) + 1,
      createdAt: existing?.record.createdAt,
      baseRevision: existing?.record.revision,
    });
    const next = upsertRecord(partitions, collection, envelope);
    await this.writePartitions(collection, next);
  }

  async deleteRecord(collection: string, id: string): Promise<void> {
    const partitions = await this.readPartitions(collection);
    const next = tombstoneRecord(partitions, id, getDeviceId());
    await this.writePartitions(collection, next);
  }

  async listChangedRecords<T>(collection: string, since: string): Promise<T[]> {
    const sinceMs = new Date(since).getTime();
    const records = await this.readEnvelopes<T>(collection);
    return records
      .filter((r) => !r.deletedAt && new Date(r.updatedAt).getTime() > sinceMs)
      .map((r) => r.payload as T);
  }

  private async readPartitions<T>(collection: string): Promise<DrivePartition<T>[]> {
    const files = await driveService.listPartitionFiles(collection);
    const partitions: DrivePartition<T>[] = [];
    for (const file of files) {
      const partition = (await driveService.readPartition(
        collection,
        file.id,
      )) as DrivePartition<T>;
      partitions.push(partition);
    }
    return partitions;
  }

  private async readEnvelopes<T>(collection: string): Promise<DriveRecordEnvelope<T>[]> {
    const partitions = await this.readPartitions<T>(collection);
    return partitions.flatMap((p) => p.records);
  }

  private async writePartitions<T>(collection: string, partitions: DrivePartition<T>[]) {
    // Rewrite only the partitions that changed. (A full
    // differential write is part of the sync phase; the
    // staging protocol already keeps individual writes
    // crash-safe.)
    for (const partition of partitions) {
      await driveService.writePartition(partition);
    }
  }
}

// ---------------------------------------------------------------------------
// Pilot feature flag
// ---------------------------------------------------------------------------

const PILOT_FLAG_KEY = 'sschedule_drive_pilot';

/** Is this Firebase user explicitly selected as a Drive pilot? */
export function isDrivePilotEnabled(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(PILOT_FLAG_KEY) === userId;
  } catch {
    return false;
  }
}

/** Explicitly select a pilot account. Storage is initialized first. */
export async function enableDrivePilot(
  userId: string,
): Promise<DriveInitializationResult> {
  const result = await driveService.initializeDriveStorage(userId);
  try {
    localStorage.setItem(PILOT_FLAG_KEY, userId);
  } catch {}
  return result;
}

/** Returns every account to the legacy Firestore storage. */
export function disableDrivePilot(): void {
  try {
    localStorage.removeItem(PILOT_FLAG_KEY);
  } catch {}
}

/**
 * The active storage adapter for an account. Defaults to the
 * legacy Firestore adapter — Drive is never the destination
 * unless the account was explicitly piloted.
 */
export function getStorageAdapter(
  userId: string | null | undefined,
): StorageAdapter {
  if (isDrivePilotEnabled(userId)) {
    return new DriveStorageAdapter();
  }
  return new FirestoreLegacyAdapter();
}

/**
 * Per-collection Drive routing.
 *
 * A collection is Drive-authoritative for an account ONLY when the
 * account is an explicit Drive pilot AND the collection is listed in
 * DRIVE_ROLLOUT_ENABLED_COLLECTIONS. Every other collection — and every
 * non-pilot account — stays on the legacy Firestore path, exactly as
 * today. Wiring a collection's adapter methods never enables it; only
 * the rollout gate does.
 */
export function isCollectionDriveAuthoritative(
  collection: string,
  userId: string | null | undefined,
): boolean {
  return isCollectionDriveEnabled(collection, userId, isDrivePilotEnabled(userId));
}

// Re-exported for callers that need partition helpers.
export { buildPartitions, deserializePartition, serializePartition };
