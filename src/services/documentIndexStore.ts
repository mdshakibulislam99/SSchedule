import type {
  DocumentChapter,
  DocumentIndexedPage,
  DocumentPageSpan,
  DocumentPageIndex,
  DocumentStructure,
  ResourceAIContext,
  StudyFile,
} from '../types';
import { saveExtractedText, loadExtractedText, saveFileBlob, loadFileBlob } from '../utils/fileStorage';
import { driveService } from './driveService';
import { isDriveFileStorageEnabled } from './storageInterface';

/**
 * Page-level document index persistence.
 *
 * Every physical page of an uploaded document is stored per-page in
 * IndexedDB (fast local retrieval) and mirrored to Google Drive for
 * pilot accounts (durable, cross-device). Chat retrieval always checks
 * local first and falls back to Drive, re-caching pages locally.
 */

const PAGE_INDEX_FOLDER = 'ai-indexes/page-index';
const EXTRACTED_TEXT_FOLDER = 'ai-indexes/extracted-text';
const INDEX_MANIFEST_FOLDER = 'ai-indexes/manifests';
/** Max characters of page text per Drive mirror file. */
export const PAGE_CHUNK_MAX_CHARS = 350_000;
/** Max pages persisted individually in IndexedDB per document. */
export const MAX_LOCAL_PAGES = 1_200;
export const DOCUMENT_TEXT_CHUNK_MAX_CHARS = 200_000;

export interface DocumentTextManifest {
  schemaVersion: 1;
  fileId: string;
  fileName: string;
  generation: string;
  parts: number;
  charCount: number;
  savedAt: string;
}

export interface DocumentTextChunk {
  schemaVersion: 1;
  fileId: string;
  generation: string;
  part: number;
  parts: number;
  text: string;
}

export interface DocumentIndexSnapshot {
  schemaVersion: 1;
  fileId: string;
  fileName: string;
  savedAt: string;
  structure?: DocumentStructure;
  aiContext: ResourceAIContext;
}

export interface OriginalFileManifest {
  schemaVersion: 1;
  fileId: string;
  fileName: string;
  mimeType: string;
  generation: string;
  parts: number;
  byteLength: number;
  savedAt: string;
}

interface OriginalFileChunk {
  schemaVersion: 1;
  fileId: string;
  generation: string;
  part: number;
  parts: number;
  base64: string;
}

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

/** Split text without dropping characters; a manifest is committed last. */
export function buildDocumentTextChunks(
  fileId: string,
  generation: string,
  text: string,
): DocumentTextChunk[] {
  const parts = Math.max(1, Math.ceil(text.length / DOCUMENT_TEXT_CHUNK_MAX_CHARS));
  return Array.from({ length: parts }, (_, index) => ({
    schemaVersion: 1,
    fileId,
    generation,
    part: index + 1,
    parts,
    text: text.slice(index * DOCUMENT_TEXT_CHUNK_MAX_CHARS, (index + 1) * DOCUMENT_TEXT_CHUNK_MAX_CHARS),
  }));
}

/** Store the complete extracted text in Drive for pilot accounts. */
export async function mirrorDocumentTextToDrive(
  uid: string | null | undefined,
  fileId: string,
  fileName: string,
  text: string,
  allowDuringMigration = false,
): Promise<boolean> {
  if (!uid || (!allowDuringMigration && !isDriveFileStorageEnabled(uid)) || !text) return false;
  const generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const chunks = buildDocumentTextChunks(fileId, generation, text);
  for (const chunk of chunks) {
    await driveService.writeFileToFolder(
      EXTRACTED_TEXT_FOLDER,
      `doctext-${fileId}-${generation}-part${chunk.part}.json`,
      chunk,
    );
  }
  const manifest: DocumentTextManifest = {
    schemaVersion: 1,
    fileId,
    fileName,
    generation,
    parts: chunks.length,
    charCount: text.length,
    savedAt: new Date().toISOString(),
  };
  // The manifest is the commit record. Readers continue using the previous
  // complete generation if an upload is interrupted before this write.
  await driveService.writeFileToFolder(
    EXTRACTED_TEXT_FOLDER,
    `doctext-${fileId}-manifest.json`,
    manifest,
  );
  try {
    await driveService.deleteFolderFiles(
      EXTRACTED_TEXT_FOLDER,
      `doctext-${fileId}-`,
      [
        `doctext-${fileId}-manifest.json`,
        ...chunks.map((chunk) => `doctext-${fileId}-${generation}-part${chunk.part}.json`),
      ],
    );
  } catch (err) {
    console.warn('mirrorDocumentTextToDrive: stale chunk cleanup failed:', err);
  }
  return true;
}

