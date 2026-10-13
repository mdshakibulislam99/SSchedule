import { describe, it, expect } from 'vitest';
import {
  tokenizeQuery,
  scoreChapterForMessage,
  findTopicRelevantChapter,
  findReferencedPage,
  wantsExhaustiveExtraction,
} from './documentRetrieval';
import { DocumentChapter, StudyFile, DocumentPageSpan } from '../types';

const chapter = (
  index: number,
  title: string,
  extra: Partial<DocumentChapter> = {},
): DocumentChapter => ({
  index,
  title,
  textKey: `text-file-1-${index}`,
  charCount: 5000,
  startChar: (index - 1) * 5000,
  endChar: index * 5000,
  ...extra,
});

const file = (chapters: DocumentChapter[]): StudyFile =>
  ({
    id: 'file-1',
    name: 'Biology Notes.pdf',
    size: '1 MB',
    type: 'pdf',
    uploadedAt: 'Just now',
    summary: '',
    extractedDeadlines: [],
    keyTopics: [],
    structure: { unit: 'chapter', fileName: 'Biology Notes.pdf', totalChars: 20000, chapters },
  } as StudyFile);

describe('tokenizeQuery', () => {
  it('lowercases and strips stopwords and single chars', () => {
    const tokens = tokenizeQuery('What is the Mitochondria in chapter 3 about?');
    expect(tokens).toContain('mitochondria');
    expect(tokens).not.toContain('what');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('in');
    expect(tokens).not.toContain('is');
    // Chapter/page words carry no retrieval signal.
    expect(tokens).not.toContain('chapter');
  });

  it('handles empty input', () => {
    expect(tokenizeQuery('')).toEqual([]);
  });
});

describe('scoreChapterForMessage', () => {
  it('scores title matches higher than digest matches', () => {
    const titleHit = scoreChapterForMessage('mitochondria', chapter(1, 'The Mitochondria'));
    const digestHit = scoreChapterForMessage(
      'mitochondria',
      chapter(2, 'Cell Division', { digest: 'covers mitochondria and energy' }),
    );
    expect(titleHit).toBeGreaterThan(digestHit);
    expect(digestHit).toBeGreaterThan(0);
  });

  it('scores key concept hits between title and digest', () => {
    const score = scoreChapterForMessage(
      'photosynthesis',
      chapter(3, 'Respiration', { keyConcepts: ['Photosynthesis overview'] }),
    );
    expect(score).toBeGreaterThanOrEqual(2);
  });

  it('returns 0 when nothing matches', () => {
    expect(scoreChapterForMessage('quantum entanglement', chapter(4, 'Ancient Rome'))).toBe(0);
  });
});

describe('findTopicRelevantChapter', () => {
  const chapters = [
    chapter(1, 'The Cell Membrane', { digest: 'transport, osmosis, diffusion' }),
    chapter(2, 'Photosynthesis', { digest: 'chlorophyll, light reactions, calvin cycle' }),
    chapter(3, 'Cellular Respiration', { keyConcepts: ['Krebs cycle'] }),
  ];

  it('finds the chapter whose title matches the question topic', () => {
    const best = findTopicRelevantChapter('how does photosynthesis work?', [file(chapters)]);
    expect(best).not.toBeNull();
    expect(best!.chapter.index).toBe(2);
  });

  it('falls back to digest/concept overlap when titles miss', () => {
    const best = findTopicRelevantChapter('explain the krebs cycle steps', [file(chapters)]);
    expect(best).not.toBeNull();
    expect(best!.chapter.index).toBe(3);
  });

  it('returns null (no retrieval) for unrelated questions', () => {
    expect(findTopicRelevantChapter('what time is it?', [file(chapters)])).toBeNull();
  });

  it('returns null when no file has chapter structure', () => {
    expect(findTopicRelevantChapter('photosynthesis', [file([])])).toBeNull();
  });
});

describe('findReferencedPage', () => {
  const span = (page: number): DocumentPageSpan => ({
    page,
    startChar: (page - 1) * 100,
    endChar: page * 100,
  });
  const paged = (): StudyFile =>
    ({
      ...file([chapter(1, 'Intro')]),
      pageIndex: { unit: 'page', totalPages: 5, pages: [] },
    } as StudyFile);

  // A file whose pageIndex covers pages 1-5.
  const indexed = (): StudyFile => {
    const f = paged();
    f.pageIndex!.pages = [1, 2, 3, 4, 5].map((n) => ({ ...span(n), textKey: `k${n}`, charCount: 100 }));
    return f;
  };

  it('detects "page N" when the page index covers it', () => {
    const best = findReferencedPage('summarize page 3', [indexed()]);
    expect(best).not.toBeNull();
    expect(best!.page).toBe(3);
  });

  it('detects "p. N" shorthand', () => {
    expect(findReferencedPage('what is on p. 42', [indexed()])).toBeNull();
    const best = findReferencedPage('what is on p. 2', [indexed()]);
    expect(best!.page).toBe(2);
  });

  it('detects Chinese 第 N 页', () => {
    expect(findReferencedPage('第 4 页讲了什么', [indexed()])!.page).toBe(4);
  });

  it('returns null when the referenced page is outside the index', () => {
    expect(findReferencedPage('read page 99', [indexed()])).toBeNull();
  });

  it('returns null when the file has no page index', () => {
    expect(findReferencedPage('read page 2', [file([chapter(1, 'Intro')])])).toBeNull();
  });
});

describe('wantsExhaustiveExtraction', () => {
  it('flags "all/every + listable noun"', () => {
    expect(wantsExhaustiveExtraction('chapter 5 all word list give me')).toBe(true);
    expect(wantsExhaustiveExtraction('list every term in section 3')).toBe(true);
    expect(wantsExhaustiveExtraction('give me the complete character list')).toBe(true);
  });

  it('flags "word list" reverse phrasing', () => {
    expect(wantsExhaustiveExtraction('show the vocabulary list')).toBe(true);
  });

  it('flags Chinese 所有 + noun', () => {
    expect(wantsExhaustiveExtraction('第5章所有单词')).toBe(true);
  });

  it('does not flag ordinary questions', () => {
    expect(wantsExhaustiveExtraction('explain photosynthesis')).toBe(false);
    expect(wantsExhaustiveExtraction('what is on page 42?')).toBe(false);
  });

  it('handles empty input', () => {
    expect(wantsExhaustiveExtraction('')).toBe(false);
  });
});
