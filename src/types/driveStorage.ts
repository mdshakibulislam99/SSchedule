/**
 * Google Drive storage schema for SSchedule.
 *
 * Self-contained by design: this module must not import from
 * `types/index.ts` or any Firebase module, so the schema, its
 * serialization and its validation can be unit-tested in a plain
 * node environment without pulling in the Firebase SDK.
 *
 * The envelope keeps record payloads separate from synchronization
 * metadata. Payloads are the existing application record types
 * (Task, ScheduleEvent, AIMessage, ...); this module never
 * interprets them.
 */

/** Current version of the Drive storage format itself. */
export const DRIVE_STORAGE_SCHEMA_VERSION = 1;

/** Lifecycle of the one-time Firestore → Drive content migration. */
export type MigrationState = 'NOT_STARTED' | 'IN_PROGRESS' | 'VERIFIED' | 'COMPLETE';

/**
 * Verification lifecycle for a single Drive-backed collection.
 *
 * - NOT_STARTED: integrity has never been checked on this device.
 * - IN_PROGRESS: a verification pass is currently running.
 * - VERIFIED: integrity checks passed — manifest valid, schema compatible,
 *   all readable partitions pass checksum, every record id resolves.
 * - COMPLETE: verified AND any stale-source discrepancy (Firestore copy
 *   with data not yet in Drive) has been resolved through the explicit,
 *   recoverable migration procedure.
 * - FAILED: the latest pass found an unrecovered problem (corrupt
 *   partition, schema mismatch, inaccessible records, ...). Details are
 *   reported; neither copy is deleted or overwritten.
 */
export type CollectionVerificationState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'VERIFIED'
  | 'COMPLETE'
  | 'FAILED';

export const INITIAL_MIGRATION_STATE: MigrationState = 'NOT_STARTED';

/**
 * Every record stored in Drive is wrapped in this envelope.
 * `id` reuses the existing stable application record ids
 * (task-*, conv-*, file-*, ...) — new ids are never minted for
 * entities that already exist in Firestore.
 */
export interface DriveRecordEnvelope<T = unknown> {
  id: string;
  entityType: string;
  schemaVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Set when the record is deleted (tombstone); payload may be dropped. */
  deletedAt?: string;
  /** Device id of the writer, for conflict attribution. */
  writerDeviceId: string;
  /** Revision this write was based on, for optimistic concurrency. */
  baseRevision?: number;
  payload: T;
}

/** Logical collections mapped into Drive. One entry per Firestore collection. */
export type DriveCollectionName =
  | 'tasks'
  | 'schedules'
  | 'notes'
  | 'courses'
  | 'resources'
  | 'conversations'
  | 'messages'
  | 'goals'
  | 'research'
  | 'ai-memory'
  | 'notifications'
  | 'quizzes'
  | 'flashcards'
  | 'annotations'
  | 'files'
  | 'settings'
  | 'reminders';

/** How a Firestore collection is laid out in Drive. */
export type PartitionStrategy =
  /** Many records packed into partition files (~100–500 records each). */
  | 'partitioned'
  /** One entity folder per record (conversation message chunks). */
  | 'per-entity-folder'
  /** One small document per record id (settings / metrics). */
  | 'single-document';

/** Maps one Firestore collection to its Drive location. */
export interface CollectionMapping {
  /** Firestore path template, e.g. 'users/{uid}/tasks'. */
  firestorePath: string;
  /** Logical folder under `data/` (or `files/` for binaries). */
  driveFolder: string;
  entityType: string;
  /** Field holding the stable application record id. */
  stableIdField: string;
  partitionStrategy: PartitionStrategy;
  /** Why the mapping deviates from the default layout, when it does. */
  rationale?: string;
}

/**
 * Mapping for every user-owned Firestore collection discovered in the
 * codebase, plus the profile/metrics documents. Additional
 * collections added later MUST be added here — never silently
 * dropped.
 */
