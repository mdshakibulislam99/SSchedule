import { fetchUserDataFromFirestore } from '../lib/firebase';
import { COLLECTION_MAPPINGS } from '../types/driveStorage';
import { driveService } from './driveService';
import {
  enableDrivePilot,
  isDrivePilotEnabled,
  markDriveCollectionsMigrated,
} from './storageInterface';
import { getPendingTaskChanges, loadTaskRecordsFromDrive, persistTaskChange, retryPendingTaskChanges } from './taskPilotService';
import {
  getPendingCollectionChanges,
  persistCollectionChange,
  retryPendingCollectionChanges,
  type PilotRecord,
} from './collectionPilotService';
import { loadExtractedText, loadFileBlob } from '../utils/fileStorage';
import { StudyStorage } from '../utils/storage';
import { offlineSyncService } from './offlineSyncService';
import {
  loadOriginalFileFromDrive,
  mirrorDocumentIndexToDrive,
  mirrorDocumentTextToDrive,
  mirrorOriginalFileToDrive,
} from './documentIndexStore';

type MigrationRecord = { id: string };

const COLLECTION_DATA_KEYS = [
  ['schedule', 'schedule'],
  ['goals', 'goals'],
  ['courses', 'courses'],
  ['resources', 'resources'],
  ['files', 'files'],
  ['notes', 'notes'],
  ['research', 'research'],
  ['aiMemory', 'aiMemory'],
  ['conversations', 'conversations'],
  ['notifications', 'notifications'],
  ['quizzes', 'quizzes'],
  ['flashcards', 'flashcards'],
  ['annotations', 'annotations'],
] as const;

export interface StorageMigrationResult {
  migratedRecords: number;
  collections: Record<string, number>;
}

/**
 * Copy the complete Firestore record set into Drive and verify every id and
 * payload before switching this account to Drive-authoritative storage.
 * Firestore is retained as a recovery copy; this operation never deletes it.
 */
