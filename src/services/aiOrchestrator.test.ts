import { describe, it, expect, vi, beforeEach } from 'vitest';

// The orchestrator imports the live DriveService singleton (for page-text
// retrieval) and reads apiUrl(); stub them so this unit test stays hermetic
// and never touches the network.
vi.mock('./documentIndexStore', () => ({
  loadDocumentIndexFromDrive: vi.fn(async () => null),
  loadDocumentText: vi.fn(async () => null),
  loadPageText: vi.fn(async () => null),
}));
vi.mock('../utils/fileStorage', () => ({
  loadExtractedText: vi.fn(async () => ''),
}));
vi.mock('../lib/api', () => ({
  apiUrl: (p: string) => `http://localhost${p}`,
}));

import { AIOrchestrator, AIExecutionContext } from './aiOrchestrator';
import {
  AIProviderConfig,
  AIProviderType,
  StudyFile,
  DocumentPageSpan,
  DocumentIndexedPage,
} from '../types';
import { loadPageText } from './documentIndexStore';

const configFor = (
  activeProvider: AIProviderType,
  overrides: Partial<AIProviderConfig> = {},
): AIProviderConfig => ({
  activeProvider,
  useHybridMode: true, // even if true, it must be ignored
  apiKeys: {
    gemini: 'gemini-key-present',
    claude: 'claude-key-present',
    openai: 'openai-key-present',
    puter: 'puter-token-present',
  },
  models: {
    openai: 'gpt-4o-mini',
    gemini: 'gemini-3.8-flash',
    claude: 'claude-3-5-sonnet-20241022',
    custom: 'custom-model',
    puter: 'openrouter:openrouter/free',
  },
  puterUser: null,
  ...overrides,
});

describe('AIOrchestrator.getProvider — single-model policy', () => {
  it('returns the selected provider regardless of task type', () => {
    for (const taskType of ['routine', 'deep_research', 'file_analysis'] as const) {
      expect(AIOrchestrator.getProvider(configFor('puter'), taskType).type).toBe('puter');
      expect(AIOrchestrator.getProvider(configFor('gemini'), taskType).type).toBe('gemini');
      expect(AIOrchestrator.getProvider(configFor('claude'), taskType).type).toBe('claude');
    }
  });

  it('does NOT escalate to Gemini for deep_research when Puter is selected', () => {
    // This is the exact regression the user reported: heavy tasks silently
    // using Gemini/Claude. Even with those keys present, Puter must win.
    const provider = AIOrchestrator.getProvider(configFor('puter'), 'deep_research');
    expect(provider.type).toBe('puter');
  });

  it('does NOT escalate to Claude for file_analysis when Puter is selected', () => {
    const provider = AIOrchestrator.getProvider(configFor('puter'), 'file_analysis');
    expect(provider.type).toBe('puter');
  });

  it('ignores useHybridMode even when it is true', () => {
    const provider = AIOrchestrator.getProvider(configFor('gemini', { useHybridMode: true }), 'routine');
    expect(provider.type).toBe('gemini');
  });

  it('maps every provider type to its own provider (custom included)', () => {
    expect(AIOrchestrator.getProvider(configFor('openai')).type).toBe('openai');
    expect(AIOrchestrator.getProvider(configFor('custom')).type).toBe('custom');
  });

  it('throws instead of silently falling back to another provider', () => {
    // @ts-expect-error deliberately invalid provider to test the guard
    expect(() => AIOrchestrator.getProvider(configFor('bogus'))).toThrow(/AI_NOT_CONFIGURED/);
  });
});