export const COLLECTION_MAPPINGS: Record<string, CollectionMapping> = {
  tasks: {
    firestorePath: 'users/{uid}/tasks',
    driveFolder: 'data/tasks',
    entityType: 'task',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
  },
  schedule: {
    firestorePath: 'users/{uid}/schedule',
    driveFolder: 'data/schedules',
    entityType: 'schedule-event',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
  },
  goals: {
    firestorePath: 'users/{uid}/goals',
    driveFolder: 'data/goals',
    entityType: 'goal',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale: 'Firestore collection not in the original layout sketch; preserved so no data is dropped.',
  },
  courses: {
    firestorePath: 'users/{uid}/courses',
    driveFolder: 'data/courses',
    entityType: 'course',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
  },
  resources: {
    firestorePath: 'users/{uid}/resources',
    driveFolder: 'data/resources',
    entityType: 'course-resource',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale:
      'Resource bodies (content/denseContext) are stored as payload; the 200k-char extracted text stays in ai-indexes/extracted-text, never in the manifest.',
  },
  files: {
    firestorePath: 'users/{uid}/files',
    driveFolder: 'data/files',
    entityType: 'study-file',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale:
      'This is file *metadata*. Binary payloads live under files/originals, files/attachments and files/imported.',
  },
  notes: {
    firestorePath: 'users/{uid}/notes',
    driveFolder: 'data/notes',
    entityType: 'study-note',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
  },
  research: {
    firestorePath: 'users/{uid}/research',
    driveFolder: 'data/research',
    entityType: 'research-item',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale: 'Firestore collection not in the original layout sketch; preserved so no data is dropped.',
  },
  aiMemory: {
    firestorePath: 'users/{uid}/aiMemory',
    driveFolder: 'data/ai-memory',
    entityType: 'ai-memory-item',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale: 'Firestore collection not in the original layout sketch; preserved so no data is dropped.',
  },
  conversations: {
    firestorePath: 'users/{uid}/conversations',
    driveFolder: 'data/conversations',
    entityType: 'ai-conversation',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale: 'Metadata only — the embedded messages array is stored separately under data/messages/{conversationId}/.',
  },
  messages: {
    firestorePath: 'users/{uid}/conversations/{id}/messages',
    driveFolder: 'data/messages',
    entityType: 'ai-message',
    stableIdField: 'id',
    partitionStrategy: 'per-entity-folder',
    rationale:
      'AIMessage[] is embedded in AIConversation today. Chunking messages per conversation (data/messages/{conversationId}/part-000001.json) means a long history never rewrites one oversized file.',
  },
  notifications: {
    firestorePath: 'users/{uid}/notifications',
    driveFolder: 'data/notifications',
    entityType: 'notification-item',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale: 'Firestore collection not in the original layout sketch; preserved so no data is dropped.',
  },
  quizzes: {
    firestorePath: 'users/{uid}/quizzes',
    driveFolder: 'data/quizzes',
    entityType: 'course-quiz',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale: 'Firestore collection not in the original layout sketch; preserved so no data is dropped.',
  },
  flashcards: {
    firestorePath: 'users/{uid}/flashcards',
    driveFolder: 'data/flashcards',
    entityType: 'course-flashcard',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale: 'Firestore collection not in the original layout sketch; preserved so no data is dropped.',
  },
  annotations: {
    firestorePath: 'users/{uid}/annotations',
    driveFolder: 'data/annotations',
    entityType: 'resource-annotation',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale: 'Firestore collection not in the original layout sketch; preserved so no data is dropped.',
  },
  settings: {
    firestorePath: 'users/{uid} (profile, notificationSettings, aiConfig, theme, metrics/current)',
    driveFolder: 'data/settings',
    entityType: 'app-settings',
    stableIdField: 'id',
    partitionStrategy: 'single-document',
    rationale:
      'Small, independently-versioned documents (profile, notification settings, AI provider config, metrics) — one file per document id.',
  },
  reminders: {
    firestorePath: 'users/{uid}/tasks reminder state + top-level scheduledPushes',
    driveFolder: 'data/reminders',
    entityType: 'reminder',
    stableIdField: 'id',
    partitionStrategy: 'partitioned',
    rationale: 'Scheduled reminder/alarm state (scheduledPushes entries and task reminder state).',
  },
};

/** Per-collection state inside the manifest — ids and counts only, never content. */
export interface DriveCollectionState {
  driveFolderId: string;
  partitionFileIds: string[];
  recordCount: number;
  /** Checksum of the serialized record set, for recovery/corruption detection. */
  checksum: string;
  updatedAt: string;
}

