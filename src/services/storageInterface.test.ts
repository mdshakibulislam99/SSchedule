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

// The storage interface must be testable without the
// Firebase SDK or real Drive: mock the service layer.
vi.mock('./driveService', () => ({
  driveService: {
    initializeDriveStorage: vi.fn(async () => ({
      status: 'created',
      rootFolderId: 'root-1',
      rootFolderName: 'SScheduleData',
      folders: {},
      manifest: {},
      migrationState: 'NOT_STARTED',
      createdFolderCount: 1,
    })),
    verifyDriveStorage: vi.fn(async () => ({
      valid: true,
      issues: [],
      checkedAt: new Date().toISOString(),
    })),
    getDriveStorageStatus: vi.fn(async () => ({
      initialized: true,
      connected: true,
      rootFolderId: 'root-1',
      rootFolderName: 'SScheduleData',
      schemaVersion: 1,
      migrationState: 'NOT_STARTED',
      revision: 1,
      folderCount: 36,
    })),
    listPartitionFiles: vi.fn(async () => [
      { id: 'p1', name: 'part-000001.json', mimeType: 'application/json' },
    ]),
    readPartition: vi.fn(async () => ({
      partitionId: 'tasks:part-000001',
      collection: 'tasks',
      index: 0,
      schemaVersion: 1,
      recordCount: 1,
      records: [
        {
          id: 'task-1',
          entityType: 'task',
          schemaVersion: 1,
          revision: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          writerDeviceId: 'dev-test',
          payload: { id: 'task-1', title: 'Study' },
        },
      ],
      checksum: '',
      updatedAt: '2026-01-01T00:00:00Z',
    })),
    writePartition: vi.fn(async () => {}),
  },
}));

vi.mock('./offlineSyncService', () => ({
  offlineSyncService: {
    enqueueUpsert: vi.fn(),
    enqueueDelete: vi.fn(),
  },
}));

vi.mock('../utils/storage', () => ({
  StudyStorage: {
    getUser: vi.fn(() => ({ firebaseUid: 'user-1' })),
    getTasks: vi.fn(() => [{ id: 'task-1', title: 'Local task' }]),
    getSchedule: vi.fn(() => []),
    getGoals: vi.fn(() => []),
    getCourses: vi.fn(() => []),
    getResources: vi.fn(() => []),
    getFiles: vi.fn(() => []),
    getNotes: vi.fn(() => []),
    getResearch: vi.fn(() => []),
    getAIMemory: vi.fn(() => []),
    getNotifications: vi.fn(() => []),
    getQuizzes: vi.fn(() => []),
    getFlashcards: vi.fn(() => []),
    getAnnotations: vi.fn(() => []),
    getConversations: vi.fn(() => []),
  },
}));

import {
  FirestoreLegacyAdapter,
  DriveStorageAdapter,
  disableDrivePilot,
  enableDrivePilot,
  getStorageAdapter,
  isDrivePilotEnabled,
} from './storageInterface';
import { offlineSyncService } from './offlineSyncService';
import { driveService } from './driveService';

const PILOT_FLAG_KEY = 'sschedule_drive_pilot';

beforeEach(() => {
  localStorageStore.clear();
  vi.clearAllMocks();
});

describe('pilot feature flag', () => {
  it('is disabled by default for every account', () => {
    expect(isDrivePilotEnabled('user-1')).toBe(false);
    expect(isDrivePilotEnabled(null)).toBe(false);
    expect(getStorageAdapter('user-1')).toBeInstanceOf(
      FirestoreLegacyAdapter,
    );
  });

  it('explicitly enables a pilot account', async () => {
    const result = await enableDrivePilot('user-1');
    expect(result.rootFolderName).toBe('SScheduleData');
    expect(isDrivePilotEnabled('user-1')).toBe(true);
    expect(getStorageAdapter('user-1')).toBeInstanceOf(
      DriveStorageAdapter,
    );
    // Other accounts stay on legacy storage.
    expect(isDrivePilotEnabled('user-2')).toBe(false);
    expect(getStorageAdapter('user-2')).toBeInstanceOf(
      FirestoreLegacyAdapter,
    );
  });

  it('disables the pilot and returns to legacy storage', async () => {
    await enableDrivePilot('user-1');
    disableDrivePilot();
    expect(isDrivePilotEnabled('user-1')).toBe(false);
    expect(getStorageAdapter('user-1')).toBeInstanceOf(
      FirestoreLegacyAdapter,
    );
  });

  it('persists the pilot selection', () => {
    localStorage.setItem(PILOT_FLAG_KEY, 'user-9');
    expect(isDrivePilotEnabled('user-9')).toBe(true);
  });
});

describe('FirestoreLegacyAdapter', () => {
  it('writes through the existing offline queue', async () => {
    const adapter = new FirestoreLegacyAdapter();
    const record = { id: 'task-9', title: 'New task' };
    await adapter.saveRecord('tasks', record);
    expect(offlineSyncService.enqueueUpsert).toHaveBeenCalledWith(
      'user-1',
      'tasks',
      'task-9',
      record,
    );
  });

  it('reads from the device cache', async () => {
    const adapter = new FirestoreLegacyAdapter();
    const records = await adapter.listRecords<any>('tasks');
    expect(records).toEqual([{ id: 'task-1', title: 'Local task' }]);
    const found = await adapter.getRecord<any>('tasks', 'task-1');
    expect(found?.title).toBe('Local task');
    expect(await adapter.getRecord('tasks', 'nope')).toBeNull();
  });

  it('deletes through the offline queue', async () => {
    const adapter = new FirestoreLegacyAdapter();
    await adapter.deleteRecord('tasks', 'task-1');
    expect(offlineSyncService.enqueueDelete).toHaveBeenCalledWith(
      'user-1',
      'tasks',
      'task-1',
    );
  });
});

describe('DriveStorageAdapter', () => {
  it('initializes the Drive structure', async () => {
    const adapter = new DriveStorageAdapter();
    const result = await adapter.initializeStorage();
    expect(result.ok).toBe(true);
    expect(driveService.initializeDriveStorage).toHaveBeenCalled();
  });

  it('reads records from collection partitions', async () => {
    const adapter = new DriveStorageAdapter();
    const record = await adapter.getRecord<any>('tasks', 'task-1');
    expect(record).toEqual({ id: 'task-1', title: 'Study' });
    const all = await adapter.listRecords<any>('tasks');
    expect(all).toHaveLength(1);
  });

  it('saves records as envelopes with stable ids', async () => {
    const adapter = new DriveStorageAdapter();
    await adapter.saveRecord('tasks', { id: 'task-1', title: 'Updated' });
    expect(driveService.writePartition).toHaveBeenCalled();
    const partition = (driveService.writePartition as any).mock
      .calls[0][0];
    expect(partition.collection).toBe('tasks');
    expect(partition.records[0].id).toBe('task-1');
    expect(partition.records[0].entityType).toBe('tasks');
    expect(partition.records[0].payload.title).toBe('Updated');
  });

  it('lists only records changed since a timestamp', async () => {
    const adapter = new DriveStorageAdapter();
    const changed = await adapter.listChangedRecords<any>(
      'tasks',
      '2025-01-01T00:00:00Z',
    );
    expect(changed).toHaveLength(1);
    const none = await adapter.listChangedRecords<any>(
      'tasks',
      '2030-01-01T00:00:00Z',
    );
    expect(none).toHaveLength(0);
  });
});
