import type { DocumentIndexedPage, DocumentPageSpan, DocumentPageIndex, StudyFile } from '../types';
import { saveExtractedText, loadExtractedText } from '../utils/fileStorage';
import { driveService } from './driveService';
import { isDrivePilotEnabled } from './storageInterface';

/**
 * Page-level document index persistence.
 *
 * Every physical page of an uploaded document is stored per-page in
 * IndexedDB (fast local retrieval) and mirrored to Google Drive for
 * pilot accounts (durable, cross-device). Chat retrieval always checks
 * local first and falls back to Drive, re-caching pages locally.
 */

const PAGE_INDEX_FOLDER = 'ai-indexes/page-index';
/** Max characters of page text per Drive mirror file. */
export const PAGE_CHUNK_MAX_CHARS = 350_000;
/** Max pages persisted individually in IndexedDB per document. */
export const MAX_LOCAL_PAGES = 1_200;

export interface IndexedPageText {
  page: number;
  text: string;
}

export interface PageIndexChunk {
  fileId: string;
  fileName: string;
  part: number;
  parts: number;
  fromPage: number;
  toPage: number;
  savedAt: string;
  pages: IndexedPageText[];
}

export function pageTextKey(fileId: string, page: number): string {
  return `text-${fileId}-page-${page}`;
}

/**
 * Groups per-page texts into Drive-sized chunk payloads (pure).
 * Pages stay in order; a chunk never exceeds PAGE_CHUNK_MAX_CHARS
 * unless a single page itself is larger.
 */
export function buildPageChunks(
  fileId: string,
  fileName: string,
  pages: IndexedPageText[],
): PageIndexChunk[] {
  const groups: IndexedPageText[][] = [];
  let current: IndexedPageText[] = [];
  let size = 0;
  for (const page of pages) {
    if (current.length > 0 && size + page.text.length > PAGE_CHUNK_MAX_CHARS) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(page);
    size += page.text.length;
  }
  if (current.length > 0) groups.push(current);

  const total = groups.length;
  return groups.map((group, i) => ({
    fileId,
    fileName,
    part: i + 1,
    parts: total,
    fromPage: group[0].page,
    toPage: group[group.length - 1].page,
    savedAt: new Date().toISOString(),
    pages: group,
  }));
}

/**
 * Slices every page's text out of the full extracted text and persists
 * it per-page to IndexedDB, returning the index metadata (with text
 * keys) to store on the StudyFile.
 */
export async function persistPageIndexLocal(
  fileId: string,
  fullText: string,
  spans: DocumentPageSpan[],
): Promise<DocumentPageIndex | null> {
  if (spans.length === 0) return null;
  const kept = spans.slice(0, MAX_LOCAL_PAGES);
  const pages: DocumentIndexedPage[] = [];
  for (const span of kept) {
    const text = fullText.slice(span.startChar, span.endChar);
    if (!text.trim()) continue;
    const key = pageTextKey(fileId, span.page);
    try {
      await saveExtractedText(key, text);
    } catch (err) {
      console.warn(`persistPageIndexLocal: page ${span.page} failed:`, err);
      continue;
    }
    pages.push({ ...span, textKey: key, charCount: text.length });
  }
  if (pages.length === 0) return null;
  return { unit: 'page', totalPages: spans.length, pages };
}

/**
 * Mirrors the per-page texts to Google Drive (pilot accounts only).
 * Fire-and-forget from the upload flow: local IndexedDB remains the
 * primary retrieval source; Drive is the durable cross-device copy.
 */
export async function mirrorPageIndexToDrive(
  uid: string | null | undefined,
  fileId: string,
  fileName: string,
  fullText: string,
  spans: DocumentPageSpan[],
): Promise<number> {
  if (!uid || !isDrivePilotEnabled(uid)) return 0;
  const texts: IndexedPageText[] = spans
    .map((s) => ({ page: s.page, text: fullText.slice(s.startChar, s.endChar) }))
    .filter((p) => p.text.trim());
  const chunks = buildPageChunks(fileId, fileName, texts);
  let written = 0;
  for (const chunk of chunks) {
    await driveService.writeFileToFolder(
      PAGE_INDEX_FOLDER,
      `docidx-${fileId}-part${chunk.part}.json`,
      chunk,
    );
    written += 1;
  }
  return written;
}

/**
 * Loads one page's complete text: IndexedDB first; on a local miss for
 * a pilot account, finds the page in the Drive mirror, re-caches the
 * whole chunk locally, and returns the page text.
 */
export async function loadPageText(
  uid: string | null | undefined,
  file: StudyFile,
  page: number,
): Promise<string | null> {
  try {
    const local = await loadExtractedText(pageTextKey(file.id, page));
    if (local && local.trim()) return local;
  } catch {
    // Fall through to the Drive mirror.
  }
  if (!uid || !isDrivePilotEnabled(uid)) return null;
  try {
    const refs = await driveService.listFolderFiles(
      PAGE_INDEX_FOLDER,
      `docidx-${file.id}-part`,
    );
    for (const ref of refs) {
      const raw = await driveService.readFileText(ref.id);
      const chunk = JSON.parse(raw) as PageIndexChunk;
      if (!chunk?.pages?.length) continue;
      const hit = chunk.pages.find((p) => p.page === page);
      if (!hit) continue;
      // Re-cache the whole chunk so future loads are local hits.
      for (const p of chunk.pages) {
        if (p.text?.trim()) {
          saveExtractedText(pageTextKey(file.id, p.page), p.text).catch(() => {});
        }
      }
      return hit.text;
    }
  } catch (err) {
    console.warn('loadPageText: Drive mirror lookup failed:', err);
  }
  return null;
}