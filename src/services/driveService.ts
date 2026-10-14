/**
 * Google Drive storage initialization service.
 *
 * Builds the SScheduleData structure in the signed-in
 * user's own Drive. Initialization is idempotent:
 *  - The root folder is resolved by name (SScheduleData,
 *    falling back to the legacy SSfilesdata folder from
 *    the earlier foundation build) and reused — never
 *    duplicated.
 *  - Every child folder is verified (name + parent +
 *    folder MIME type) before reuse, and only missing
 *    folders are created.
 *  - System documents (manifest, schema-version,
 *    migration-state) are created once and never
 *    reset. A freshly created structure always starts
 *    in the NOT_STARTED migration state.
 *
 * Writes use a staging-then-commit protocol so an
 * interrupted initialization can be detected and
 * resumed safely (no multi-file transactions are
 * claimed).
 */

import {
  COLLECTION_MAPPINGS,
  DRIVE_STORAGE_SCHEMA_VERSION,
  DriveFileRef,
  DriveInitializationResult,
  DriveManifest,
  DriveMigrationStateDocument,
  DrivePartition,
  DriveRecordEnvelope,
  DriveSchemaVersionDocument,
  DriveStorageStatus,
  DriveSystemFolderIds,
  MigrationState,
  StorageVerificationResult,
  createInitialMigrationStateDocument,
  getDeviceId,
} from '../types/driveStorage';
import { CURRENT_APP_VERSION } from '../utils/version';
import {
  DriveApi,
  DriveApiError,
  DRIVE_FOLDER_MIME,
  driveApi as liveDriveApi,
} from '../lib/driveApi';
import {
  deserializePartition,
  partitionFileName,
  serializePartition,
} from './drivePartition';

/** Current root folder name (spec-defined). */
export const ROOT_FOLDER_NAME = 'SScheduleData';
/** Root folder name used by the earlier foundation build. */
export const LEGACY_ROOT_FOLDER_NAME = 'SSfilesdata';

/**
 * The complete logical folder tree. Each entry's parent
 * must appear earlier in the list.
 */
export const DRIVE_FOLDER_TREE: Array<{ path: string; parent: string | null }> = [
  { path: '_system', parent: null },
  { path: '_system/tombstones', parent: '_system' },
  { path: '_system/conflicts', parent: '_system' },
  { path: '_system/sync-checkpoints', parent: '_system' },
  { path: '_system/staging', parent: '_system' },
  { path: 'data', parent: null },
  { path: 'data/tasks', parent: 'data' },
  { path: 'data/schedules', parent: 'data' },
  { path: 'data/notes', parent: 'data' },
  { path: 'data/courses', parent: 'data' },
  { path: 'data/resources', parent: 'data' },
  { path: 'data/conversations', parent: 'data' },
  { path: 'data/messages', parent: 'data' },
  { path: 'data/goals', parent: 'data' },
  { path: 'data/research', parent: 'data' },
  { path: 'data/ai-memory', parent: 'data' },
  { path: 'data/notifications', parent: 'data' },
  { path: 'data/quizzes', parent: 'data' },
  { path: 'data/flashcards', parent: 'data' },
  { path: 'data/annotations', parent: 'data' },
  { path: 'data/files', parent: 'data' },
  { path: 'data/settings', parent: 'data' },
  { path: 'data/reminders', parent: 'data' },
  { path: 'data/collection-mappings', parent: 'data' },
  { path: 'files', parent: null },
  { path: 'files/originals', parent: 'files' },
  { path: 'files/attachments', parent: 'files' },
  { path: 'files/imported', parent: 'files' },
  { path: 'ai-indexes', parent: null },
  { path: 'ai-indexes/manifests', parent: 'ai-indexes' },
  { path: 'ai-indexes/extracted-text', parent: 'ai-indexes' },
  { path: 'ai-indexes/chunks', parent: 'ai-indexes' },
  { path: 'ai-indexes/embeddings', parent: 'ai-indexes' },
  { path: 'ai-indexes/page-index', parent: 'ai-indexes' },
  { path: 'backups', parent: null },
  { path: 'backups/snapshots', parent: 'backups' },
  { path: 'backups/exports', parent: 'backups' },
];

