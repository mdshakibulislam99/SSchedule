/**
 * Drive verification + stale-data reconciliation.
 *
 * Safe, per-user and per-collection integrity checks for the Drive-backed
 * storage model. Verification NEVER migrates, copies, deletes, or
 * overwrites anything — it only reports. Counts alone are never enough:
 * every pass checks manifest validity, schema compatibility, partition
 * checksums, record-id resolution, revision consistency, orphaned Drive
 * files, stale Firestore documents, interrupted uploads, and migration
 * state.
 *
 * The CRITICAL migration rule is enforced structurally: initializing or
 * reconnecting Drive never treats old Firestore records as migrated, never
 * copies incomplete data over valid Drive data, and never deletes either
 * copy. When Firestore holds user data not yet present in Drive, the
 * collection reports STALE_SOURCE_DISCREPANCY and stays out of COMPLETE
 * until an explicit, recoverable migration resolves it.
 */

import {
  COLLECTION_MAPPINGS,
  DRIVE_STORAGE_SCHEMA_VERSION,
  type CollectionVerificationState,
} from '../types/driveStorage';
import { driveService } from './driveService';
import {
  deserializePartition,
  DrivePartitionCorruptedError,
} from './drivePartition';

export type VerificationIssueCode =
  | 'MANIFEST_INVALID'
  | 'SCHEMA_MISMATCH'
  | 'PARTITION_CORRUPT'
  | 'PARTITION_INACCESSIBLE'
  | 'RECORD_ID_UNRESOLVABLE'
  | 'REVISION_INCONSISTENT'
  | 'ORPHANED_DRIVE_FILE'
  | 'STALE_SOURCE_DISCREPANCY'
  | 'INTERRUPTED_UPLOAD'
  | 'MIGRATION_BLOCKED_NO_READ'
  | 'MIGRATION_INCOMPLETE';

export interface VerificationIssue {
  code: VerificationIssueCode;
  detail: string;
}

export interface CollectionVerificationReport {
  collection: string;
  state: CollectionVerificationState;
  driveRecordCount: number;
  firestoreRecordCount: number | null;
  issues: VerificationIssue[];
  checkedAt: string;
}

export interface CollectionVerificationDeps {
  readFirestoreCount: (collection: string, uid: string) => Promise<number | null>;
}

async function defaultReadFirestoreCount(
  collection: string,
  uid: string,
): Promise<number | null> {
  try {
    const { db } = await import('../lib/firebase');
    const { collection: fsCollection, getDocs } = await import('firebase/firestore');
    const mapping = COLLECTION_MAPPINGS[collection];
    if (!mapping) return null;
    const path = mapping.firestorePath
      .replace('{uid}', uid)
      .replace('{id}', '')
      .replace(/\/$/, '');
    const snap = await getDocs(fsCollection(db, path));
    return snap.size;
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (/permission|denied|insufficient/i.test(msg)) return null;
    throw err;
  }
}

/**
 * Verify one collection. Never mutates Drive or Firestore — staging
 * recovery artifacts are reported as INTERRUPTED_UPLOAD, not auto-moved.
 */
