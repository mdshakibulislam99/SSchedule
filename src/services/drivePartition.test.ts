import { describe, it, expect } from 'vitest';

import {
  PARTITION_MAX_RECORDS,
  PARTITION_TARGET_RECORDS,
  buildPartitions,
  checkPartitionCapacity,
  deserializePartition,
  findRecord,
  partitionFileName,
  partitionId,
  serializePartition,
  tombstoneRecord,
  upsertRecord,
  DrivePartitionCorruptedError,
} from './drivePartition';
import {
  DRIVE_STORAGE_SCHEMA_VERSION,
  DriveRecordEnvelope,
  createRecordEnvelope,
} from '../types/driveStorage';

function makeEnvelope(id: string, title = `Task ${id}`): DriveRecordEnvelope {
  return createRecordEnvelope(
    { id, title } as any,
    { entityType: 'task' },
  );
}

describe('partition ids', () => {
  it('is stable for a collection and index', () => {
    expect(partitionFileName(0)).toBe('part-000001.json');
    expect(partitionFileName(9)).toBe('part-000010.json');
    expect(partitionId('tasks', 0)).toBe('tasks:part-000001');
    expect(partitionId('tasks', 0)).toBe(partitionId('tasks', 0));
    expect(partitionId('tasks', 1)).not.toBe(partitionId('tasks', 0));
  });
});

describe('partition serialization', () => {
  it('round-trips a partition', () => {
    const partitions = buildPartitions('tasks', [makeEnvelope('task-1'), makeEnvelope('task-2')]);
    const raw = serializePartition(partitions[0]);
    const restored = deserializePartition(raw);
    expect(restored.recordCount).toBe(2);
    expect(restored.records[0].id).toBe('task-1');
    expect(restored.partitionId).toBe(partitions[0].partitionId);
  });

  it('detects corrupted content via checksum', () => {
    const partitions = buildPartitions('tasks', [makeEnvelope('task-1')]);
    const raw = serializePartition(partitions[0]);
    const tampered = raw.replace('"task-1"', '"task-9"');
    expect(() => deserializePartition(tampered)).toThrow(DrivePartitionCorruptedError);
  });

  it('detects a stale record-count header', () => {
    const partitions = buildPartitions('tasks', [makeEnvelope('task-1')]);
    const raw = serializePartition(partitions[0]);
    const parsed = JSON.parse(raw);
    parsed.recordCount = 7; // header no longer matches records
    expect(() => deserializePartition(JSON.stringify(parsed))).toThrow(DrivePartitionCorruptedError);
  });

  it('rejects non-JSON input', () => {
    expect(() => deserializePartition('not json')).toThrow(DrivePartitionCorruptedError);
  });
});

describe('partition capacity', () => {
  it('packs records into ~250-record partitions', () => {
    const records = Array.from({ length: 1000 }, (_, i) => makeEnvelope(`task-${i}`));
    const partitions = buildPartitions('tasks', records);
    expect(partitions).toHaveLength(4);
    partitions.forEach((p) => {
      expect(p.recordCount).toBeLessThanOrEqual(PARTITION_MAX_RECORDS);
      expect(p.recordCount).toBe(PARTITION_TARGET_RECORDS);
      expect(checkPartitionCapacity(p).ok).toBe(true);
    });
    // Deterministic ids for the same input.
    expect(buildPartitions('tasks', records).map((p) => p.partitionId))
      .toEqual(partitions.map((p) => p.partitionId));
  });

  it('flags an over-capacity partition', () => {
    const records = Array.from({ length: PARTITION_MAX_RECORDS + 1 }, (_, i) => makeEnvelope(`task-${i}`));
    const partitions = buildPartitions('tasks', records);
    const over = { ...partitions[0], recordCount: PARTITION_MAX_RECORDS + 1 };
    const check = checkPartitionCapacity(over);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('max');
  });
});

describe('record operations', () => {
  it('finds a record by stable id across partitions', () => {
    const partitions = buildPartitions('tasks', [makeEnvelope('task-1'), makeEnvelope('task-2')]);
    const found = findRecord(partitions, 'task-2');
    expect(found?.record.id).toBe('task-2');
    expect(findRecord(partitions, 'missing')).toBeNull();
  });

  it('updates a record in place, preserving its stable id', () => {
    let partitions = buildPartitions('tasks', [makeEnvelope('task-1')]);
    const updated = { ...makeEnvelope('task-1'), revision: 2, updatedAt: new Date().toISOString() };
    partitions = upsertRecord(partitions, 'tasks', updated);
    expect(partitions[0].records[0].revision).toBe(2);
    expect(partitions[0].records[0].id).toBe('task-1');
  });

  it('appends a new record to the last partition', () => {
    let partitions = buildPartitions('tasks', [makeEnvelope('task-1')]);
    partitions = upsertRecord(partitions, 'tasks', makeEnvelope('task-2'));
    expect(partitions[0].recordCount).toBe(2);
    expect(partitions[0].records[1].id).toBe('task-2');
  });

  it('splits a partition that exceeds the capacity ceiling', () => {
    const records = Array.from({ length: PARTITION_MAX_RECORDS }, (_, i) => makeEnvelope(`task-${i}`));
    let partitions = buildPartitions('tasks', records);
    // Force a single over-capacity partition.
    partitions = [{ ...partitions[0], records, recordCount: records.length }];
    partitions = upsertRecord(partitions, 'tasks', makeEnvelope('task-new'));
    expect(partitions).toHaveLength(2);
    expect(partitions[0].recordCount).toBeLessThanOrEqual(PARTITION_MAX_RECORDS);
    expect(partitions[1].recordCount).toBeLessThanOrEqual(PARTITION_MAX_RECORDS);
    const allIds = partitions.flatMap((p) => p.records.map((r) => r.id));
    expect(allIds).toContain('task-new');
  });

  it('tombstones a deleted record without dropping its id', () => {
    let partitions = buildPartitions('tasks', [makeEnvelope('task-1')]);
    partitions = tombstoneRecord(partitions, 'task-1', 'dev-test');
    const record = partitions[0].records[0];
    expect(record.deletedAt).toBeTruthy();
    expect(record.id).toBe('task-1');
    expect(record.revision).toBe(2);
    expect(record.payload).toEqual({});
  });
});
