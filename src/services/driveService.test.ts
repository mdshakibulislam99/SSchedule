import { describe, it, expect, vi } from 'vitest';

// Keep the Firebase SDK out of the test environment: the
// Drive API only needs a token provider, which is mocked.
vi.mock('../lib/googleDrive', () => ({
  getDriveAccessToken: vi.fn(async () => 'test-token'),
}));

import {
  createDriveService,
  DRIVE_FOLDER_TREE,
  ROOT_FOLDER_NAME,
  LEGACY_ROOT_FOLDER_NAME,
  DriveMetadataSnapshot,
} from './driveService';
import {
  DriveApi,
  DriveApiError,
  DrivePermissionError,
  DriveQuotaError,
  DRIVE_FOLDER_MIME,
} from '../lib/driveApi';
import {
  COLLECTION_MAPPINGS,
  DriveFileRef,
} from '../types/driveStorage';

// ---------------------------------------------------------------------------
// In-memory fake of the Google Drive v3 API
// ---------------------------------------------------------------------------

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  content?: string;
}

class FakeDriveApi implements DriveApi {
  files = new Map<string, FakeFile>();
  private counter = 0;
  /** Failure injection per method name. */
  failure?: (method: string) => Error | undefined;

  constructor() {
    this.files.set('root', {
      id: 'root',
      name: 'root',
      mimeType: DRIVE_FOLDER_MIME,
      parents: [],
    });
  }

  private nextId() {
    return `file-${++this.counter}`;
  }

  private maybeFail(method: string) {
    if (this.failure) {
      const err = this.failure(method);
      if (err) throw err;
    }
  }