export async function loadDocumentTextFromDrive(
  uid: string | null | undefined,
  fileId: string,
): Promise<string | null> {
  if (!uid || !isDriveFileStorageEnabled(uid)) return null;
  try {
    const manifests = await driveService.listFolderFiles(
      EXTRACTED_TEXT_FOLDER,
      `doctext-${fileId}-manifest.json`,
    );
    if (manifests.length === 0) return null;
    const manifest = JSON.parse(await driveService.readFileText(manifests[0].id)) as DocumentTextManifest;
    if (
      manifest.schemaVersion !== 1 || manifest.fileId !== fileId ||
      !manifest.generation || !Number.isInteger(manifest.parts) || manifest.parts < 1
    ) return null;
    const refs = await driveService.listFolderFiles(
      EXTRACTED_TEXT_FOLDER,
      `doctext-${fileId}-${manifest.generation}-part`,
    );
    const byPart = new Map<number, DocumentTextChunk>();
    for (const ref of refs) {
      const chunk = JSON.parse(await driveService.readFileText(ref.id)) as DocumentTextChunk;
      if (
        chunk.schemaVersion === 1 && chunk.fileId === fileId &&
        chunk.generation === manifest.generation && chunk.parts === manifest.parts &&
        Number.isInteger(chunk.part) && chunk.part >= 1 && chunk.part <= manifest.parts &&
        typeof chunk.text === 'string'
      ) byPart.set(chunk.part, chunk);
    }
    if (byPart.size !== manifest.parts) return null;
    const text = Array.from({ length: manifest.parts }, (_, i) => byPart.get(i + 1)!.text).join('');
    if (text.length !== manifest.charCount) return null;
    try { await saveExtractedText(`text-${fileId}`, text); } catch { /* use Drive result in this session */ }
    return text;
  } catch (err) {
    console.warn('loadDocumentTextFromDrive: Drive lookup failed:', err);
    return null;
  }
}

export async function deleteDocumentTextFromDrive(
  uid: string | null | undefined,
  fileId: string,
): Promise<void> {
  if (!uid || !isDriveFileStorageEnabled(uid)) return;
  await driveService.deleteFolderFiles(EXTRACTED_TEXT_FOLDER, `doctext-${fileId}-`);
  await driveService.deleteFolderFiles(INDEX_MANIFEST_FOLDER, `docindex-${fileId}.json`);
  // Remove page mirrors written by earlier app versions as well.
  await driveService.deleteFolderFiles(PAGE_INDEX_FOLDER, `docidx-${fileId}-part`);
  await driveService.deleteFolderFiles('files/originals', `original-${fileId}-`);
}

