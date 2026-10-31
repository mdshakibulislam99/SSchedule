import { DocumentChapter, StudyFile } from '../types';

/** Common words that carry no retrieval signal. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these',
  'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'can',
  'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'have', 'has', 'had',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'about', 'into',
  'from', 'with', 'without', 'for', 'of', 'on', 'in', 'to', 'at', 'by', 'as', 'it', 'its',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'tell', 'say', 'says', 'said', 'please',
  'explain', 'define', 'describe', 'give', 'show', 'find', 'get', 'file', 'document',
  'chapter', 'chapters', 'section', 'sections', 'page', 'pages', 'slide', 'slides',
  'unit', 'units', 'module', 'modules', 'does', 'not', 'yes', 'no', 'there', 'their',
  'them', 'they', 'he', 'she', 'his', 'her', 'up', 'out', 'so', 'just', 'also', 'any',
  'some', 'all', 'each', 'every', 'much', 'many', 'more', 'most', 'other', 'such', 'only',
  'very', 'here', 'now', 'still', 'again', 'over', 'under', 'between', 'through',
]);

/**
 * Splits a student message into retrieval tokens (lowercase, stopwords
 * removed, 2+ chars). Exported for tests.
 */
export function tokenizeQuery(message: string): string[] {
  const words = (message || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const tokens: string[] = [];
  for (const word of words) {
    // Chinese/Japanese text commonly has no spaces. Add character bigrams
    // so adjacent topic terms can still match extracted document text.
    if (/\p{Script=Han}/u.test(word) && word.length > 2) {
      for (let i = 0; i < word.length - 1; i++) tokens.push(word.slice(i, i + 2));
    } else if (word.length >= 2 && !STOPWORDS.has(word)) {
      tokens.push(word);
    } else if (/\p{Script=Han}/u.test(word)) {
      tokens.push(word);
    }
  }
  return tokens;
}

/**
 * Ranks one chapter against a student message. Title hits weigh
 * highest (×3), AI key concepts ×2, digest term overlap ×1 (capped at
 * 4 so long digests don't dominate). Exported for tests.
 */
export function scoreChapterForMessage(
  message: string,
  chapter: DocumentChapter,
  digestOverride?: string,
): number {
  const tokens = tokenizeQuery(message);
  if (tokens.length === 0) return 0;
  const tokenSet = new Set(tokens);

  const titleTokens = new Set(tokenizeQuery(chapter.title));
  let score = 0;
  for (const t of tokenSet) if (titleTokens.has(t)) score += 3;

  for (const concept of chapter.keyConcepts || []) {
    const conceptTokens = new Set(tokenizeQuery(concept));
    for (const t of tokenSet) if (conceptTokens.has(t)) score += 2;
  }

  const digest = digestOverride ?? chapter.digest ?? '';
  if (digest) {
    const digestTokens = new Set(tokenizeQuery(digest.slice(0, 4000)));
    let hits = 0;
    for (const t of tokenSet) if (digestTokens.has(t)) hits += 1;
    score += Math.min(hits, 4);
  }

  return score;
}

/**
 * Detects exhaustive-extraction asks ("chapter 5 all word list",
 * "every term in section 3", "list all phrases", Chinese 所有…).
 * When true and chapter/page text was retrieved, the chat is
 * instructed to output the COMPLETE list, never a sample.
 * Exported for tests.
 */
export function wantsExhaustiveExtraction(message: string): boolean {
  const m = (message || '').toLowerCase();
  // Any "all/every/complete/whole/full" quantifier over listable items.
  const quantifier =
    /\b(all|every|complete|full|entire|whole)\b[\s\S]{0,40}\b(words?|terms?|vocab\w*|phrases?|sentences?|questions?|examples?|expressions?|characters?|idioms?|lines?|items?|entries|headings?|titles?|names?)\b/.test(m);
  const reverse =
    /\b(words?|terms?|vocab\w*|phrases?|sentences?|expressions?|characters?|idioms?)\s+(list|lists)\b/.test(m);
  const chinese = /所有|全部|每个/.test(m) && /词|字|句|表/.test(m);
  return quantifier || reverse || chinese;
}

/**
 * Picks the single best-matching chapter across the given files for a
 * topic-style question (no explicit "chapter N" reference). Requires a
 * meaningful score (≥3: at least one title/concept hit) so random
 * questions don't drag in unrelated chapters. Exported for tests.
 */
export function findTopicRelevantChapter(
  message: string,
  files: StudyFile[],
  minScore = 3,
): { file: StudyFile; chapter: DocumentChapter; score: number } | null {
  let best: { file: StudyFile; chapter: DocumentChapter; score: number } | null = null;
  for (const file of files) {
    const chapters = mergeIndexedChapters(file);
    if (!chapters || chapters.length === 0) continue;
    for (const chapter of chapters) {
      const score = scoreChapterForMessage(message, chapter);
      if (score > (best?.score ?? 0)) {
        best = { file, chapter, score };
      }
    }
    if (file.extractedTextKey) {
      for (const indexed of file.aiContext?.documentChunks || []) {
        const chapter: DocumentChapter = {
          index: indexed.index,
          title: indexed.summary || `Document section ${indexed.index}`,
          textKey: file.extractedTextKey,
          charCount: indexed.endChar - indexed.startChar,
          startChar: indexed.startChar,
          endChar: indexed.endChar,
          digest: indexed.digest,
          keyConcepts: indexed.keyConcepts,
        };
        const score = scoreChapterForMessage(message, chapter);
        if (score > (best?.score ?? 0)) best = { file, chapter, score };
      }
    }
  }
  return best && best.score >= minScore ? best : null;
}

export interface RelevantPassage {
  startChar: number;
  endChar: number;
  text: string;
  score: number;
  page?: number;
}

/**
 * Finds exact source windows when a question's wording is missing from AI
 * summaries or a document has no useful chapter headings.
 */
export function findRelevantPassages(
  message: string,
  text: string,
  pageSpans: Array<{ page: number; startChar: number; endChar: number }> = [],
  limit = 4,
  maxChars = 2600,
): RelevantPassage[] {
  if (!text?.trim() || limit < 1) return [];
  const terms = [...new Set(tokenizeQuery(message))];
  if (terms.length === 0) return [];
  const lowerText = text.toLowerCase();
  const weights = new Map<string, number>();
  for (const term of terms) {
    const count = Math.max(0, lowerText.split(term).length - 1);
    if (count > 0) weights.set(term, Math.log(1 + (lowerText.length + 1) / (count + 1)));
  }
  if (weights.size === 0) return [];

  const segments: RelevantPassage[] = [];
  const addRange = (rangeStart: number, rangeEnd: number, page?: number) => {
    const start = Math.max(0, Math.min(text.length, rangeStart));
    const end = Math.max(start, Math.min(text.length, rangeEnd));
    if (end <= start) return;
    let windowStart = start;
    while (windowStart < end) {
      let windowEnd = Math.min(windowStart + maxChars, end);
      if (windowEnd < end) {
        const lineBreak = text.lastIndexOf('\n', windowEnd);
        const sentenceBreak = text.lastIndexOf('. ', windowEnd);
        const preferred = Math.max(lineBreak, sentenceBreak);
        if (preferred > windowStart + 500) windowEnd = preferred + 1;
      }
      const passage = text.slice(windowStart, windowEnd).trim();
      if (passage) segments.push({ startChar: windowStart, endChar: windowEnd, text: passage, score: 0, page });
      if (windowEnd >= end) break;
      windowStart = Math.max(windowStart + 600, windowEnd - 350);
    }
  };

  const validSpans = pageSpans.filter((span) =>
    Number.isFinite(span.startChar) && Number.isFinite(span.endChar) &&
    span.startChar >= 0 && span.endChar > span.startChar && span.startChar < text.length
  );
  if (validSpans.length > 0) {
    for (const span of validSpans) addRange(span.startChar, span.endChar, span.page);
  } else {
    addRange(0, text.length);
  }

  for (const passage of segments) {
    const lowerPassage = passage.text.toLowerCase();
    let matched = 0;
    for (const [term, weight] of weights) {
      if (lowerPassage.includes(term)) { passage.score += weight; matched += 1; }
    }
    passage.score += matched / Math.max(weights.size, 1) * 2;
  }
  const queryPhrase = message.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const results = segments.filter((passage) => passage.score > 0);
  for (const passage of results) {
    const normalizedPassage = passage.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
    if (queryPhrase.length >= 8 && normalizedPassage.includes(queryPhrase)) passage.score += 4;
  }
  results.sort((a, b) => b.score - a.score || a.startChar - b.startChar);
  const selected: RelevantPassage[] = [];
  for (const passage of results) {
    if (selected.some((current) => current.startChar < passage.endChar && passage.startChar < current.endChar)) continue;
    selected.push(passage);
    if (selected.length >= limit) break;
  }
  return selected.sort((a, b) => a.startChar - b.startChar);
}
/** Keep physical offsets/text keys from extraction and enrich them with AI metadata. */
export function mergeIndexedChapters(file: StudyFile): DocumentChapter[] {
  const structural = file.structure?.chapters || [];
  const enriched = file.aiContext?.chapters || [];
  if (structural.length === 0) return enriched;
  const byIndex = new Map(enriched.map((chapter) => [chapter.index, chapter]));
  return structural.map((chapter) => ({ ...byIndex.get(chapter.index), ...chapter,
    digest: chapter.digest || byIndex.get(chapter.index)?.digest,
    keyConcepts: chapter.keyConcepts || byIndex.get(chapter.index)?.keyConcepts,
  }));
}

/**
 * Extracts the page number from an explicit single-page reference
 * ("page 42", "p. 42", "第 42 页"). Returns null when no page is
 * referenced. Exported so callers can distinguish "the student asked
 * about a specific page" from "no page was referenced at all".
 */
export function referencedPageNumber(message: string): number | null {
  const ref =
    message.match(/\bpages?\s*([0-9]+)\b/i) ||
    message.match(/\bp\.?\s*([0-9]+)\b/i) ||
    message.match(/第\s*([0-9]+)\s*页/i);
  if (!ref) return null;
  return parseInt(ref[1], 10);
}

/**
 * Detects an explicit single-page reference ("page 42", "p. 42",
 * "第 42 页") and returns the matching file + page number when that file
 * carries a per-page index covering it. Preferred over chapter ranges for
 * single-page questions because the per-page index holds the exact page
 * text. Exported for tests.
 */
export function findReferencedPage(
  message: string,
  files: StudyFile[],
): { file: StudyFile; page: number } | null {
  const page = referencedPageNumber(message);
  if (page === null) return null;
  for (const file of files) {
    if (file.pageIndex?.pages?.some((p) => p.page === page)) {
      return { file, page };
    }
  }
  return null;
}
