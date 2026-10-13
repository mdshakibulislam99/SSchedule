/**
 * Collection partitioning for Drive storage.
 *
 * Design targets:
 *  - No per-record Drive files (too many HTTP calls, hits
 *    Drive's per-folder listing limits).
 *  - No single giant JSON (rewriting a 100k-record file on
 *    every keystroke).
 *  - ~100–500 records per partition file as the initial
 *    sizing target.
 *
 * Partitions are content-addressed by stable ids
 * (`tasks:part-000001`) so repeated builds are deterministic,
 * and every partition carries a checksum so corruption and
 * incomplete writes are detectable.
 */

import {
  DRIVE_STORAGE_SCHEMA_VERSION,
  DrivePartition,
  DriveRecordEnvelope,
  computeChecksum,
} from '../types/driveStorage';

/** Hard ceiling for records in one partition file. */
export const PARTITION_MAX_RECORDS = 500;
/** Preferred packing target. */
export const PARTITION_TARGET_RECORDS = 250;
/** Below this, a repacked partition is considered underfilled. */
export const PARTITION_MIN_RECORDS = 100;

/** Stable file name for a partition index: `part-000001.json`. */
export function partitionFileName(index: number): string {
  return `part-${String(index + 1).padStart(6, '0')}.json`;
}

/** Stable logical partition id: `tasks:part-000001`. */
export function partitionId(collection: string, index: number): string {
  return `${collection}:${partitionFileName(index).replace(/\.json$/, '')}`;
}

/** Serializes a partition, stamping the checksum over its records. */
export function serializePartition<T>(
  partition: DrivePartition<T>,
): string {
  const recordsJson = JSON.stringify(partition.records);
  const body: Omit<DrivePartition<T>, 'checksum'> & { checksum: string } = {
    partitionId: partition.partitionId,
    collection: partition.collection,
    index: partition.index,
    schemaVersion: partition.schemaVersion,
    recordCount: partition.records.length,
    records: partition.records,
    checksum: computeChecksum(recordsJson),
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(body);
}

export class DrivePartitionCorruptedError extends Error {
  partitionId: string;
  constructor(partitionId: string, message: string) {
    super(message);
    this.name = 'DrivePartitionCorruptedError';
    this.partitionId = partitionId;
  }
}

/**
 * Deserializes and validates a partition. Throws
 * `DrivePartitionCorruptedError` when the checksum does
 * not match (truncated or corrupted file).
 */
export function deserializePartition<T>(raw: string): DrivePartition<T> {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DrivePartitionCorruptedError(
      String(parsed?.partitionId ?? 'unknown'),
      'Partition is not valid JSON.',
    );
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.records)) {
    throw new DrivePartitionCorruptedError(
      String(parsed?.partitionId ?? 'unknown'),
      'Partition is missing its records array.',
    );
  }
  const recordsJson = JSON.stringify(parsed.records);
  const expected = computeChecksum(recordsJson);
  if (parsed.checksum !== expected) {
    throw new DrivePartitionCorruptedError(
      String(parsed.partitionId ?? 'unknown'),
      `Partition checksum mismatch (expected ${expected}, got ${parsed.checksum}).`,
    );
  }
  const partition: DrivePartition<T> = {
    partitionId: String(parsed.partitionId ?? ''),
    collection: String(parsed.collection ?? ''),
    index: Number(parsed.index ?? 0),
    schemaVersion: Number(parsed.schemaVersion ?? DRIVE_STORAGE_SCHEMA_VERSION),
    recordCount: Number(parsed.recordCount ?? parsed.records.length),
    records: parsed.records as DriveRecordEnvelope<T>[],
    checksum: parsed.checksum,
    updatedAt: String(parsed.updatedAt ?? new Date().toISOString()),
  };
  if (partition.recordCount !== partition.records.length) {
    throw new DrivePartitionCorruptedError(
      partition.partitionId,
      `Record count mismatch (header ${partition.recordCount}, actual ${partition.records.length}).`,
    );
  }
  return partition;
}

/** Capacity check for one partition. */
export function checkPartitionCapacity(
  partition: DrivePartition,
): { ok: boolean; reason?: string } {
  if (partition.recordCount > PARTITION_MAX_RECORDS) {
    return {
      ok: false,
      reason: `Partition ${partition.partitionId} holds ${partition.recordCount} records (max ${PARTITION_MAX_RECORDS}).`,
    };
  }
  return { ok: true };
}

