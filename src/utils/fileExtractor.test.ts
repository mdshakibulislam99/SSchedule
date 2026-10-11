import { describe, it, expect } from 'vitest';
import { extractDocumentFromFile } from './fileExtractor';

const mdContent = `# Course Notes

Intro paragraph about the course.

Chapter 1: Neural Networks

The first chapter covers perceptrons and activation functions.
It spans multiple paragraphs with several sentences here.

Chapter 2: Training Algorithms

The second chapter covers backpropagation and gradient descent.
More content for the second chapter follows here.
`;

describe('extractDocumentFromFile', () => {
  it('detects chapters in markdown text and computes offsets', async () => {
    const file = new File([mdContent], 'notes.md', { type: 'text/markdown' });
    const { text, structure } = await extractDocumentFromFile(file, 'notes.md');

    expect(structure).not.toBeNull();
    expect(structure!.unit).toBe('section');
    expect(structure!.chapters.length).toBeGreaterThanOrEqual(3); // intro + 2 chapters
    expect(structure!.totalChars).toBe(text.length);

    // Every chapter's slice must exist in the full text at its offsets
    for (const chapter of structure!.chapters) {
      const slice = text.slice(chapter.startChar, chapter.endChar);
      expect(slice.length).toBe(chapter.charCount);
      expect(slice.length).toBeGreaterThan(0);
    }

    const chapter2 = structure!.chapters.find((c) => c.title.toLowerCase().includes('training'));
    expect(chapter2).toBeDefined();
    expect(text.slice(chapter2!.startChar, chapter2!.endChar)).toContain('backpropagation');
  });

  it('returns empty result for binary blobs', async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'weird.bin');
    const { text, structure } = await extractDocumentFromFile(file, 'weird.bin');
    expect(text).toBe('');
    expect(structure).toBeNull();
  });
});
