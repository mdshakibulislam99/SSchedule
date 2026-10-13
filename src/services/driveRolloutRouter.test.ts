import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  },
}));

import {
  isCollectionDriveAuthoritative,
  enableDrivePilot,
  disableDrivePilot,
} from './storageInterface';
import { DRIVE_ROLLOUT_ENABLED_COLLECTIONS } from '../types/driveStorage';
import { ROUTED_COLLECTIONS, shouldUseDriveForCollection } from './driveRolloutRouter';

const PILOT_FLAG_KEY = 'sschedule_drive_pilot';

beforeEach(() => {
  localStorageStore.clear();
  vi.clearAllMocks();
});

describe('per-collection rollout gate', () => {
  it('enables tasks for a pilot account', async () => {
    await enableDrivePilot('user-1');
    expect(isCollectionDriveAuthoritative('tasks', 'user-1')).toBe(true);
    expect(shouldUseDriveForCollection('tasks', 'user-1')).toBe(true);
  });

  it('keeps every non-rollout collection on the legacy path', async () => {
    await enableDrivePilot('user-1');
    for (const collection of ROUTED_COLLECTIONS) {
      if (DRIVE_ROLLOUT_ENABLED_COLLECTIONS.has(collection)) continue;
      expect(isCollectionDriveAuthoritative(collection, 'user-1')).toBe(false);
      expect(shouldUseDriveForCollection(collection, 'user-1')).toBe(false);
    }
  });

  it('keeps non-pilot accounts fully on the legacy path', () => {
    expect(isCollectionDriveAuthoritative('tasks', 'user-2')).toBe(false);
    expect(shouldUseDriveForCollection('tasks', 'user-2')).toBe(false);
    expect(shouldUseDriveForCollection('schedule', 'user-2')).toBe(false);
  });

  it('wiring a collection never enables it without the gate', async () => {
    await enableDrivePilot('user-1');
    // schedule/notes/etc. all have wired adapter methods via the router,
    // but the gate list is the only switch.
    expect(ROUTED_COLLECTIONS).toContain('schedule');
    expect(ROUTED_COLLECTIONS).toContain('notes');
    expect(isCollectionDriveAuthoritative('schedule', 'user-1')).toBe(false);
    expect(isCollectionDriveAuthoritative('notes', 'user-1')).toBe(false);
  });

  it('disabling the pilot returns every collection to legacy', async () => {
    await enableDrivePilot('user-1');
    expect(isCollectionDriveAuthoritative('tasks', 'user-1')).toBe(true);
    disableDrivePilot();
    expect(isCollectionDriveAuthoritative('tasks', 'user-1')).toBe(false);
    expect(shouldUseDriveForCollection('tasks', 'user-1')).toBe(false);
  });

  it('persists the pilot selection per account', () => {
    localStorage.setItem(PILOT_FLAG_KEY, 'user-9');
    expect(isCollectionDriveAuthoritative('tasks', 'user-9')).toBe(true);
    expect(isCollectionDriveAuthoritative('tasks', 'user-8')).toBe(false);
  });
});