/**
 * Packs a flat record list into capacity-aware partitions.
 * Deterministic: the same input order yields the same
 * partition ids.
 */
export function buildPartitions<T>(
  collection: string,
  records: DriveRecordEnvelope<T>[],
): DrivePartition<T>[] {
  const partitions: DrivePartition<T>[] = [];
  for (let start = 0; start < records.length; start += PARTITION_TARGET_RECORDS) {
    const chunk = records.slice(start, start + PARTITION_TARGET_RECORDS);
    const index = Math.floor(start / PARTITION_TARGET_RECORDS);
    partitions.push({
      partitionId: partitionId(collection, index),
      collection,
      index,
      schemaVersion: DRIVE_STORAGE_SCHEMA_VERSION,
      recordCount: chunk.length,
      records: chunk,
      checksum: '',
      updatedAt: new Date().toISOString(),
    });
  }
  return partitions;
}

/** Finds a record by stable id across partitions. */
export function findRecord<T>(
  partitions: DrivePartition<T>[],
  id: string,
): { record: DriveRecordEnvelope<T>; partition: DrivePartition<T> } | null {
  for (const partition of partitions) {
    const record = partition.records.find((r) => r.id === id);
    if (record) return { record, partition };
  }
  return null;
}

/**
 * Creates or updates a record in place, preserving its
 * stable id. Over-capacity partitions are split so the
 * 500-record ceiling always holds.
 */
export function upsertRecord<T>(
  partitions: DrivePartition<T>[],
  collection: string,
  envelope: DriveRecordEnvelope<T>,
): DrivePartition<T>[] {
  const next = partitions.map((partition) => {
    if (!partition.records.some((r) => r.id === envelope.id)) return partition;
    return {
      ...partition,
      records: partition.records.map((r) => (r.id === envelope.id ? envelope : r)),
      recordCount: partition.records.length,
      updatedAt: new Date().toISOString(),
    };
  });

  const existingIndex = next.findIndex((p) =>
    p.records.some((r) => r.id === envelope.id),
  );
  if (existingIndex >= 0) {
    // Split an over-capacity partition in place.
    const over = next[existingIndex];
    if (over.recordCount > PARTITION_MAX_RECORDS) {
      const mid = Math.ceil(over.recordCount / 2);
      const left: DrivePartition<T> = {
        ...over,
        records: over.records.slice(0, mid),
        recordCount: mid,
      };
      const right: DrivePartition<T> = {
        ...over,
        partitionId: partitionId(collection, next.length),
        index: next.length,
        records: over.records.slice(mid),
        recordCount: over.recordCount - mid,
      };
      next.splice(existingIndex, 1, left, right);
    }
    return next;
  }

  // New record: append to the last partition, or open a new one.
  const last = next[next.length - 1];
  if (last && last.recordCount < PARTITION_MAX_RECORDS) {
    next[next.length - 1] = {
      ...last,
      records: [...last.records, envelope],
      recordCount: last.recordCount + 1,
      updatedAt: new Date().toISOString(),
    };
    return next;
  }
  next.push({
    partitionId: partitionId(collection, next.length),
    collection,
    index: next.length,
    schemaVersion: DRIVE_STORAGE_SCHEMA_VERSION,
    recordCount: 1,
    records: [envelope],
    checksum: '',
    updatedAt: new Date().toISOString(),
  });
  return next;
}

/**
 * Removes a record by replacing it with a tombstone envelope
 * (deletedAt set). The record id is preserved so other
 * devices converge on the same deletion.
 */
export function tombstoneRecord<T>(
  partitions: DrivePartition<T>[],
  id: string,
  writerDeviceId: string,
): DrivePartition<T>[] {
  return partitions.map((partition) => {
    const target = partition.records.find((r) => r.id === id);
    if (!target) return partition;
    return {
      ...partition,
      records: partition.records.map((r) =>
        r.id === id
          ? {
              ...r,
              deletedAt: new Date().toISOString(),
              revision: r.revision + 1,
              updatedAt: new Date().toISOString(),
              writerDeviceId,
              payload: ({} as T),
            }
          : r,
      ),
      updatedAt: new Date().toISOString(),
    };
  });
}