/** Back up a complete original upload using a manifest committed last. */
export async function mirrorOriginalFileToDrive(
  uid: string | null | undefined,
  fileId: string,
  fileName: string,
  blob: Blob,
  allowDuringMigration = false,
): Promise<boolean> {
  if (!uid || (!allowDuringMigration && !isDriveFileStorageEnabled(uid))) return false;
  const generation = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const bytesPerPart = 140_000;
  const parts = Math.max(1, Math.ceil(blob.size / bytesPerPart));
  for (let index = 0; index < parts; index += 1) {
    const slice = new Uint8Array(await blob.slice(index * bytesPerPart, Math.min(blob.size, (index + 1) * bytesPerPart)).arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < slice.length; offset += 0x8000) {
      binary += String.fromCharCode(...slice.subarray(offset, Math.min(slice.length, offset + 0x8000)));
    }
    const chunk: OriginalFileChunk = {
      schemaVersion: 1,
      fileId,
      generation,
      part: index + 1,
      parts,
      base64: btoa(binary),
    };
    await driveService.writeFileToFolder(
      'files/originals',
      `original-${fileId}-${generation}-part${index + 1}.json`,
      chunk,
    );
  }
  const manifest: OriginalFileManifest = {
    schemaVersion: 1,
    fileId,
    fileName,
    mimeType: blob.type || 'application/octet-stream',
    generation,
    parts,
    byteLength: blob.size,
    savedAt: new Date().toISOString(),
  };
  await driveService.writeFileToFolder('files/originals', `original-${fileId}-manifest.json`, manifest);
  try {
    await driveService.deleteFolderFiles('files/originals', `original-${fileId}-`, [
      `original-${fileId}-manifest.json`,
      ...Array.from({ length: parts }, (_, index) => `original-${fileId}-${generation}-part${index + 1}.json`),
    ]);
  } catch (err) {
    console.warn('mirrorOriginalFileToDrive: stale chunk cleanup failed:', err);
  }
  return true;
}

/** Restore a Drive-backed original into local IndexedDB before opening it. */
export async function loadOriginalFileFromDrive(
  uid: string | null | undefined,
  fileId: string,
  storageKey: string,
  allowDuringMigration = false,
): Promise<Blob | null> {
  if (!uid || (!allowDuringMigration && !isDriveFileStorageEnabled(uid))) return null;
  try {
    const manifests = await driveService.listFolderFiles('files/originals', `original-${fileId}-manifest.json`);
    if (!manifests.length) return null;
    const manifest = JSON.parse(await driveService.readFileText(manifests[0].id)) as OriginalFileManifest;
    if (manifest.schemaVersion !== 1 || manifest.fileId !== fileId || !Number.isInteger(manifest.parts) || manifest.parts < 1) return null;
    const refs = await driveService.listFolderFiles('files/originals', `original-${fileId}-${manifest.generation}-part`);
    const chunks = new Map<number, OriginalFileChunk>();
    for (const ref of refs) {
      const chunk = JSON.parse(await driveService.readFileText(ref.id)) as OriginalFileChunk;
      if (chunk.schemaVersion === 1 && chunk.fileId === fileId && chunk.generation === manifest.generation && chunk.parts === manifest.parts) {
        chunks.set(chunk.part, chunk);
      }
    }
    if (chunks.size !== manifest.parts) return null;
    const decoded = Array.from({ length: manifest.parts }, (_, index) => {
      const binary = atob(chunks.get(index + 1)!.base64);
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    });
    const blob = new Blob(decoded, { type: manifest.mimeType });
    if (blob.size !== manifest.byteLength) return null;
    try { await saveFileBlob(blob, storageKey); } catch { /* keep it usable in this session */ }
    return blob;
  } catch (err) {
    console.warn('loadOriginalFileFromDrive: Drive lookup failed:', err);
    return null;
  }
}

/** Back up the AI retrieval index and structure independently of file metadata sync. */
export async function mirrorDocumentIndexToDrive(
  uid: string | null | undefined,
  fileId: string,
  fileName: string,
  structure: DocumentStructure | undefined,
  aiContext: ResourceAIContext,
  allowDuringMigration = false,
): Promise<boolean> {
  if (!uid || (!allowDuringMigration && !isDriveFileStorageEnabled(uid)) || !aiContext.documentChunks?.length) return false;
  const snapshot: DocumentIndexSnapshot = {
    schemaVersion: 1,
    fileId,
    fileName,
    savedAt: new Date().toISOString(),
    structure,
    aiContext,
  };
  await driveService.writeFileToFolder(
    INDEX_MANIFEST_FOLDER,
    `docindex-${fileId}.json`,
    snapshot,
  );
  return true;
}

