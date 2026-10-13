import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocumentChapter, DocumentPageSpan, DocumentStructure } from '../types';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
}

/**
 * Absolute safety ceilings so an enormous file can never lock up the app.
 * Real lecture decks, papers and textbooks land far below these limits —
 * extraction keeps every character of the document itself.
 */
const MAX_TEXT_CHARS = 2_000_000;
const MAX_PDF_PAGES = 2_000;

const TEXT_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'ts',
  'js',
  'tsx',
  'jsx',
  'py',
  'java',
  'c',
  'cpp',
  'html',
  'css',
  'xml',
  'yaml',
  'yml',
  'rst',
  'tex',
];

/** The complete result of an extraction: full text + structural map. */
export interface ExtractedDocument {
  text: string;
  structure: DocumentStructure | null;
  /**
   * Per-page character spans (PDFs and slide decks): every physical
   * page's text is addressable inside `text`. Null for formats with
   * no page concept (plain text, DOCX).
   */
  pages: DocumentPageSpan[] | null;
}

interface DocumentSection {
  title: string;
  text: string;
  startPage?: number;
  endPage?: number;
  slide?: number;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function cleanHeading(text: string): string {
  return text
    .replace(/^#{1,6}\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[.:;\-–—]+$/, '')
    .trim()
    .slice(0, 90) || 'Untitled section';
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Sorts OOXML part names (slide3.xml, slide10.xml, ...) by numeric suffix. */
function byNumericSuffix(a: string, b: string): number {
  const num = (s: string) => {
    const m = s.match(/(\d+)\.xml$/);
    return m ? parseInt(m[1], 10) : 0;
  };
  return num(a) - num(b);
}

async function loadJsZip(): Promise<any> {
  const mod = await import('jszip');
  return mod.default ?? mod;
}

function parseXmlSafely(xml: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return null;
    return doc;
  } catch {
    return null;
  }
}

/** Pulls all `<a:t>` run text out of a DrawingML part (slides / notes). */
function extractDrawingText(xmlDoc: Document): string {
  const runs = xmlDoc.getElementsByTagNameNS(
    'http://schemas.openxmlformats.org/drawingml/2006/main',
    't'
  );
  const parts: string[] = [];
  for (let i = 0; i < runs.length; i++) {
    const text = runs[i].textContent;
    if (text && text.trim()) parts.push(text.trim());
  }
  return parts.join(' ');
}

/**
 * Builds the final full text + chapter map from detected sections.
 * For slide decks every chapter is also emitted as a page span.
 * Exported for tests.
 */
export function assembleStructure(
  sections: DocumentSection[],
  unit: DocumentStructure['unit'],
  fileName: string
): ExtractedDocument {
  let fullText = '';
  const chapters: DocumentChapter[] = sections.map((section, i) => {
    const startChar = fullText.length;
    const header =
      unit === 'slide'
        ? `\n[Slide ${section.slide ?? i + 1}]: ${section.title}\n`
        : section.startPage != null
          ? `\n[Chapter ${i + 1}${section.endPage && section.endPage !== section.startPage ? ` · Pages ${section.startPage}–${section.endPage}` : section.startPage ? ` · Page ${section.startPage}` : ''}]: ${section.title}\n`
          : `\n[Section ${i + 1}]: ${section.title}\n`;
    fullText += `${header}${section.text}\n`;
    return {
      index: i + 1,
      title: section.title,
      textKey: `ch-${i + 1}`,
      charCount: fullText.length - startChar,
      startPage: section.startPage,
      endPage: section.endPage,
      slide: section.slide,
      startChar,
      endChar: fullText.length,
    };
  });

  // Slide decks: one page per slide (slides are the pages of a deck).
  const pages: DocumentPageSpan[] | null =
    unit === 'slide'
      ? chapters.map((c, idx) => ({ page: c.slide ?? idx + 1, startChar: c.startChar, endChar: c.endChar }))
      : null;

  return {
    text: fullText,
    structure: { unit, fileName, totalChars: fullText.length, chapters },
    pages,
  };
}

/* ------------------------------------------------------------------ */
/* PDF — every page, with font-size heading detection                  */
/* ------------------------------------------------------------------ */

interface PdfLine {
  text: string;
  maxFont: number;
}

/** Groups a PDF page's text items into visual lines with font sizes. */
async function extractPdfPageLines(page: any): Promise<PdfLine[]> {
  const textContent = await page.getTextContent();
  const lineMap = new Map<number, { text: string; maxFont: number }>();
  for (const item of textContent.items) {
    const str = 'str' in item ? item.str : '';
    if (!str.trim()) continue;
    const y = Math.round((item.transform?.[5] ?? 0) / 4);
    const fontSize = Math.abs(item.transform?.[0] ?? 0) || item.height || 0;
    const entry = lineMap.get(y);
    if (entry) {
      entry.text += ` ${str}`;
      entry.maxFont = Math.max(entry.maxFont, fontSize);
    } else {
      lineMap.set(y, { text: str, maxFont: fontSize });
    }
  }
  return Array.from(lineMap.values())
    .map((l) => ({ text: l.text.trim(), maxFont: l.maxFont }))
    .filter((l) => l.text.length > 0);
}

/** Heuristic: is this visual line a chapter/section heading? */
function looksLikeHeading(line: PdfLine, bodySize: number): boolean {
  const text = line.text.trim();
  const len = text.length;
  if (len < 2 || len > 140) return false;
  // Explicit structural labels: "Chapter 6", "Unit 3.2", "Appendix A", "Week 4"
  if (/^(chapter|unit|part|module|lecture|week|appendix|lesson)\s+[0-9]+[a-z]?/i.test(text)) return true;
  // Markdown-style heading
  if (/^#{1,6}\s+\S/.test(text)) return true;
  // Numbered headings like "6.2 Graph Traversal" (must also be visually larger)
  if (/^\d+(\.\d+){0,2}\s+[A-Z(]/.test(text) && len < 110 && line.maxFont >= bodySize * 1.1) return true;
  // Clearly larger font than body text
  if (line.maxFont >= Math.max(15, bodySize * 1.45) && len < 110) return true;
  // ALL-CAPS short titles
  if (text === text.toUpperCase() && /[A-Z]{4,}/.test(text) && len < 60 && line.maxFont >= bodySize * 1.2) return true;
  return false;
}

async function extractPdfDocument(file: Blob): Promise<ExtractedDocument> {
  const buffer = await file.arrayBuffer();
  const loadingTask = getDocument({
    data: buffer,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/cmaps/',
    cMapPacked: true,
  });
  const pdf = await loadingTask.promise;
  const pagesToExtract = Math.min(pdf.numPages, MAX_PDF_PAGES);

  // Calibrate the body font size from the first text-bearing pages.
  const fontSamples: number[] = [];
  for (let i = 1; i <= Math.min(pagesToExtract, 8) && fontSamples.length < 40; i++) {
    const page = await pdf.getPage(i);
    const lines = await extractPdfPageLines(page);
    for (const line of lines) {
      if (line.text.length > 40) {
        fontSamples.push(line.maxFont);
        if (fontSamples.length >= 40) break;
      }
    }
  }
  const bodySize = fontSamples.length > 0 ? median(fontSamples) : 11;

  let sections: DocumentSection[] = [];
  let current: DocumentSection | null = null;

  for (let i = 1; i <= pagesToExtract; i++) {
    const page = await pdf.getPage(i);
    const lines = await extractPdfPageLines(page);
    let pageHeader = `\n[Page ${i}]:\n`;
    for (const line of lines) {
      if (looksLikeHeading(line, bodySize)) {
        if (current) {
          current.endPage = Math.max(current.endPage ?? 0, i - 1);
          if (current.text.trim()) sections.push(current);
        }
        current = { title: cleanHeading(line.text), text: pageHeader + line.text, startPage: i, endPage: i };
        pageHeader = '';
      } else if (current) {
        if (pageHeader) {
          current.text += pageHeader;
          pageHeader = '';
        }
        current.text += ` ${line.text}`;
      } else {
        // Content before any heading starts the opening section.
        current = { title: 'Introduction', text: pageHeader + line.text, startPage: i, endPage: i };
        pageHeader = '';
      }
    }
    // A page with no extractable text (blank page or image-only page)
    // would otherwise lose its [Page N]: marker, silently dropping that
    // page from the per-page index. Preserve it: if content has already
    // started, append the marker to the current section; if this is a
    // leading text-less page, anchor it in an opening section so the
    // per-page index still records page N. Page spans must align to real
    // physical pages, never skip one.
    if (pageHeader) {
      if (current) {
        current.text += pageHeader;
      } else {
        current = { title: 'Introduction', text: pageHeader, startPage: i, endPage: i };
      }
    }
  }
  if (current && current.text.trim()) sections.push(current);

  // No headings detected: fall back to fixed page ranges so the
  // document still has navigable sections.
  if (sections.length <= 1 && pagesToExtract > 10) {
    const whole = sections[0]?.text || '';
    const pageParts = whole.split(/(?=\[Page \d+\]:)/).filter((p) => p.trim());
    const ranged: DocumentSection[] = [];
    const PAGE_GROUP = 10;
    for (let g = 0; g < pageParts.length; g += PAGE_GROUP) {
      const group = pageParts.slice(g, g + PAGE_GROUP);
      const first = parseInt(group[0].match(/\[Page (\d+)\]/)?.[1] || '1', 10);
      const last = parseInt(group[group.length - 1].match(/\[Page (\d+)\]/)?.[1] || String(first), 10);
      ranged.push({
        title: `Pages ${first}–${last}`,
        text: group.join(''),
        startPage: first,
        endPage: last,
      });
    }
    if (ranged.length > 1) sections = ranged;
  }

  const assembled = assembleStructure(
    sections,
    sections.length > 1 ? 'chapter' : 'page-range',
    'document',
  );

  // Page-level index: every physical page's text is delimited by the
  // "[Page N]:" markers the extractor embedded in the full text.
  const spans: DocumentPageSpan[] = [];
  const marker = /\[Page (\d+)\]:/g;
  let prev: { page: number; start: number } | null = null;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(assembled.text)) !== null) {
    const pageNo = parseInt(match[1], 10);
    if (prev) spans.push({ page: prev.page, startChar: prev.start, endChar: match.index });
    prev = { page: pageNo, start: match.index };
  }
  if (prev) spans.push({ page: prev.page, startChar: prev.start, endChar: assembled.text.length });

  return { ...assembled, pages: spans.length > 0 ? spans : null };
}

/* ------------------------------------------------------------------ */
/* PPTX — every slide is a chapter, speaker notes included             */
/* ------------------------------------------------------------------ */

async function extractPptxSections(buffer: ArrayBuffer): Promise<DocumentSection[]> {
  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort(byNumericSuffix);
  const notesFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path))
    .sort(byNumericSuffix);

