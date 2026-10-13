import { describe, it, expect } from 'vitest';
import {
  tokenizeQuery,
  scoreChapterForMessage,
  findTopicRelevantChapter,
} from './documentRetrieval';
import { DocumentChapter, StudyFile } from '../types';

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
