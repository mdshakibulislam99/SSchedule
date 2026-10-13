import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./driveService', () => ({
  driveService: {
    getDriveStorageStatus: vi.fn(async () => ({
      initialized: true,
      connected: true,
      rootFolderId: 'root-1',
      rootFolderName: 'SScheduleData',
      schemaVersion: 1,
      migrationState: 'NOT_STARTED',
      revision: 1,
      folderCount: 36,
      updatedAt: new Date().toISOString(),
    })),
    listPartitionFiles: vi.fn(async () => []),
    readPartition: vi.fn(async () => {
      throw new Error('no partitions in this test');
    }),
    recoverStaging: vi.fn(async () => []),
  },
}));

import { driveService } from './driveService';
import { verifyCollection } from './driveVerificationService';

const mockedDrive = driveService as unknown as {
  getDriveStorageStatus: ReturnType<typeof vi.fn>;
  listPartitionFiles: ReturnType<typeof vi.fn>;
  readPartition: ReturnType<typeof vi.fn>;
  recoverStaging: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedDrive.getDriveStorageStatus.mockResolvedValue({
    initialized: true,
    connected: true,
    rootFolderId: 'root-1',
    rootFolderName: 'SScheduleData',
    schemaVersion: 1,
    migrationState: 'NOT_STARTED',
    revision: 1,
    folderCount: 36,
    updatedAt: new Date().toISOString(),
  });
  mockedDrive.listPartitionFiles.mockResolvedValue([]);
  mockedDrive.recoverStaging.mockResolvedValue([]);
});

describe('driveVerificationService', () => {
  it('marks an empty-but-healthy collection COMPLETE', async () => {
    const report = await verifyCollection('notes', 'user-1', {
      readFirestoreCount: async () => 0,
    });
    expect(report.state).toBe('COMPLETE');
    expect(report.driveRecordCount).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it('reports STALE_SOURCE_DISCREPANCY and preserves both copies', async () => {
    const report = await verifyCollection('notes', 'user-1', {
      readFirestoreCount: async () => 5,
    });
    expect(report.state).toBe('VERIFIED');
    expect(report.issues.some((i) => i.code === 'STALE_SOURCE_DISCREPANCY')).toBe(true);
    // Not COMPLETE: the discrepancy needs an explicit migration.
    expect(report.state).not.toBe('COMPLETE');
  });

  it('surfaces unreadable Firestore as a migration blocker, not a silent pass', async () => {
    const report = await verifyCollection('notes', 'user-1', {
      readFirestoreCount: async () => null,
    });
    expect(report.issues.some((i) => i.code === 'MIGRATION_BLOCKED_NO_READ')).toBe(true);
    expect(report.state).toBe('VERIFIED');
  });

  it('fails on corrupt partitions without deleting anything', async () => {
    mockedDrive.listPartitionFiles.mockResolvedValue([
      { id: 'p1', name: 'part-000001.json', mimeType: 'application/json' },
    ]);
    const { DrivePartitionCorruptedError } = await import('./drivePartition');
    mockedDrive.readPartition.mockRejectedValue(
      new DrivePartitionCorruptedError('notes:part-000001', 'checksum mismatch'),
    );
    const report = await verifyCollection('notes', 'user-1', {
      readFirestoreCount: async () => 0,
    });
    expect(report.state).toBe('FAILED');
    expect(report.issues.some((i) => i.code === 'PARTITION_CORRUPT')).toBe(true);
  });

  it('fails on schema mismatch', async () => {
    mockedDrive.getDriveStorageStatus.mockResolvedValue({
      initialized: true,
      connected: true,
      rootFolderId: 'root-1',
      rootFolderName: 'SScheduleData',
      schemaVersion: 99,
      migrationState: 'NOT_STARTED',
      revision: 1,
      folderCount: 36,
      updatedAt: new Date().toISOString(),
    });
    const report = await verifyCollection('notes', 'user-1', {
      readFirestoreCount: async () => 0,
    });
    expect(report.state).toBe('FAILED');
    expect(report.issues.some((i) => i.code === 'SCHEMA_MISMATCH')).toBe(true);
  });

  it('reports interrupted staging uploads without auto-moving them', async () => {
    mockedDrive.recoverStaging.mockResolvedValue(['data/notes__part-000001.json']);
    const report = await verifyCollection('notes', 'user-1', {
      readFirestoreCount: async () => 0,
    });
    expect(report.issues.some((i) => i.code === 'INTERRUPTED_UPLOAD')).toBe(true);
  });
});