describe('AIOrchestrator.chatWithContext — page-specific answers', () => {
  const span = (page: number): DocumentIndexedPage => ({
    page,
    startChar: (page - 1) * 100,
    endChar: page * 100,
    textKey: `page-${page}`,
    charCount: 100,
  });
  const indexedFile = (): StudyFile =>
    ({
      id: 'file-1',
      name: 'Biology Notes.pdf',
      size: '1 MB',
      type: 'pdf',
      uploadedAt: 'Just now',
      summary: '',
      extractedDeadlines: [],
      keyTopics: [],
      pageIndex: { unit: 'page', totalPages: 5, pages: [1, 2, 3, 4, 5].map(span) },
    } as StudyFile);

  const context = (courseFiles: StudyFile[] = []): AIExecutionContext =>
    ({ courseFiles } as AIExecutionContext);

  beforeEach(() => {
    vi.mocked(loadPageText).mockClear();
  });

  it('returns a clear error when a referenced page has no extractable text', async () => {
    const file = indexedFile();
    vi.mocked(loadPageText).mockResolvedValueOnce(null);

    const res = await AIOrchestrator.chatWithContext(
      'summarize page 3',
      [],
      context([file]),
      configFor('puter'),
    );

    expect(loadPageText).toHaveBeenCalledWith(undefined, file, 3);
    expect(res.text).toContain('page 3');
    expect(res.text.toLowerCase()).toContain('extractable');
    expect(res.actions).toEqual([]);
    expect(res.suggestedChips).toEqual([]);
  });

  it('returns a clear error when the referenced page is not indexed or out of range', async () => {
    const file = indexedFile(); // covers pages 1-5 only
    vi.mocked(loadPageText).mockResolvedValueOnce(null);

    const res = await AIOrchestrator.chatWithContext(
      'read page 99',
      [],
      context([file]),
      configFor('puter'),
    );

    expect(loadPageText).not.toHaveBeenCalled();
    expect(res.text).toContain('Page 99');
    expect(res.text.toLowerCase()).toContain('indexed');
  });


  it('retrieves an exact passage from late in a long attached book instead of sending only its opening', async () => {
    const opening = 'This is introductory text about an unrelated topic. '.repeat(600);
    const target = 'The Moon Quartz correction rule subtracts atmospheric drift before calculating the final measurement.';
    const content = opening + target;
    const capturedPrompts: string[] = [];
    const providerSpy = vi.spyOn(AIOrchestrator, 'getProvider').mockReturnValue({
      type: 'puter',
      generateText: vi.fn(async (prompt: string) => { capturedPrompts.push(prompt); return 'The book says to subtract atmospheric drift first.'; }),
    } as any);
    const file = { ...indexedFile(), pageIndex: undefined } as StudyFile;
    const page: DocumentPageSpan = { page: 55, startChar: opening.length, endChar: content.length };
    try {
      const result = await AIOrchestrator.chatWithContext(
        'Explain the Moon Quartz correction rule',
        [],
        {
          ...context(),
          attachedMaterial: { name: file.name, content, file, pages: [page] },
        },
        configFor('puter'),
      );
      expect(result.text).toContain('subtract atmospheric drift');
      expect(capturedPrompts[0]).toContain('page 55');
      expect(capturedPrompts[0]).toContain(target);
      expect(capturedPrompts[0]).not.toContain(opening.slice(0, 20000));
    } finally {
      providerSpy.mockRestore();
    }
  });

  it('abstains when a long attached book has no matching passage', async () => {
    const content = 'The book contains material about cellular biology. '.repeat(500);
    const file = { ...indexedFile(), pageIndex: undefined } as StudyFile;
    const generateText = vi.fn(async () => 'This should not run without source evidence.');
    const providerSpy = vi.spyOn(AIOrchestrator, 'getProvider').mockReturnValue({
      type: 'puter',
      generateText,
    } as any);
    try {
      const result = await AIOrchestrator.chatWithContext(
        'Explain volcanology',
        [],
        { ...context(), attachedMaterial: { name: file.name, content, file } },
        configFor('puter'),
      );
      expect(result.text).toContain('couldn’t locate a matching passage');
      expect(generateText).not.toHaveBeenCalled();
    } finally {
      providerSpy.mockRestore();
    }
  });

  it('does not map a missing Chapter 14 to the first indexed section (printed Lesson 11)', async () => {
    const file = {
      ...indexedFile(),
      name: 'Xia.pdf',
      structure: {
        unit: 'chapter',
        fileName: 'Xia.pdf',
        totalChars: 120,
        chapters: [{
          index: 1,
          title: '第十一课 你去哪儿',
          textKey: 'chapter-1',
          charCount: 120,
          startChar: 0,
          endChar: 120,
        }],
      },
    } as StudyFile;
    const generateText = vi.fn(async () => 'This should not run for an absent chapter.');
    const providerSpy = vi.spyOn(AIOrchestrator, 'getProvider').mockReturnValue({
      type: 'puter', generateText,
    } as any);
    try {
      const result = await AIOrchestrator.chatWithContext(
        'What does Chapter 14 teach?', [], context([file]), configFor('puter'),
      );
      expect(result.text).toContain('couldn’t verify a printed heading');
      expect(result.text).not.toContain('Chapter 7');
      expect(generateText).not.toHaveBeenCalled();
    } finally {
      providerSpy.mockRestore();
    }
  });

  it('checks a source-based draft before returning it', async () => {
    const content = 'The Moon Quartz rule says subtract atmospheric drift before calculating the final measurement.';
    const generateText = vi.fn()
      .mockResolvedValueOnce('Subtract atmospheric drift before calculating the measurement.')
      .mockResolvedValueOnce('{"supported":true,"reason":"Directly stated in the source."}');
    const providerSpy = vi.spyOn(AIOrchestrator, 'getProvider').mockReturnValue({
      type: 'puter', generateText,
    } as any);
    try {
      const result = await AIOrchestrator.chatWithContext(
        'Explain the Moon Quartz rule', [],
        { ...context(), attachedMaterial: { name: 'Notes.txt', content } },
        configFor('puter'),
      );
      expect(result.text).toContain('Subtract atmospheric drift');
      expect(generateText).toHaveBeenCalledTimes(2);
      expect(generateText.mock.calls[1][0]).toContain('SOURCE EVIDENCE');
    } finally {
      providerSpy.mockRestore();
    }
  });

  it('labels a model-knowledge fallback when the source checker rejects a draft', async () => {
    const content = 'The notes discuss cellular biology and cell membranes.';
    const generateText = vi.fn()
      .mockResolvedValueOnce('The notes say volcanoes form from tectonic collisions.')
      .mockResolvedValueOnce('{"supported":false,"reason":"The source does not discuss volcanoes."}')
      .mockResolvedValueOnce('Volcanoes form when magma reaches the surface.');
    const providerSpy = vi.spyOn(AIOrchestrator, 'getProvider').mockReturnValue({
      type: 'puter', generateText,
    } as any);
    try {
      const result = await AIOrchestrator.chatWithContext(
        'Explain volcanoes', [],
        { ...context(), attachedMaterial: { name: 'Notes.txt', content } },
        configFor('puter'),
      );
      expect(result.text).toContain('couldn’t verify an answer from the uploaded file');
      expect(result.text).toContain('General answer');
      expect(result.text).toContain('Volcanoes form when magma reaches the surface.');
      expect(generateText).toHaveBeenCalledTimes(3);
    } finally {
      providerSpy.mockRestore();
    }
  });

  it('does not treat page numbers inside attached material as a page request', async () => {
    const file = indexedFile();
    vi.mocked(loadPageText).mockResolvedValueOnce(null);

    // The wrapped message mentions page 7 inside the attached material, but
    // the student's actual query ("explain photosynthesis") references none.
    // Since no page was referenced, chatWithContext proceeds past page
    // detection to the provider (which is unconfigured in this hermetic
    // test). The key assertion is that page 7 inside the material never
    // triggered loadPageText.
    const providerSpy = vi.spyOn(AIOrchestrator, 'getProvider').mockReturnValue({
      type: 'puter',
      generateText: vi.fn(async () => 'Photosynthesis converts light energy into chemical energy.'),
    } as any);
    try {
      await AIOrchestrator.chatWithContext(
        '[ATTACHED STUDY MATERIAL: "book.pdf"]\n...page 7 mentions mitochondria...\n\nStudent Query: explain photosynthesis',
        [],
        context([file]),
        configFor('puter'),
      );

      expect(loadPageText).not.toHaveBeenCalled();
    } finally {
      providerSpy.mockRestore();
    }
  });
});