export interface DriveSystemFolderIds {
  rootId: string;
  systemId: string;
  tombstonesId: string;
  conflictsId: string;
  syncCheckpointsId: string;
  stagingId: string;
  collectionMappingsId: string;
}

/**
 * `_system/manifest.json` — describes the whole structure. It holds
 * folder ids, partition file ids, record counts and checksums. It
 * NEVER holds record payloads or extracted document text.
 */
export interface DriveManifest {
  schemaVersion: number;
  revision: number;
  generatedAt: string;
  generatedBy: { deviceId: string; appVersion: string };
  rootFolderId: string;
  rootFolderName: string;
  system: DriveSystemFolderIds;
  collections: Partial<Record<DriveCollectionName, DriveCollectionState>>;
  fileLocations: {
    originalsFolderId: string;
    attachmentsFolderId: string;
    importedFolderId: string;
  };
  aiIndexLocations: {
    manifestsFolderId: string;
    extractedTextFolderId: string;
    chunksFolderId: string;
    embeddingsFolderId: string;
  };
  backupLocations: {
    snapshotsFolderId: string;
    exportsFolderId: string;
  };
  migrationState: MigrationState;
}

/** `_system/schema-version.json` */
export interface SchemaMigration {
  from: number;
  to: number;
  name: string;
  appliedAt?: string;
}

export interface DriveSchemaVersionDocument {
  schemaVersion: number;
  supportedVersions: number[];
  migrations: SchemaMigration[];
  updatedAt: string;
}

/**
 * `_system/migration-state.json`. Folder creation never advances
 * this state — a fresh structure always starts NOT_STARTED.
 */
export interface DriveMigrationStateDocument {
  state: MigrationState;
  startedAt: string | null;
  completedAt: string | null;
  collections: Record<string, MigrationState>;
  lastError: string | null;
  updatedAt: string;
}

/** A partition file: a batch of envelopes for one collection. */
export interface DrivePartition<T = unknown> {
  partitionId: string;
  collection: string;
  index: number;
  schemaVersion: number;
  recordCount: number;
  records: DriveRecordEnvelope<T>[];
  checksum: string;
  updatedAt: string;
}

/** Minimal reference to a Drive file (no content). */
export interface DriveFileRef {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
  size?: string;
}

/** Reference to a binary stored under files/ or ai-indexes/. */
export interface DriveFileLocation {
  driveFileId: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  checksum?: string;
  revision: number;
  uploadedAt: string;
}

/** Phase-Eight readiness: AI index metadata for one source document. */
export interface AIIndexManifestEntry {
  /** StudyFile id this index describes. */
  fileId: string;
  /** Drive id of the original binary under files/originals. */
  sourceFileDriveId?: string;
  /** Revision of the source document the index was built from. */
  sourceRevision: number;
  extractedTextFileId?: string;
  chunksFileIds: string[];
  embeddingsFileId?: string;
  /** Model that produced the index — used to detect stale indexes. */
  model: string;
  indexedAt: string;
  checksum: string;
  charCount: number;
}

export interface ExtractedTextIndex {
  fileId: string;
  textFileId: string;
  charCount: number;
  checksum: string;
  indexedAt: string;
}

/** Result of a successful (idempotent) initialization. */
export interface DriveInitializationResult {
  /** 'created' when folders were created, 'verified' when everything already existed. */
  status: 'created' | 'verified';
  rootFolderId: string;
  rootFolderName: string;
  /** Logical folder path → Drive folder id. */
  folders: Record<string, string>;
  manifest: DriveManifest;
  migrationState: MigrationState;
  createdFolderCount: number;
}

/** Result of `verifyStorage()`. */
export interface StorageVerificationResult {
  valid: boolean;
  issues: string[];
  checkedAt: string;
}

/** Aggregate status of the Drive storage for the signed-in user. */
export interface DriveStorageStatus {
  initialized: boolean;
  connected: boolean;
  email?: string;
  rootFolderId: string | null;
  rootFolderName: string;
  schemaVersion: number | null;
  migrationState: MigrationState;
  revision: number;
  folderCount: number;
  lastCheckedAt?: string;
}