/** Minimal metadata persisted to Firestore — never OAuth secrets. */
export interface DriveMetadataSnapshot {
  connected: boolean;
  email?: string;
  folderId: string;
  folderName: string;
  schemaVersion?: number;
  migrationStatus?: MigrationState;
  revision?: number;
  storageRole: 'legacy' | 'pilot';
  updatedAt: string;
}

export type MetadataSink = (
  firebaseUserId: string,
  snapshot: DriveMetadataSnapshot,
) => Promise<void>;

export interface DriveServiceOptions {
  api: DriveApi;
  appVersion?: string;
  deviceId?: string;
  /** Persists the minimal account metadata to Firebase. Injected for tests. */
  persistMetadata?: MetadataSink;
}

export interface DriveService {
  initializeDriveStorage(firebaseUserId?: string): Promise<DriveInitializationResult>;
  verifyDriveStorage(): Promise<StorageVerificationResult>;
  getDriveStorageStatus(): Promise<DriveStorageStatus>;
  readManifest(): Promise<DriveManifest | null>;
  writeManifest(manifest: DriveManifest): Promise<DriveManifest>;
  readSchemaVersion(): Promise<DriveSchemaVersionDocument | null>;
  readMigrationState(): Promise<DriveMigrationStateDocument | null>;
  updateMigrationState(
    updater: (doc: DriveMigrationStateDocument) => DriveMigrationStateDocument,
  ): Promise<DriveMigrationStateDocument>;
  listPartitionFiles(collection: string): Promise<DriveFileRef[]>;
  readPartition(collection: string, fileId: string): Promise<DrivePartition>;
  writePartition(partition: DrivePartition): Promise<void>;
  listDataRecords<T>(collection: string): Promise<DriveRecordEnvelope<T>[]>;
  /**
   * Writes (or updates) a JSON file inside a logical
   * folder of the SScheduleData tree — used to preserve
   * rejected versions in _system/conflicts/.
   */
  writeFileToFolder(
    folderPath: string,
    fileName: string,
    content: unknown,
  ): Promise<DriveFileRef>;
  /**
   * Lists files in a named Drive folder, optionally filtered by a
   * name-contains clause (used by the per-page document index mirror).
   */
  listFolderFiles(folderPath: string, nameContains?: string): Promise<DriveFileRef[]>;
  /** Downloads the raw text of any Drive file by id. */
  readFileText(fileId: string): Promise<string>;
  recoverStaging(): Promise<string[]>;
}

const SYSTEM_MANIFEST = 'manifest.json';
const SYSTEM_SCHEMA_VERSION = 'schema-version.json';
const SYSTEM_MIGRATION_STATE = 'migration-state.json';

async function listChildFolders(
  api: DriveApi,
  parentId: string,
): Promise<Map<string, DriveFileRef>> {
  const res = await api.listFiles(
    `mimeType = '${DRIVE_FOLDER_MIME}' and '${parentId}' in parents`,
    { pageSize: 200 },
  );
  return new Map(res.files.map((f) => [f.name, f]));
}

async function findFileByName(
  api: DriveApi,
  parentId: string,
  name: string,
): Promise<DriveFileRef | null> {
  const res = await api.listFiles(
    `name = '${name}' and '${parentId}' in parents`,
    { pageSize: 1 },
  );
  return res.files[0] ?? null;
}

async function findAnyChildByName(
  api: DriveApi,
  parentId: string,
  name: string,
): Promise<DriveFileRef | null> {
  // No MIME filter — catches regular files that would
  // collide with a folder name.
  const res = await api.listFiles(
    `name = '${name}' and '${parentId}' in parents`,
    { pageSize: 10 },
  );
  return res.files.find((f) => f.mimeType !== DRIVE_FOLDER_MIME) ?? null;
}

async function readSystemDocument<T>(
  api: DriveApi,
  systemFolderId: string,
  name: string,
): Promise<T | null> {
  const file = await findFileByName(api, systemFolderId, name);
  if (!file) return null;
  const text = await api.downloadText(file.id);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DriveApiError(
      400,
      `System document ${name} exists but is not valid JSON.`,
    );
  }
}

