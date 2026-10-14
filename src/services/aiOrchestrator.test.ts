import { describe, it, expect, vi } from 'vitest';

// The orchestrator imports the live DriveService singleton (for page-text
// retrieval) and reads apiUrl(); stub them so this unit test stays hermetic
// and never touches the network.
vi.mock('./documentIndexStore', () => ({
  loadPageText: vi.fn(async () => null),
}));
vi.mock('../utils/fileStorage', () => ({
  loadExtractedText: vi.fn(async () => ''),
}));
vi.mock('../lib/api', () => ({
  apiUrl: (p: string) => `http://localhost${p}`,
}));

import { AIOrchestrator } from './aiOrchestrator';
import { AIProviderConfig, AIProviderType } from '../types';

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