  private matches(file: FakeFile, q: string | undefined): boolean {
    if (!q) return true;
    return q
      .split(' and ')
      .map((c) => c.trim())
      .every((clause) => {
        let m = clause.match(/^name\s*=\s*'([^']*)'$/);
        if (m) return file.name === m[1];
        m = clause.match(/^mimeType\s*=\s*'([^']*)'$/);
        if (m) return file.mimeType === m[1];
        m = clause.match(/^'([^']*)'\s+in\s+parents$/);
        if (m) return file.parents.includes(m[1]);
        m = clause.match(/^name\s+contains\s+'([^']*)'$/);
        if (m) return file.name.includes(m[1]);
        throw new Error(`FakeDriveApi cannot parse clause: ${clause}`);
      });
  }

  private ref(f: FakeFile): DriveFileRef {
    return { id: f.id, name: f.name, mimeType: f.mimeType };
  }

  async listFiles(q?: string, opts?: { pageSize?: number; pageToken?: string }) {
    this.maybeFail('listFiles');
    // The root pseudo-folder is never listed, as in real Drive.
    const matches = [...this.files.values()].filter(
      (f) => f.id !== 'root' && this.matches(f, q),
    );
    return { files: matches.map((f) => this.ref(f)) };
  }

  async getFile(fileId: string) {
    this.maybeFail('getFile');
    const f = this.files.get(fileId);
    if (!f) throw new DriveApiError(404, `File not found: ${fileId}`);
    return this.ref(f);
  }

  async downloadText(fileId: string) {
    const f = this.files.get(fileId);
    if (!f) throw new DriveApiError(404, `File not found: ${fileId}`);
    return f.content ?? '';
  }

  async createFolder(name: string, parentId: string) {
    this.maybeFail('createFolder');
    const f: FakeFile = {
      id: this.nextId(),
      name,
      mimeType: DRIVE_FOLDER_MIME,
      parents: [parentId],
    };
    this.files.set(f.id, f);
    return this.ref(f);
  }

  async uploadJson(name: string, parentId: string, content: unknown) {
    this.maybeFail('uploadJson');
    const f: FakeFile = {
      id: this.nextId(),
      name,
      mimeType: 'application/json',
      parents: [parentId],
      content: JSON.stringify(content),
    };
    this.files.set(f.id, f);
    return this.ref(f);
  }

  async updateJson(
    fileId: string,
    content: unknown,
    opts?: { name?: string; addParents?: string[]; removeParents?: string[] },
  ) {
    this.maybeFail('updateJson');
    const f = this.files.get(fileId);
    if (!f) throw new DriveApiError(404, `File not found: ${fileId}`);
    if (opts?.name) f.name = opts.name;
    if (opts?.addParents) {
      for (const p of opts.addParents) {
        if (!f.parents.includes(p)) f.parents.push(p);
      }
    }
    if (opts?.removeParents) {
      f.parents = f.parents.filter((p) => !opts!.removeParents!.includes(p));
    }
    f.content = JSON.stringify(content);
    return this.ref(f);
  }

  async moveFile(fileId: string, addParents: string[], removeParents: string[]) {
    this.maybeFail('moveFile');
    const f = this.files.get(fileId);
    if (!f) throw new DriveApiError(404, `File not found: ${fileId}`);
    f.parents = f.parents.filter((p) => !removeParents.includes(p));
    for (const p of addParents) {
      if (!f.parents.includes(p)) f.parents.push(p);
    }
    return this.ref(f);
  }

  async deleteFile(fileId: string) {
    this.maybeFail('deleteFile');
    this.files.delete(fileId);
  }

  /** All files (including root) — test helper. */
  all(): FakeFile[] {
    return [...this.files.values()];
  }

  childrenOf(parentId: string): FakeFile[] {
    return this.all().filter((f) => f.parents.includes(parentId));
  }

  findByName(name: string, parentId: string): FakeFile | undefined {
    return this.childrenOf(parentId).find((f) => f.name === name);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('driveService.initializeDriveStorage', () => {
  it('creates the complete SScheduleData structure on first run', async () => {
    const api = new FakeDriveApi();
    const service = createDriveService({ api });
    const result = await service.initializeDriveStorage();

    expect(result.status).toBe('created');
    expect(result.rootFolderName).toBe(ROOT_FOLDER_NAME);
    expect(result.createdFolderCount).toBe(DRIVE_FOLDER_TREE.length);

    const root = api.findByName(ROOT_FOLDER_NAME, 'root');
    expect(root?.mimeType).toBe(DRIVE_FOLDER_MIME);

    // Every logical folder exists under its parent.
    for (const spec of DRIVE_FOLDER_TREE) {
      const parentId = spec.parent ? result.folders[spec.parent] : root!.id;
      const folder = api.findByName(spec.path.split('/').pop()!, parentId);
      expect(folder, `missing folder ${spec.path}`).toBeTruthy();
      expect(folder!.mimeType).toBe(DRIVE_FOLDER_MIME);
      expect(result.folders[spec.path]).toBe(folder!.id);
    }
  });

  it('is idempotent — a second run creates nothing and reuses ids', async () => {
    const api = new FakeDriveApi();
    const service = createDriveService({ api });
    const first = await service.initializeDriveStorage();

    const filesBefore = api.all().length;
    const mappingFilesBefore = api.childrenOf(
      first.folders['data/collection-mappings'],
    ).length;

    const second = await service.initializeDriveStorage();

    expect(second.createdFolderCount).toBe(0);
    expect(second.rootFolderId).toBe(first.rootFolderId);
    expect(api.all().length).toBe(filesBefore);
    // No duplicate collection-mapping documents.
    expect(
      api.childrenOf(first.folders['data/collection-mappings']).length,
    ).toBe(mappingFilesBefore);
    // Manifest revision is not bumped unnecessarily.
    expect(second.manifest.revision).toBe(first.manifest.revision);
  });

  it('reuses an existing verified SScheduleData root', async () => {
    const api = new FakeDriveApi();
    const existing = await api.createFolder(ROOT_FOLDER_NAME, 'root');
    const service = createDriveService({ api });
    const result = await service.initializeDriveStorage();

    expect(result.rootFolderId).toBe(existing.id);
    expect(result.createdFolderCount).toBe(DRIVE_FOLDER_TREE.length);
  });

  it('reuses the legacy SSfilesdata root instead of duplicating it', async () => {
    const api = new FakeDriveApi();
    const legacy = await api.createFolder(LEGACY_ROOT_FOLDER_NAME, 'root');
    const service = createDriveService({ api });
    const result = await service.initializeDriveStorage();

    expect(result.rootFolderId).toBe(legacy.id);
    expect(api.findByName(ROOT_FOLDER_NAME, 'root')).toBeUndefined();
    expect(api.findByName(LEGACY_ROOT_FOLDER_NAME, 'root')?.id).toBe(legacy.id);
  });

  it('rejects a regular file occupying the root folder name', async () => {
    const api = new FakeDriveApi();
    await api.uploadJson(ROOT_FOLDER_NAME, 'root', { not: 'a folder' });
    const service = createDriveService({ api });
    await expect(service.initializeDriveStorage()).rejects.toBeInstanceOf(
      DriveApiError,
    );
    try {
      await service.initializeDriveStorage();
    } catch (err: any) {
      expect(err.message).toContain('not a folder');
    }
  });

  it('rejects a regular file colliding with a child folder name', async () => {
    const api = new FakeDriveApi();
    // A file named "data" inside the root folder collides
    // with the data/ folder the service must create.
    const root = await api.createFolder(ROOT_FOLDER_NAME, 'root');
    await api.uploadJson('data', root.id, { not: 'a folder' });
    const service = createDriveService({ api });
    await expect(service.initializeDriveStorage()).rejects.toBeInstanceOf(
      DriveApiError,
    );
    try {
      await service.initializeDriveStorage();
    } catch (err: any) {
      expect(err.message).toContain('not a folder');
    }
  });

  it('creates the manifest and starts migration at NOT_STARTED', async () => {
    const api = new FakeDriveApi();
    const service = createDriveService({ api });
    const result = await service.initializeDriveStorage();

    expect(result.migrationState).toBe('NOT_STARTED');
    expect(result.manifest.schemaVersion).toBe(1);
    expect(result.manifest.revision).toBe(1);
    expect(result.manifest.collections).toEqual({});

    const migrationDoc = await service.readMigrationState();
    expect(migrationDoc?.state).toBe('NOT_STARTED');
    expect(migrationDoc?.startedAt).toBeNull();
    expect(migrationDoc?.completedAt).toBeNull();
  });

  it('never marks migration complete just because folders exist', async () => {
    const api = new FakeDriveApi();
    const service = createDriveService({ api });
    await service.initializeDriveStorage();
    await service.initializeDriveStorage();
    await service.initializeDriveStorage();

    const migrationDoc = await service.readMigrationState();
    expect(migrationDoc?.state).toBe('NOT_STARTED');
    expect(Object.values(migrationDoc!.collections)).not.toContain('COMPLETE');
  });

  it('writes a mapping document for every discovered collection', async () => {
    const api = new FakeDriveApi();
    const service = createDriveService({ api });
    const result = await service.initializeDriveStorage();

    const mappingFolder = result.folders['data/collection-mappings'];
    const docs = api.childrenOf(mappingFolder);
    expect(docs.length).toBe(Object.keys(COLLECTION_MAPPINGS).length);
    for (const collection of Object.keys(COLLECTION_MAPPINGS)) {
      const doc = docs.find((d) => d.name === `${collection}.json`);
      expect(doc, `missing mapping for ${collection}`).toBeTruthy();
      expect(doc!.mimeType).toBe('application/json');
    }
  });

  it('recovers an interrupted staged partition write', async () => {
    const api = new FakeDriveApi();
    const service = createDriveService({ api });
    const result = await service.initializeDriveStorage();

    // Simulate a crash mid-commit: a staged partition whose
    // target commit never landed.
    const stagingId = result.folders['_system/staging'];
    const staged = await api.uploadJson(
      'data/tasks__part-000001.json',
      stagingId,
      { partitionId: 'tasks:part-000001', records: [] },
    );

    const recovered = await service.recoverStaging();
    expect(recovered).toContain('data/tasks__part-000001.json');

    // The staged file moved into data/tasks and left staging.
    expect(api.files.has(staged.id)).toBe(true);
    const moved = api.files.get(staged.id)!;
    expect(moved.parents).toContain(result.folders['data/tasks']);
    expect(moved.parents).not.toContain(stagingId);
    expect(api.childrenOf(stagingId)).toHaveLength(0);
  });

  it('discards a staged copy whose commit already landed', async () => {
    const api = new FakeDriveApi();
    const service = createDriveService({ api });
    const result = await service.initializeDriveStorage();

    const stagingId = result.folders['_system/staging'];
    // Committed partition already in place…
    await api.uploadJson(
      'part-000001.json',
      result.folders['data/tasks'],
      { partitionId: 'tasks:part-000001', records: [] },
    );
    // …plus a leftover staged copy of the same file.
    const staged = await api.uploadJson(
      'data/tasks__part-000001.json',
      stagingId,
      { partitionId: 'tasks:part-000001', records: [] },
    );

    await service.recoverStaging();
    // The staged duplicate was deleted; the committed file remains.
    expect(api.files.has(staged.id)).toBe(false);
    expect(
      api.childrenOf(result.folders['data/tasks']).length,
    ).toBe(1);
  });

  it('surfaces permission denial as a structured error', async () => {
    const api = new FakeDriveApi();
    api.failure = (method) =>
      method === 'listFiles'
        ? new DrivePermissionError('The user has not granted access')
        : undefined;
    const service = createDriveService({ api });
    await expect(service.initializeDriveStorage()).rejects.toBeInstanceOf(
      DrivePermissionError,
    );
  });

  it('surfaces insufficient Drive storage as a structured error', async () => {
    const api = new FakeDriveApi();
    api.failure = (method) =>
      method === 'createFolder'
        ? new DriveQuotaError("The user's Drive storage is full")
        : undefined;
    const service = createDriveService({ api });
    await expect(service.initializeDriveStorage()).rejects.toBeInstanceOf(
      DriveQuotaError,
    );
  });

  it('persists account metadata without OAuth secrets', async () => {
    const api = new FakeDriveApi();
    const snapshots: DriveMetadataSnapshot[] = [];
    const service = createDriveService({
      api,
      persistMetadata: async (_uid, snapshot) => {
        snapshots.push(snapshot);
      },
    });
    await service.initializeDriveStorage('firebase-uid-1');

    expect(snapshots).toHaveLength(1);
    const snapshot = snapshots[0];
    // Only minimal metadata — no tokens, no secrets.
    expect(snapshot.folderId).toBeTruthy();
    expect(snapshot.folderName).toBe(ROOT_FOLDER_NAME);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.migrationStatus).toBe('NOT_STARTED');
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('refresh');
    expect(serialized).not.toContain('secret');
  });

  it('verifies storage and detects a deleted system folder', async () => {
    const api = new FakeDriveApi();
    const service = createDriveService({ api });
    const result = await service.initializeDriveStorage();

    const healthy = await service.verifyDriveStorage();
    expect(healthy.valid).toBe(true);
    expect(healthy.issues).toEqual([]);

    // Delete a system folder — verification must catch it.
    api.deleteFile(result.folders['_system/tombstones']);
    const broken = await service.verifyDriveStorage();
    expect(broken.valid).toBe(false);
    expect(broken.issues.some((issue) => issue.includes('tombstones'))).toBe(
      true,
    );
  });

  it('bumps the manifest revision on write and reads it back', async () => {
    const api = new FakeDriveApi();
    const service = createDriveService({ api });
    const result = await service.initializeDriveStorage();

    const manifest = await service.readManifest();
    expect(manifest?.revision).toBe(1);

    const next = await service.writeManifest({ ...manifest!, revision: 1 });
    expect(next.revision).toBe(2);

    const reread = await service.readManifest();
    expect(reread?.revision).toBe(2);
  });
});
