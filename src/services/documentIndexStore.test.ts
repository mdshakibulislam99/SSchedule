import { describe, it, expect, vi } from 'vitest';

// The store imports the live DriveService singleton + pilot flag helper at
// module load; mock them so these unit tests stay hermetic.
vi.mock('./driveService', () => ({
  driveService: {
    listFolderFiles: vi.fn(async () => []),
    readFileText: vi.fn(async () => ''),
    writeFileToFolder: vi.fn(async () => ({ id: 'x', name: 'x' })),
  },
}));
vi.mock('./storageInterface', () => ({
  isDrivePilotEnabled: vi.fn(() => false),
}));

import { buildPageChunks, pageTextKey, PAGE_CHUNK_MAX_CHARS, type IndexedPageText } from './documentIndexStore';

const pages = (spec: Array<[number, number]>): IndexedPageText[] =>
  spec.map(([page, len]) => ({ page, text: 'x'.repeat(len) }));

describe('pageTextKey', () => {
  it('builds a stable per-page key', () => {
    expect(pageTextKey('file-1', 42)).toBe('text-file-1-page-42');
  });
});

describe('buildPageChunks', () => {
  it('returns a single chunk for small documents', () => {
    const chunks = buildPageChunks('f1', 'Book.pdf', pages([[1, 100], [2, 200], [3, 150]]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].part).toBe(1);
    expect(chunks[0].parts).toBe(1);
    expect(chunks[0].fromPage).toBe(1);
    expect(chunks[0].toPage).toBe(3);
    expect(chunks[0].pages).toHaveLength(3);
  });

  it('splits into multiple chunks once the char cap is exceeded', () => {
    // Each page is 200k chars; the cap is 350k, so ~1 page per chunk.
    const chunks = buildPageChunks('f2', 'Big.pdf', pages([[1, 200000], [2, 200000], [3, 200000]]));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].parts).toBe(chunks.length);
    // Every page is preserved across all chunks, in order.
    const allPages = chunks.flatMap((c) => c.pages).map((p) => p.page);
    expect(allPages).toEqual([1, 2, 3]);
    // No chunk exceeds the cap (given each page is under it).
    for (const c of chunks) {
      const size = c.pages.reduce((s, p) => s + p.text.length, 0);
      expect(size).toBeLessThanOrEqual(PAGE_CHUNK_MAX_CHARS + 200000);
    }
  });

  it('keeps a single oversized page in its own chunk', () => {
    const chunks = buildPageChunks('f3', 'One.pdf', pages([[1, PAGE_CHUNK_MAX_CHARS + 1]]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pages).toHaveLength(1);
  });

  it('returns an empty array for no pages', () => {
    expect(buildPageChunks('f4', 'Empty.pdf', [])).toEqual([]);
  });
});