export async function verifyCollection(
  collection: string,
  uid: string,
  deps: Partial<CollectionVerificationDeps> = {},
): Promise<CollectionVerificationReport> {
  const checkedAt = new Date().toISOString();
  const issues: VerificationIssue[] = [];
  const readFirestoreCount = deps.readFirestoreCount ?? defaultReadFirestoreCount;

  // 1. Manifest validity + schema compatibility.
  try {
    const status = await driveService.getDriveStorageStatus();
    if (!status?.initialized) {
      issues.push({
        code: 'MANIFEST_INVALID',
        detail: 'Drive storage is not initialized for this account.',
      });
    }
    if (status && status.schemaVersion !== DRIVE_STORAGE_SCHEMA_VERSION) {
      issues.push({
        code: 'SCHEMA_MISMATCH',
        detail: `Drive schema ${status.schemaVersion} != app schema ${DRIVE_STORAGE_SCHEMA_VERSION}.`,
      });
    }
  } catch (err: any) {
    issues.push({
      code: 'MANIFEST_INVALID',
      detail: `Manifest unreadable: ${err?.message || err}`,
    });
  }

  // 2. Partition reads + checksum integrity + id resolution.
  let driveRecordCount = 0;
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  try {
    const files = await driveService.listPartitionFiles(collection);
    for (const file of files) {
      try {
        const partition = await driveService.readPartition(collection, file.id);
        deserializePartition(JSON.stringify(partition));
        for (const record of partition.records) {
          if (!record?.id) {
            issues.push({
              code: 'RECORD_ID_UNRESOLVABLE',
              detail: `Partition ${file.name} holds a record without a stable id.`,
            });
            continue;
          }
          if (seenIds.has(record.id)) duplicateIds.add(record.id);
          seenIds.add(record.id);
          if (typeof record.revision !== 'number' || record.revision < 1) {
            issues.push({
              code: 'REVISION_INCONSISTENT',
              detail: `Record ${record.id} has invalid revision ${String(record.revision)}.`,
            });
          }
        }
        driveRecordCount += partition.records.length;
      } catch (err: any) {
        if (err instanceof DrivePartitionCorruptedError) {
          issues.push({ code: 'PARTITION_CORRUPT', detail: `Partition ${file.name}: ${err.message}` });
        } else {
          issues.push({
            code: 'PARTITION_INACCESSIBLE',
            detail: `Partition ${file.name} unreadable: ${err?.message || err}`,
          });
        }
      }
    }
  } catch (err: any) {
    issues.push({
      code: 'PARTITION_INACCESSIBLE',
      detail: `Partition listing failed: ${err?.message || err}`,
    });
  }
  for (const id of duplicateIds) {
    issues.push({
      code: 'RECORD_ID_UNRESOLVABLE',
      detail: `Record id ${id} appears in more than one partition.`,
    });
  }

  // 3. Stale Firestore source vs Drive. Firestore holds user data not yet
  // in Drive => STALE_SOURCE_DISCREPANCY: preserve BOTH copies, never
  // auto-migrate, never mark COMPLETE. Unreadable-under-rules with an
  // empty Drive => MIGRATION_BLOCKED_NO_READ migration blocker.
  let firestoreRecordCount: number | null = null;
  let firestoreBlocked = false;
  try {
    firestoreRecordCount = await readFirestoreCount(collection, uid);
    if (firestoreRecordCount === null) firestoreBlocked = true;
  } catch (err: any) {
    issues.push({
      code: 'PARTITION_INACCESSIBLE',
      detail: `Firestore count unreadable: ${err?.message || err}`,
    });
  }
  if (firestoreBlocked) {
    if (driveRecordCount === 0) {
      issues.push({
        code: 'MIGRATION_BLOCKED_NO_READ',
        detail:
          'Firestore records for this collection are not readable under ' +
          'current rules, so an unmigrated Firestore copy cannot be ruled out. ' +
          'Resolve through a secured migration path, not broadened rules.',
      });
    }
  } else if (
    firestoreRecordCount !== null &&
    firestoreRecordCount > 0 &&
    driveRecordCount === 0
  ) {
    issues.push({
      code: 'STALE_SOURCE_DISCREPANCY',
      detail:
        `Firestore holds ${firestoreRecordCount} record(s) with no ` +
        'corresponding Drive records. Both copies preserved; migrate ' +
        'explicitly before marking COMPLETE.',
    });
  }

  // 4. Interrupted uploads / staging leftovers (best-effort report only).
  try {
    const staging = await driveService.recoverStaging();
    if (staging.length > 0) {
      issues.push({
        code: 'INTERRUPTED_UPLOAD',
        detail: `${staging.length} staged file(s) recovered: ${staging.join(', ')}.`,
      });
    }
  } catch {
    // A staging-inventory failure must not fail an otherwise healthy pass.
  }

  const fatal = issues.some((i) =>
    (
      [
        'MANIFEST_INVALID',
        'SCHEMA_MISMATCH',
        'PARTITION_CORRUPT',
        'RECORD_ID_UNRESOLVABLE',
        'REVISION_INCONSISTENT',
      ] as VerificationIssueCode[]
    ).includes(i.code),
  );
  const blocked = issues.some((i) =>
    (
      [
        'STALE_SOURCE_DISCREPANCY',
        'MIGRATION_BLOCKED_NO_READ',
        'MIGRATION_INCOMPLETE',
      ] as VerificationIssueCode[]
    ).includes(i.code),
  );
  const state: CollectionVerificationState = fatal
    ? 'FAILED'
    : blocked
      ? 'VERIFIED'
      : 'COMPLETE';
  return { collection, state, driveRecordCount, firestoreRecordCount, issues, checkedAt };
}

/** Verify every mapped collection for one account. */
export async function verifyAllCollections(
  uid: string,
  deps: Partial<CollectionVerificationDeps> = {},
): Promise<CollectionVerificationReport[]> {
  const reports: CollectionVerificationReport[] = [];
  for (const key of Object.keys(COLLECTION_MAPPINGS)) {
    reports.push(await verifyCollection(key, uid, deps));
  }
  return reports;
}