async function writeSystemDocument(
  api: DriveApi,
  systemFolderId: string,
  name: string,
  content: unknown,
): Promise<DriveFileRef> {
  const existing = await findFileByName(api, systemFolderId, name);
  if (existing) return api.updateJson(existing.id, content);
  return api.uploadJson(name, systemFolderId, content);
}

export function createDriveService(options: DriveServiceOptions): DriveService {
  const { api } = options;
  const appVersion = options.appVersion ?? 'unknown';
  const deviceId = options.deviceId ?? getDeviceId();
  const persistMetadata = options.persistMetadata;

  let cachedRoot: DriveFileRef | null = null;
  let cachedFolderIds: Record<string, string> | null = null;

  async function resolveRootFolder(): Promise<{
    folder: DriveFileRef;
    status: 'created' | 'reused';
  }> {
    // Preferred root: the spec-defined SScheduleData folder.
    const existing = await findFileByName(api, 'root', ROOT_FOLDER_NAME);
    if (existing) {
      if (existing.mimeType && existing.mimeType !== DRIVE_FOLDER_MIME) {
        throw new DriveApiError(
          400,
          `"${ROOT_FOLDER_NAME}" exists in your Drive but is not a folder. Rename or remove it, then reconnect.`,
        );
      }
      return { folder: existing, status: 'reused' };
    }
    // Reuse the root created by the earlier foundation build
    // (named SSfilesdata) instead of creating a second root.
    const legacy = await findFileByName(api, 'root', LEGACY_ROOT_FOLDER_NAME);
    if (legacy) {
      if (legacy.mimeType && legacy.mimeType !== DRIVE_FOLDER_MIME) {
        throw new DriveApiError(
          400,
          `"${LEGACY_ROOT_FOLDER_NAME}" exists in your Drive but is not a folder. Rename or remove it, then reconnect.`,
        );
      }
      return { folder: legacy, status: 'reused' };
    }
    const created = await api.createFolder(ROOT_FOLDER_NAME, 'root');
    return { folder: created, status: 'created' };
  }

  async function ensureFolderTree(): Promise<{
    folderIds: Record<string, string>;
    createdCount: number;
  }> {
    const root = cachedRoot ?? (await resolveRootFolder()).folder;
    cachedRoot = root;

    const folderIds: Record<string, string> = { '': root.id };
    const childCache = new Map<string, Map<string, DriveFileRef>>();
    let createdCount = 0;

    for (const spec of DRIVE_FOLDER_TREE) {
      const parentId = spec.parent ? folderIds[spec.parent] : root.id;
      const name = spec.path.split('/').pop() as string;

      let siblings = childCache.get(parentId);
      if (!siblings) {
        siblings = await listChildFolders(api, parentId);
        childCache.set(parentId, siblings);
      }

      let folder = siblings.get(name);
      if (!folder) {
        // A regular file with this name would collide with the folder.
        const collision = await findAnyChildByName(api, parentId, name);
        if (collision) {
          throw new DriveApiError(
            400,
            `"${name}" already exists in this Drive folder as a file, not a folder. Rename or remove it, then reconnect.`,
          );
        }
        folder = await api.createFolder(name, parentId);
        siblings.set(name, folder);
        createdCount++;
      } else if (folder.mimeType && folder.mimeType !== DRIVE_FOLDER_MIME) {
        throw new DriveApiError(
          400,
          `"${spec.path}" resolved to a non-folder (mimeType ${folder.mimeType}).`,
        );
      }
      folderIds[spec.path] = folder.id;
    }

    cachedFolderIds = folderIds;
    return { folderIds, createdCount };
  }

  function systemFolderIds(folderIds: Record<string, string>): DriveSystemFolderIds {
    return {
      rootId: folderIds[''],
      systemId: folderIds['_system'],
      tombstonesId: folderIds['_system/tombstones'],
      conflictsId: folderIds['_system/conflicts'],
      syncCheckpointsId: folderIds['_system/sync-checkpoints'],
      stagingId: folderIds['_system/staging'],
      collectionMappingsId: folderIds['data/collection-mappings'],
    };
  }

  function createInitialManifest(
    root: DriveFileRef,
    folderIds: Record<string, string>,
  ): DriveManifest {
    return {
      schemaVersion: DRIVE_STORAGE_SCHEMA_VERSION,
      revision: 1,
      generatedAt: new Date().toISOString(),
      generatedBy: { deviceId, appVersion },
      rootFolderId: root.id,
      rootFolderName: root.name,
      system: systemFolderIds(folderIds),
      collections: {},
      fileLocations: {
        originalsFolderId: folderIds['files/originals'],
        attachmentsFolderId: folderIds['files/attachments'],
        importedFolderId: folderIds['files/imported'],
      },
      aiIndexLocations: {
        manifestsFolderId: folderIds['ai-indexes/manifests'],
        extractedTextFolderId: folderIds['ai-indexes/extracted-text'],
        chunksFolderId: folderIds['ai-indexes/chunks'],
        embeddingsFolderId: folderIds['ai-indexes/embeddings'],
      },
      backupLocations: {
        snapshotsFolderId: folderIds['backups/snapshots'],
        exportsFolderId: folderIds['backups/exports'],
      },
      migrationState: 'NOT_STARTED',
    };
  }

  async function persistAccountMetadata(
    firebaseUserId: string | undefined,
    manifest: DriveManifest,
    migrationState: MigrationState,
  ): Promise<void> {
    if (!persistMetadata || !firebaseUserId) return;
    await persistMetadata(firebaseUserId, {
      connected: true,
      folderId: manifest.rootFolderId,
      folderName: manifest.rootFolderName,
      schemaVersion: manifest.schemaVersion,
      migrationStatus: migrationState,
      revision: manifest.revision,
      storageRole: 'pilot',
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    async initializeDriveStorage(firebaseUserId?: string): Promise<DriveInitializationResult> {
      // 1. Resolve (or create) the root — never duplicated.
      const rootResolution = await resolveRootFolder();
      cachedRoot = rootResolution.folder;

      // 2. Ensure the full folder tree, reusing verified folders.
      const { folderIds, createdCount } = await ensureFolderTree();

      const systemId = folderIds['_system'];

      // 3. Manifest — create once, then only refresh folder ids.
      let manifest = await readSystemDocument<DriveManifest>(api, systemId, SYSTEM_MANIFEST);
      if (!manifest) {
        manifest = createInitialManifest(rootResolution.folder, folderIds);
        await writeSystemDocument(api, systemId, SYSTEM_MANIFEST, manifest);
      } else {
        // Refresh any folder ids that changed and bump the
        // revision only when something actually changed.
        const refreshed: DriveManifest = {
          ...manifest,
          system: systemFolderIds(folderIds),
          fileLocations: {
            originalsFolderId: folderIds['files/originals'],
            attachmentsFolderId: folderIds['files/attachments'],
            importedFolderId: folderIds['files/imported'],
          },
          aiIndexLocations: {
            manifestsFolderId: folderIds['ai-indexes/manifests'],
            extractedTextFolderId: folderIds['ai-indexes/extracted-text'],
            chunksFolderId: folderIds['ai-indexes/chunks'],
            embeddingsFolderId: folderIds['ai-indexes/embeddings'],
          },
          backupLocations: {
            snapshotsFolderId: folderIds['backups/snapshots'],
            exportsFolderId: folderIds['backups/exports'],
          },
        };
        if (JSON.stringify(refreshed) !== JSON.stringify(manifest)) {
          refreshed.revision = manifest.revision + 1;
          refreshed.generatedAt = new Date().toISOString();
          manifest = refreshed;
          await writeSystemDocument(api, systemId, SYSTEM_MANIFEST, manifest);
        }
      }

      // 4. Schema-version document — created once.
      let schemaDoc = await readSystemDocument<DriveSchemaVersionDocument>(
        api,
        systemId,
        SYSTEM_SCHEMA_VERSION,
      );
      if (!schemaDoc) {
        schemaDoc = {
          schemaVersion: DRIVE_STORAGE_SCHEMA_VERSION,
          supportedVersions: [DRIVE_STORAGE_SCHEMA_VERSION],
          migrations: [],
          updatedAt: new Date().toISOString(),
        };
        await writeSystemDocument(api, systemId, SYSTEM_SCHEMA_VERSION, schemaDoc);
      }

      // 5. Migration state — created once, always NOT_STARTED
      //    for a new structure, and never auto-advanced.
      let migrationDoc = await readSystemDocument<DriveMigrationStateDocument>(
        api,
        systemId,
        SYSTEM_MIGRATION_STATE,
      );
      if (!migrationDoc) {
        migrationDoc = createInitialMigrationStateDocument();
        await writeSystemDocument(api, systemId, SYSTEM_MIGRATION_STATE, migrationDoc);
      }

      // 6. Collection mapping documents — one per discovered
      //    collection, created only when missing.
      for (const [collection, mapping] of Object.entries(COLLECTION_MAPPINGS)) {
        const mappingName = `${collection}.json`;
        const existing = await findFileByName(
          api,
          folderIds['data/collection-mappings'],
          mappingName,
        );
        if (!existing) {
          await api.uploadJson(
            mappingName,
            folderIds['data/collection-mappings'],
            {
              collection,
              ...mapping,
              schemaVersion: DRIVE_STORAGE_SCHEMA_VERSION,
              mappedAt: new Date().toISOString(),
            },
          );
        }
      }

      // 7. Resume any interrupted staging writes.
      await this.recoverStaging();

      // 8. Persist minimal account metadata to Firebase
      //    (root folder id, schema version, migration status).
      await persistAccountMetadata(firebaseUserId, manifest, migrationDoc.state);

      return {
        status: rootResolution.status === 'created' && createdCount > 0
          ? 'created'
          : 'verified',
        rootFolderId: rootResolution.folder.id,
        rootFolderName: rootResolution.folder.name,
        folders: folderIds,
        manifest,
        migrationState: migrationDoc.state,
        createdFolderCount: createdCount,
      };
    },

    async verifyDriveStorage(): Promise<StorageVerificationResult> {
      const issues: string[] = [];
      const manifest = await this.readManifest();
      if (!manifest) {
        return {
          valid: false,
          issues: ['manifest.json is missing from _system.'],
          checkedAt: new Date().toISOString(),
        };
      }

      // Root folder must still exist and be a folder.
      try {
        const root = await api.getFile(manifest.rootFolderId);
        if (root.mimeType && root.mimeType !== DRIVE_FOLDER_MIME) {
          issues.push(
            `Root folder ${manifest.rootFolderId} is not a folder (mimeType ${root.mimeType}).`,
          );
        }
      } catch (err) {
        issues.push(`Root folder ${manifest.rootFolderId} is no longer accessible: ${(err as Error).message}`);
      }

      // Every system folder id in the manifest must resolve.
      const systemEntries: Array<[string, string]> = [
        ['_system', manifest.system.systemId],
        ['_system/tombstones', manifest.system.tombstonesId],
        ['_system/conflicts', manifest.system.conflictsId],
        ['_system/sync-checkpoints', manifest.system.syncCheckpointsId],
        ['_system/staging', manifest.system.stagingId],
        ['files/originals', manifest.fileLocations.originalsFolderId],
        ['files/attachments', manifest.fileLocations.attachmentsFolderId],
        ['files/imported', manifest.fileLocations.importedFolderId],
        ['ai-indexes/manifests', manifest.aiIndexLocations.manifestsFolderId],
        ['ai-indexes/extracted-text', manifest.aiIndexLocations.extractedTextFolderId],
        ['ai-indexes/chunks', manifest.aiIndexLocations.chunksFolderId],
        ['ai-indexes/embeddings', manifest.aiIndexLocations.embeddingsFolderId],
        ['backups/snapshots', manifest.backupLocations.snapshotsFolderId],
        ['backups/exports', manifest.backupLocations.exportsFolderId],
      ];
      for (const [logicalPath, folderId] of systemEntries) {
        try {
          const folder = await api.getFile(folderId);
          if (folder.mimeType && folder.mimeType !== DRIVE_FOLDER_MIME) {
            issues.push(`${logicalPath} (${folderId}) is not a folder.`);
          }
        } catch (err) {
          issues.push(`${logicalPath} (${folderId}) is no longer accessible: ${(err as Error).message}`);
        }
      }

      if (manifest.schemaVersion !== DRIVE_STORAGE_SCHEMA_VERSION) {
        issues.push(
          `Manifest schemaVersion ${manifest.schemaVersion} does not match the supported version ${DRIVE_STORAGE_SCHEMA_VERSION}.`,
        );
      }

      return {
        valid: issues.length === 0,
        issues,
        checkedAt: new Date().toISOString(),
      };
    },

    async getDriveStorageStatus(): Promise<DriveStorageStatus> {
      const manifest = await this.readManifest();
      const migrationDoc = await this.readMigrationState();
      return {
        initialized: Boolean(manifest),
        connected: Boolean(cachedRoot),
        email: undefined,
        rootFolderId: manifest?.rootFolderId ?? cachedRoot?.id ?? null,
        rootFolderName: manifest?.rootFolderName ?? cachedRoot?.name ?? ROOT_FOLDER_NAME,
        schemaVersion: manifest?.schemaVersion ?? null,
        migrationState: migrationDoc?.state ?? manifest?.migrationState ?? 'NOT_STARTED',
        revision: manifest?.revision ?? 0,
        folderCount: DRIVE_FOLDER_TREE.length,
        lastCheckedAt: new Date().toISOString(),
      };
    },

    async readManifest(): Promise<DriveManifest | null> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      return readSystemDocument<DriveManifest>(api, folderIds['_system'], SYSTEM_MANIFEST);
    },

    async writeManifest(manifest: DriveManifest): Promise<DriveManifest> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      const systemId = folderIds['_system'];
      const stagingId = folderIds['_system/staging'];
      const next: DriveManifest = {
        ...manifest,
        revision: manifest.revision + 1,
        generatedAt: new Date().toISOString(),
      };

      // Recoverable protocol: stage the new revision first, then
      // patch the live document, then drop the staged copy. An
      // interrupted run leaves the staged copy behind and
      // recoverStaging() completes or discards it.
      const staged = await api.uploadJson(
        `${SYSTEM_MANIFEST}.staged`,
        stagingId,
        next,
      );
      const existing = await findFileByName(api, systemId, SYSTEM_MANIFEST);
      if (existing) {
        await api.updateJson(existing.id, next);
      } else {
        await api.uploadJson(SYSTEM_MANIFEST, systemId, next);
      }
      await api.deleteFile(staged.id);
      cachedFolderIds = folderIds;
      return next;
    },

    async readSchemaVersion(): Promise<DriveSchemaVersionDocument | null> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      return readSystemDocument<DriveSchemaVersionDocument>(
        api,
        folderIds['_system'],
        SYSTEM_SCHEMA_VERSION,
      );
    },

    async readMigrationState(): Promise<DriveMigrationStateDocument | null> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      return readSystemDocument<DriveMigrationStateDocument>(
        api,
        folderIds['_system'],
        SYSTEM_MIGRATION_STATE,
      );
    },

    async updateMigrationState(
      updater: (doc: DriveMigrationStateDocument) => DriveMigrationStateDocument,
    ): Promise<DriveMigrationStateDocument> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      const current =
        (await this.readMigrationState()) ?? createInitialMigrationStateDocument();
      const next = { ...updater(current), updatedAt: new Date().toISOString() };
      await writeSystemDocument(api, folderIds['_system'], SYSTEM_MIGRATION_STATE, next);
      return next;
    },

    async listPartitionFiles(collection: string): Promise<DriveFileRef[]> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      const mapping = COLLECTION_MAPPINGS[collection];
      if (!mapping) {
        throw new DriveApiError(400, `Unknown collection: ${collection}`);
      }
      const folderId = folderIds[mapping.driveFolder];
      const res = await api.listFiles(
        `name contains '.json' and '${folderId}' in parents`,
        { pageSize: 200 },
      );
      return res.files;
    },

    async readPartition(collection: string, fileId: string): Promise<DrivePartition> {
      const text = await api.downloadText(fileId);
      return deserializePartition(text);
    },

    async writePartition(partition: DrivePartition): Promise<void> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      const mapping = COLLECTION_MAPPINGS[partition.collection];
      if (!mapping) {
        throw new DriveApiError(400, `Unknown collection: ${partition.collection}`);
      }
      const targetFolderId = folderIds[mapping.driveFolder];
      const stagingId = folderIds['_system/staging'];
      const fileName = partitionFileName(partition.index);

      // Stage, then move into the collection folder. The move
      // is a single PATCH (addParents/removeParents), so the
      // partition appears in exactly one place.
      const staged = await api.uploadJson(
        `${partition.collection}__${fileName}`,
        stagingId,
        JSON.parse(serializePartition(partition)),
      );
      await api.moveFile(staged.id, [targetFolderId], [stagingId]);
    },

    async listDataRecords<T>(collection: string) {
      const partitions: DrivePartition<T>[] = [];
      const files = await this.listPartitionFiles(collection);
      for (const file of files) {
        // Corrupted partitions are surfaced, never silently dropped.
        const partition = (await this.readPartition(
          collection,
          file.id,
        )) as DrivePartition<T>;
        partitions.push(partition);
      }
      return partitions.flatMap((p) => p.records);
    },

    async writeFileToFolder(
      folderPath: string,
      fileName: string,
      content: unknown,
    ): Promise<DriveFileRef> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      const folderId = folderIds[folderPath];
      if (!folderId) {
        throw new DriveApiError(400, `Unknown Drive folder path: ${folderPath}`);
      }
      return writeSystemDocument(api, folderId, fileName, content);
    },

    async listFolderFiles(
      folderPath: string,
      nameContains?: string,
    ): Promise<DriveFileRef[]> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      const folderId = folderIds[folderPath];
      if (!folderId) {
        throw new DriveApiError(400, `Unknown Drive folder path: ${folderPath}`);
      }
      const nameClause = nameContains ? ` and name contains '${nameContains}'` : '';
      const res = await api.listFiles(
        `'${folderId}' in parents and trashed = false${nameClause}`,
        { pageSize: 200 },
      );
      return res.files;
    },

    async readFileText(fileId: string): Promise<string> {
      return api.downloadText(fileId);
    },

    async recoverStaging(): Promise<string[]> {
      const folderIds = cachedFolderIds ?? (await ensureFolderTree()).folderIds;
      const stagingId = folderIds['_system/staging'];
      const res = await api.listFiles(`'${stagingId}' in parents`, { pageSize: 200 });
      const recovered: string[] = [];

      // Staged files are named "{logicalFolderPath}__{fileName}".
      for (const staged of res.files) {
        const separator = staged.name.indexOf('__');
        if (separator < 0) {
          // Unrecognized staging artifact — leave it for manual review.
          continue;
        }
        const logicalPath = staged.name.slice(0, separator);
        const fileName = staged.name.slice(separator + 2);
        const targetFolderId = folderIds[logicalPath];
        if (!targetFolderId) {
          continue;
        }

        const alreadyCommitted = await findFileByName(api, targetFolderId, fileName);
        if (alreadyCommitted) {
          // The commit completed before the interruption —
          // the staged copy is redundant.
          await api.deleteFile(staged.id);
        } else {
          // The commit never landed — finish the move.
          await api.moveFile(staged.id, [targetFolderId], [stagingId]);
        }
        recovered.push(staged.name);
      }
      return recovered;
    },
  };
}

/**
 * The live service instance. Metadata persistence is wired
 * lazily so importing this module never pulls the Firebase
 * SDK into non-browser environments.
 */
export const driveService: DriveService = createDriveService({
  api: liveDriveApi,
  appVersion: CURRENT_APP_VERSION,
  persistMetadata: async (firebaseUserId, snapshot) => {
    const { syncGoogleDriveStateToFirestore } = await import('../lib/firebase');
    await syncGoogleDriveStateToFirestore(firebaseUserId, {
      connected: snapshot.connected,
      email: snapshot.email,
      folderId: snapshot.folderId,
      folderName: snapshot.folderName,
      schemaVersion: snapshot.schemaVersion,
      migrationStatus: snapshot.migrationStatus,
      revision: snapshot.revision,
      storageRole: snapshot.storageRole,
      updatedAt: snapshot.updatedAt,
    } as any);
  },
});
