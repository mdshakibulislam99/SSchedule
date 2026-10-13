import { describe, it, expect } from 'vitest';

import {
  COLLECTION_MAPPINGS,
  DRIVE_STORAGE_SCHEMA_VERSION,
  computeChecksum,
  createInitialMigrationStateDocument,
  createRecordEnvelope,
  migrateEnvelope,
  validateEnvelope,
} from './driveStorage';

describe('checksum', () => {
  it('is deterministic and content-sensitive', () => {
    expect(computeChecksum('hello')).toBe(computeChecksum('hello'));
    expect(computeChecksum('hello')).not.toBe(computeChecksum('world'));
    expect(computeChecksum('')).toBe(computeChecksum(''));
  });
});

describe('record envelope', () => {
  it('preserves the existing stable record id', () => {
    const envelope = createRecordEnvelope({ id: 'task-42', title: 'x' } as any, {
      entityType: 'task',
    });
    expect(envelope.id).toBe('task-42');
    expect(envelope.schemaVersion).toBe(DRIVE_STORAGE_SCHEMA_VERSION);
    expect(envelope.revision).toBe(1);
    expect(envelope.writerDeviceId).toBeTruthy();
  });

  it('validates structurally sound envelopes', () => {
    const envelope = createRecordEnvelope({ id: 'a', x: 1 } as any, { entityType: 't' });
    expect(validateEnvelope(envelope)).toBe(true);
    expect(validateEnvelope(null)).toBe(false);
    expect(validateEnvelope({ id: 1 })).toBe(false);
    expect(validateEnvelope({ ...envelope, payload: undefined })).toBe(false);
  });

  it('migrates old envelopes by filling missing optional fields', () => {
    const migrated = migrateEnvelope({ id: 'old-1', entityType: 'task' });
    expect(migrated.id).toBe('old-1');
    expect(migrated.schemaVersion).toBe(DRIVE_STORAGE_SCHEMA_VERSION);
    expect(migrated.revision).toBe(1);
    expect(migrated.writerDeviceId).toBe('dev-unknown');
    expect(migrated.payload).toEqual({});
  });
});

describe('collection mappings', () => {
  it('covers every user-owned Firestore collection', () => {
    const firestorePaths = Object.values(COLLECTION_MAPPINGS).map((m) => m.firestorePath);
    const expected = [
      'users/{uid}/tasks',
      'users/{uid}/schedule',
      'users/{uid}/goals',
      'users/{uid}/courses',
      'users/{uid}/resources',
      'users/{uid}/files',
      'users/{uid}/notes',
      'users/{uid}/research',
      'users/{uid}/aiMemory',
      'users/{uid}/conversations',
      'users/{uid}/notifications',
      'users/{uid}/quizzes',
      'users/{uid}/flashcards',
      'users/{uid}/annotations',
    ];
    for (const path of expected) {
      expect(firestorePaths).toContain(path);
    }
  });

  it('maps conversations and messages separately', () => {
    expect(COLLECTION_MAPPINGS.conversations.partitionStrategy).toBe('partitioned');
    expect(COLLECTION_MAPPINGS.messages.partitionStrategy).toBe('per-entity-folder');
    expect(COLLECTION_MAPPINGS.messages.driveFolder).toBe('data/messages');
  });

  it('never stores extracted text in the manifest mapping', () => {
    // Resources keep their payload in data/resources; the
    // 200k-char extracted text lives in ai-indexes only.
    expect(COLLECTION_MAPPINGS.resources.driveFolder).toBe('data/resources');
    expect(COLLECTION_MAPPINGS.resources.rationale).toContain('ai-indexes');
  });
});

describe('migration state document', () => {
  it('starts every collection at NOT_STARTED', () => {
    const doc = createInitialMigrationStateDocument();
    expect(doc.state).toBe('NOT_STARTED');
    expect(doc.startedAt).toBeNull();
    expect(doc.completedAt).toBeNull();
    const states = Object.values(doc.collections);
    expect(states).not.toContain('IN_PROGRESS');
    expect(states).not.toContain('COMPLETE');
    expect(states.every((s) => s === 'NOT_STARTED')).toBe(true);
  });
});