  const sections: DocumentSection[] = [];
  const sectionsBySlide = new Map<number, DocumentSection>();

  for (const path of slideFiles) {
    const xml = await zip.files[path].async('string');
    const doc = parseXmlSafely(xml);
    if (!doc) continue;
    const slideNo = parseInt(path.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
    const text = extractDrawingText(doc);
    if (!text) continue;
    const firstLine = text.split(/(?<=[.!?])\s/)[0] || text;
    const section: DocumentSection = {
      title: cleanHeading(firstLine.slice(0, 90)) || `Slide ${slideNo}`,
      text,
      slide: slideNo,
    };
    sections.push(section);
    sectionsBySlide.set(slideNo, section);
  }

  // Attach speaker notes to their slide so nothing the student sees is lost.
  for (const path of notesFiles) {
    const xml = await zip.files[path].async('string');
    const doc = parseXmlSafely(xml);
    if (!doc) continue;
    const noteNo = parseInt(path.match(/notesSlide(\d+)\.xml$/)?.[1] || '0', 10);
    const text = extractDrawingText(doc);
    const target = sectionsBySlide.get(noteNo);
    if (target && text) target.text += `\n[Speaker Notes]: ${text}`;
  }

  return sections;
}

/* ------------------------------------------------------------------ */
/* DOCX — heading styles define chapters                               */
/* ------------------------------------------------------------------ */

async function extractDocxSections(buffer: ArrayBuffer): Promise<DocumentSection[]> {
  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(buffer);
  const body = zip.files['word/document.xml'];
  if (!body) return [];
  const doc = parseXmlSafely(await body.async('string'));
  if (!doc) return [];

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const bodyEl = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!bodyEl) return [];