export async function migrateFirestoreToDrive(
  uid: string,
  onProgress?: (collection: string, complete: number, total: number) => void,
): Promise<StorageMigrationResult> {
  await driveService.initializeDriveStorage(uid);
  const firestoreFlush = await offlineSyncService.syncNow();
  if (firestoreFlush.remaining > 0) {
    throw new Error(`Migration paused: ${firestoreFlush.remaining} Firestore change(s) are still pending. Reconnect and sync them first.`);
  }
  if (isDrivePilotEnabled(uid)) {
    await retryPendingTaskChanges(uid);
    if (getPendingTaskChanges(uid).length > 0) {
      throw new Error('Migration paused: task changes are still waiting to reach Google Drive. Reconnect and retry.');
    }
    for (const [collection, mapping] of Object.entries(COLLECTION_MAPPINGS)) {
      if (collection === 'tasks' || !getPendingCollectionChanges(collection, uid).length) continue;
      await retryPendingCollectionChanges(collection, mapping.entityType, uid);
      if (getPendingCollectionChanges(collection, uid).length) {
        throw new Error(`Migration paused: ${collection} changes are still waiting to reach Google Drive.`);
      }
    }
  }
  const source = await fetchUserDataFromFirestore(uid);
  const unreadable = source.collectionReadErrors.filter((name) => !(name === 'tasks' && isDrivePilotEnabled(uid)));
  if (unreadable.length) {
    throw new Error(`Migration stopped because Firestore could not read: ${unreadable.join(', ')}.`);
  }

  await driveService.updateMigrationState((current) => ({
    ...current,
    state: 'IN_PROGRESS',
    startedAt: current.startedAt || new Date().toISOString(),
    lastError: null,
  }));

  const counts: Record<string, number> = {};
  try {
    let tasks = source.tasks;
    if (isDrivePilotEnabled(uid)) {
      // Existing task pilots already have Drive-authoritative tasks; Firestore
      // may contain stale copies and must never overwrite the Drive baseline.
      const remote = await loadTaskRecordsFromDrive();
      tasks = remote.filter((record) => !record.deletedAt).map((record) => record.payload);
    } else {
      const existingTasks = await driveService.listDataRecords<(typeof tasks)[number]>('tasks');
      const byId = new Map(existingTasks.map((record) => [record.id, record]));
      for (let i = 0; i < tasks.length; i += 1) {
        const existing = byId.get(tasks[i].id);
        const result = await persistTaskChange(
          uid,
          tasks[i],
          existing ? 'update' : 'create',
          existing?.revision,
        );
        if (!result.persisted) throw new Error(`Task ${tasks[i].id} is queued locally and has not reached Drive.`);
        onProgress?.('tasks', i + 1, tasks.length);
      }
    }
    counts.tasks = tasks.length;
    await verifyCollection('tasks', tasks);

    for (const [key, collection] of COLLECTION_DATA_KEYS) {
      const records = (source[key] || []) as unknown as MigrationRecord[];
      const mapping = COLLECTION_MAPPINGS[collection];
      const existingRecords = await driveService.listDataRecords<PilotRecord>(collection);
      const byId = new Map(existingRecords.map((record) => [record.id, record]));
      for (let i = 0; i < records.length; i += 1) {
        const record = records[i];
        if (!record?.id) throw new Error(`${collection} contains a record without a stable id.`);
        const existing = byId.get(record.id);
        const result = await persistCollectionChange(
          collection,
          mapping.entityType,
          uid,
          record,
          existing ? 'update' : 'create',
          existing?.revision,
        );
        if (!result.persisted) throw new Error(`${collection} record ${record.id} is queued locally and has not reached Drive.`);
        onProgress?.(collection, i + 1, records.length);
      }
      counts[collection] = records.length;
      await verifyCollection(collection, records);
      await driveService.updateMigrationState((current) => ({
        ...current,
        collections: { ...current.collections, [collection]: 'COMPLETE' },
      }));
    }

    const extraCollections: Array<[string, Array<{ id: string; [key: string]: any }>]> = [
      ['metrics', [{ id: 'current', ...(source.metrics || StudyStorage.getMetrics()) }]],
      ['settings', [{
        id: 'preferences',
        themeMode: StudyStorage.getThemeMode(),
        notificationSettings: StudyStorage.getNotificationSettings(),
      }]],
    ];
    for (const [collection, records] of extraCollections) {
      const existingRecords = await driveService.listDataRecords<PilotRecord>(collection);
      const byId = new Map(existingRecords.map((record) => [record.id, record]));
      const mapping = COLLECTION_MAPPINGS[collection];
      for (const record of records) {
        const existing = byId.get(record.id);
        const result = await persistCollectionChange(
          collection,
          mapping.entityType,
          uid,
          record,
          existing ? 'update' : 'create',
          existing?.revision,
        );
        if (!result.persisted) throw new Error(`${collection} preferences are queued locally and have not reached Drive.`);
      }
      counts[collection] = records.length;
      await verifyCollection(collection, records);
      await driveService.updateMigrationState((current) => ({
        ...current,
        collections: { ...current.collections, [collection]: 'COMPLETE' },
      }));
    }

    for (let fileIndex = 0; fileIndex < source.files.length; fileIndex += 1) {
      const file = source.files[fileIndex];
      const storageKey = file.fileStorageKey || `original-${file.id}`;
      let blob = file.fileStorageKey ? await loadFileBlob(file.fileStorageKey) : null;
      if (!blob && file.dataUrl) {
        const [header, encoded] = file.dataUrl.split(',');
        if (encoded) {
          const mimeType = header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
          const binary = atob(encoded);
          blob = new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type: mimeType });
        }
      }
      if (!blob) blob = await loadOriginalFileFromDrive(uid, file.id, storageKey, true);
      if (!blob) {
        throw new Error(`Original file “${file.name}” is missing from this device and Drive. Re-upload it before completing storage migration.`);
      }
      await mirrorOriginalFileToDrive(uid, file.id, file.name, blob, true);
      if (file.extractedTextKey) {
        const text = await loadExtractedText(file.extractedTextKey);
        if (text) await mirrorDocumentTextToDrive(uid, file.id, file.name, text, true);
      }
      if (file.aiContext?.documentChunks?.length) {
        await mirrorDocumentIndexToDrive(uid, file.id, file.name, file.structure, file.aiContext, true);
      }
      onProgress?.('file originals', fileIndex + 1, source.files.length);
    }

    await driveService.updateMigrationState((current) => ({
      ...current,
      state: 'COMPLETE',
      completedAt: new Date().toISOString(),
      lastError: null,
      collections: { ...current.collections, tasks: 'COMPLETE' },
    }));
    markDriveCollectionsMigrated(uid);
    await enableDrivePilot(uid);
    if (!isDrivePilotEnabled(uid)) {
      throw new Error('Drive migration verified, but this device could not save its Drive storage setting. Check browser storage permissions and retry.');
    }
    return {
      migratedRecords: Object.values(counts).reduce((sum, count) => sum + count, 0),
      collections: counts,
    };
  } catch (error) {
    await driveService.updateMigrationState((current) => ({
      ...current,
      state: 'IN_PROGRESS',
      lastError: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  }
}

async function verifyCollection(
  collection: string,
  source: MigrationRecord[],
): Promise<void> {
  const records = await driveService.listDataRecords<MigrationRecord>(collection);
  const active = records.filter((record) => !record.deletedAt);
  const byId = new Map(active.map((record) => [record.id, record.payload]));
  if (byId.size !== source.length) {
    throw new Error(`${collection} verification failed: expected ${source.length} records, found ${byId.size}.`);
  }
  for (const expected of source) {
    if (JSON.stringify(byId.get(expected.id)) !== JSON.stringify(expected)) {
      throw new Error(`${collection} verification failed for record ${expected.id}.`);
    }
  }
}
