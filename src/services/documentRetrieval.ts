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
  const tokens = (message || '').toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g) || [];
  return tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
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
    const chapters = file.structure?.chapters?.length
      ? file.structure.chapters
      : file.aiContext?.chapters;
    if (!chapters || chapters.length === 0) continue;
    for (const chapter of chapters) {
      const score = scoreChapterForMessage(message, chapter);
      if (score > (best?.score ?? 0)) {
        best = { file, chapter, score };
      }
    }
  }
  return best && best.score >= minScore ? best : null;
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
  const ref =
    message.match(/\bpages?\s*([0-9]+)\b/i) ||
    message.match(/\bp\.?\s*([0-9]+)\b/i) ||
    message.match(/第\s*([0-9]+)\s*页/i);
  if (!ref) return null;
  const page = parseInt(ref[1], 10);
  for (const file of files) {
    if (file.pageIndex?.pages?.some((p) => p.page === page)) {
      return { file, page };
    }
  }
  return null;
}