  const sections: DocumentSection[] = [];
  let current: DocumentSection = { title: 'Introduction', text: '' };

  for (const child of Array.from(bodyEl.children)) {
    if (child.namespaceURI !== W) continue;
    if (child.localName === 'p') {
      const pPr = child.getElementsByTagNameNS(W, 'pPr')[0];
      const styleVal = pPr
        ? (child.getElementsByTagNameNS(W, 'pStyle')[0] as Element | undefined)?.getAttributeNS(W, 'val') || ''
        : '';
      const isHeading = /^(Title|Subtitle|Heading\d*)$/i.test(styleVal);
      const paraText = Array.from(child.getElementsByTagNameNS(W, 't'))
        .map((t) => t.textContent || '')
        .join('')
        .trim();
      if (isHeading && paraText) {
        if (current.text.trim()) sections.push(current);
        current = { title: cleanHeading(paraText), text: paraText };
      } else if (paraText) {
        current.text += `\n${paraText}`;
      }
    } else if (child.localName === 'tbl') {
      const cellText = Array.from(child.getElementsByTagNameNS(W, 't'))
        .map((t) => t.textContent || '')
        .join(' ');
      if (cellText.trim()) current.text += `\n${cellText}`;
    }
  }
  if (current.text.trim()) sections.push(current);
  return sections;
}