// ---------------------------------------------------------------------------
// Serialization / validation utilities
// ---------------------------------------------------------------------------

/**
 * Per-collection Drive rollout gate.
 *
 * A collection is Drive-authoritative for an account ONLY when BOTH hold:
 *  1. the account is an explicit Drive pilot (isDrivePilotEnabled), AND
 *  2. this collection is listed in DRIVE_ROLLOUT_ENABLED_COLLECTIONS.
 *
 * Wiring an adapter method for a collection does NOT enable it — this list
 * is the single switch. `tasks` ships enabled (the proven pilot); every
 * other collection stays on the legacy Firestore path until its adapter is
 * wired, tested, and explicitly added here.
 */
export const DRIVE_ROLLOUT_ENABLED_COLLECTIONS: ReadonlySet<string> = new Set([
  'tasks',
]);

/**
 * True when a collection's content must be read from / written to the
 * user's own Google Drive. `isPilot` is the per-account opt-in result,
 * passed in so this module stays pure and unit-testable.
 */
export function isCollectionDriveEnabled(
  collection: string,
  uid: string | null | undefined,
  isPilot: boolean,
): boolean {
  if (!uid || !isPilot) return false;
  return DRIVE_ROLLOUT_ENABLED_COLLECTIONS.has(collection);
}


const DEVICE_ID_KEY = 'sschedule_device_id';

/** Stable per-install device id used as `writerDeviceId` on envelopes. */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-ephemeral-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Deterministic FNV-1a checksum over a string. Stable across
 * devices and sessions, which is what recovery detection needs.
 */
export function computeChecksum(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Builds an envelope around an existing record, preserving its stable id. */
export function createRecordEnvelope<T>(
  payload: T & { id: string },
  opts: {
    entityType: string;
    deviceId?: string;
    createdAt?: string;
    revision?: number;
    baseRevision?: number;
  },
): DriveRecordEnvelope<T> {
  const now = new Date().toISOString();
  return {
    id: payload.id,
    entityType: opts.entityType,
    schemaVersion: DRIVE_STORAGE_SCHEMA_VERSION,
    revision: opts.revision ?? 1,
    createdAt: opts.createdAt ?? now,
    updatedAt: now,
    writerDeviceId: opts.deviceId ?? getDeviceId(),
    baseRevision: opts.baseRevision,
    payload,
  };
}

/** Structural validation for a parsed envelope. */
export function validateEnvelope(raw: unknown): raw is DriveRecordEnvelope {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as DriveRecordEnvelope;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.entityType === 'string' &&
    typeof candidate.schemaVersion === 'number' &&
    typeof candidate.revision === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.writerDeviceId === 'string' &&
    'payload' in candidate &&
    candidate.payload !== undefined
  );
}

/**
 * Forward-compatibility shim: accepts envelopes written by older
 * schema versions and fills missing optional fields instead of
 * rejecting them. Future schema versions add explicit migrations to
 * `DriveSchemaVersionDocument.migrations`.
 */
export function migrateEnvelope<T>(raw: Record<string, any>): DriveRecordEnvelope<T> {
  const now = new Date().toISOString();
  return {
    id: String(raw.id ?? ''),
    entityType: String(raw.entityType ?? 'unknown'),
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : DRIVE_STORAGE_SCHEMA_VERSION,
    revision: typeof raw.revision === 'number' ? raw.revision : 1,
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? now),
    deletedAt: raw.deletedAt ? String(raw.deletedAt) : undefined,
    writerDeviceId: String(raw.writerDeviceId ?? 'dev-unknown'),
    baseRevision: typeof raw.baseRevision === 'number' ? raw.baseRevision : undefined,
    payload: (raw.payload ?? {}) as T,
  };
}

/** Builds an initial migration-state document — always NOT_STARTED. */
export function createInitialMigrationStateDocument(): DriveMigrationStateDocument {
  const collections: Record<string, MigrationState> = {};
  for (const key of Object.keys(COLLECTION_MAPPINGS)) {
    collections[key] = INITIAL_MIGRATION_STATE;
  }
  return {
    state: INITIAL_MIGRATION_STATE,
    startedAt: null,
    completedAt: null,
    collections,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
}