export async function loadDocumentIndexFromDrive(
  uid: string | null | undefined,
  fileId: string,
): Promise<DocumentIndexSnapshot | null> {
  if (!uid || !isDriveFileStorageEnabled(uid)) return null;
  try {
    const refs = await driveService.listFolderFiles(INDEX_MANIFEST_FOLDER, `docindex-${fileId}.json`);
    if (!refs.length) return null;
    const snapshot = JSON.parse(await driveService.readFileText(refs[0].id)) as DocumentIndexSnapshot;
    if (
      snapshot.schemaVersion !== 1 || snapshot.fileId !== fileId ||
      !snapshot.aiContext || !Array.isArray(snapshot.aiContext.documentChunks)
    ) return null;
    return snapshot;
  } catch (err) {
    console.warn('loadDocumentIndexFromDrive: Drive lookup failed:', err);
    return null;
  }
}

/** Local-first complete text load with a Drive fallback for pilot accounts. */
export async function loadDocumentText(
  uid: string | null | undefined,
  file: StudyFile,
): Promise<string | null> {
  if (file.extractedTextKey) {
    const local = await loadExtractedText(file.extractedTextKey);
    if (local?.trim()) return local;
  }
  return loadDocumentTextFromDrive(uid, file.id);
}

export async function loadChapterText(
  uid: string | null | undefined,
  file: StudyFile,
  chapter: DocumentChapter,
): Promise<string | null> {
  if (chapter.textKey === file.extractedTextKey) {
    const fullText = await loadDocumentText(uid, file);
    if (!fullText) return null;
    const indexed = fullText.slice(chapter.startChar, chapter.endChar);
    return indexed.trim() ? indexed : null;
  }
  try {
    const local = await loadExtractedText(chapter.textKey);
    if (local?.trim()) return local;
  } catch { /* use complete document copy below */ }
  const fullText = await loadDocumentText(uid, file);
  if (!fullText) return null;
  const text = fullText.slice(chapter.startChar, chapter.endChar);
  return text.trim() ? text : null;
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
  const pages: DocumentIndexedPage[] = [];
  for (const [index, span] of spans.entries()) {
    const text = fullText.slice(span.startChar, span.endChar);
    const key = pageTextKey(fileId, span.page);
    if (index < MAX_LOCAL_PAGES && text.trim()) {
      try {
        await saveExtractedText(key, text);
      } catch (err) {
        console.warn(`persistPageIndexLocal: page ${span.page} cache failed:`, err);
      }
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
  if (!uid || !isDriveFileStorageEnabled(uid)) return 0;
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
  const pageSpan = file.pageIndex?.pages.find((entry) => entry.page === page);
  try {
    const local = await loadExtractedText(pageTextKey(file.id, page));
    if (local && hasPageContent(local)) return local;
  } catch {
    // Fall through to the Drive mirror.
  }
  if (pageSpan && file.extractedTextKey) {
    try {
      const fullLocalText = await loadExtractedText(file.extractedTextKey);
      if (fullLocalText) {
        const pageText = fullLocalText.slice(pageSpan.startChar, pageSpan.endChar);
        if (hasPageContent(pageText)) return pageText;
      }
    } catch { /* try Drive below */ }
  }
  if (!uid || !isDriveFileStorageEnabled(uid)) return null;
  if (pageSpan) {
    const fullText = await loadDocumentTextFromDrive(uid, file.id);
    if (fullText) {
      const pageText = fullText.slice(pageSpan.startChar, pageSpan.endChar);
      if (hasPageContent(pageText)) {
        saveExtractedText(pageTextKey(file.id, page), pageText).catch(() => {});
        return pageText;
      }
    }
  }
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
      if (!hit || !hasPageContent(hit.text)) continue;
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

function hasPageContent(text: string): boolean {
  return text.replace(/\[Page\s+\d+\]:?\s*/gi, '').trim().length > 0;
}