/* ------------------------------------------------------------------ */
/* Plain text / Markdown — headings or fixed sections                  */
/* ------------------------------------------------------------------ */

function splitTextIntoSections(text: string): DocumentSection[] {
  const lines = text.split('\n');
  const sections: DocumentSection[] = [];
  let current: DocumentSection = { title: 'Introduction', text: '' };

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading =
      /^#{1,6}\s+\S/.test(trimmed) ||
      /^(chapter|unit|part|module|lecture|week|appendix)\s+[0-9]+/i.test(trimmed) ||
      (/^\d+(\.\d+){0,2}\s+\S/.test(trimmed) && trimmed.length < 70 && !trimmed.endsWith('.'));
    if (isHeading && trimmed.length < 140) {
      if (current.text.trim()) sections.push(current);
      current = { title: cleanHeading(trimmed), text: trimmed };
    } else {
      current.text += `\n${line}`;
    }
  }
  if (current.text.trim()) sections.push(current);
  return sections;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Extracts the COMPLETE textual content of uploaded files (PDFs, PPTX,
 * DOCX, Markdown, TXT, JSON, Code, etc.) together with a structural
 * chapter/section/slide map, so the AI can analyze every character and
 * the student can later learn from — and chat about — any specific
 * chapter without re-uploading.
 */
export async function extractDocumentFromFile(file: File | Blob, filename?: string): Promise<ExtractedDocument> {
  const name = filename || (file instanceof File ? file.name : 'document');
  const ext = name.split('.').pop()?.toLowerCase() || '';

  // 1. Text-based files
  if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/')) {
    try {
      const text = (await file.text()).slice(0, MAX_TEXT_CHARS);
      const sections = splitTextIntoSections(text).filter((s) => s.text.trim());
      return assembleStructure(sections, 'section', name);
    } catch (e) {
      console.warn('Text file read error:', e);
    }
    return { text: '', structure: null, pages: null };
  }

  // 2. PDF documents — every single page, structurally mapped
  if (ext === 'pdf' || file.type === 'application/pdf') {
    try {
      return await extractPdfDocument(file);
    } catch (pdfErr) {
      console.warn('PDF text extraction error:', pdfErr);
    }
    return { text: '', structure: null, pages: null };
  }

  // 3. PowerPoint presentations (PPTX)
  if (ext === 'pptx' || file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    try {
      const buffer = await file.arrayBuffer();
      const sections = (await extractPptxSections(buffer)).filter((s) => s.text.trim());
      if (sections.length > 0) return assembleStructure(sections, 'slide', name);
    } catch (pptErr) {
      console.warn('PPTX text extraction error:', pptErr);
    }
    return { text: '', structure: null, pages: null };
  }

  // 4. Word documents (DOCX)
  if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const buffer = await file.arrayBuffer();
      const sections = (await extractDocxSections(buffer)).filter((s) => s.text.trim());
      if (sections.length > 0) return assembleStructure(sections, 'chapter', name);
    } catch (docxErr) {
      console.warn('DOCX text extraction error:', docxErr);
    }
    return { text: '', structure: null, pages: null };
  }

  return { text: '', structure: null, pages: null };
}

/** Convenience wrapper: only the full extracted text. */
export async function extractTextFromFile(file: File | Blob, filename?: string): Promise<string> {
  const result = await extractDocumentFromFile(file, filename);
  return result.text;
}
