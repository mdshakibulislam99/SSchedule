import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronDown, Check, CheckCircle2, Loader2, X } from 'lucide-react';
import { AIProviderConfig, AIProviderType } from '../../types';
import { playChime } from '../../utils/audio';
import { apiUrl } from '../../lib/api';

interface AIProviderScreenProps {
  config: AIProviderConfig;
  onSaveConfig: (config: AIProviderConfig) => void;
  onBack: () => void;
}

interface PuterModel {
  value: string; // model id passed to the API
  label: string; // human-readable name
  provider: string; // e.g. "openrouter", "google"
  free: boolean; // zero-cost on Puter's free plan
}

export const AIProviderScreen: React.FC<AIProviderScreenProps> = ({
  config,
  onSaveConfig,
  onBack,
}) => {
  const [activeProvider, setActiveProvider] = useState<AIProviderType>(config.activeProvider);
  const [useHybridMode, setUseHybridMode] = useState<boolean>(config.useHybridMode);
  const [apiKeys, setApiKeys] = useState(config.apiKeys || {});

  // Per-provider connection-test state, so users can confirm a key/token works.
  const [testState, setTestState] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'error'>>({});
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});

  // Puter model catalogue (fetched live from Puter's free /models endpoint).
  // We split it into "free" (zero cost) and "all" so users can pick either.
  const [puterModels, setPuterModels] = useState<{ free: PuterModel[]; all: PuterModel[] }>({ free: [], all: [] });
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedPuterModel, setSelectedPuterModel] = useState<string>(config.models.puter || 'openrouter:openrouter/free');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setModelsLoading(true);
      try {
        const res = await fetch('https://api.puter.com/puterai/chat/models/details', {
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error('catalog fetch failed');
        const data = await res.json();
        const list: any[] = Array.isArray(data?.models) ? data.models : [];
        const isFree = (m: any): boolean => {
          const costs = m?.costs || {};
          const rates = Object.entries(costs).filter(([k]) => k !== 'tokens');
          return rates.length > 0 && rates.every(([, v]) => Number(v) === 0);
        };
        const toModel = (m: any): PuterModel => {
          // The API accepts the model `id` (or puterId). Prefer id, fall back to puterId.
          const value = m?.id || m?.puterId || '';
          const provider = (m?.puterId || value).split(':')[0] || 'other';
          return { value, label: m?.name || value, provider, free: isFree(m) };
        };
        const all = list.map(toModel).filter((m) => m.value);
        const free = all.filter((m) => m.free);
        if (!cancelled) setPuterModels({ free, all });
      } catch {
        if (!cancelled) setPuterModels({ free: [], all: [] });
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const providers: {
    id: AIProviderType;
    name: string;
    description: string;
    tag?: string;
    icon: string;
  }[] = [
    {
      id: 'openai',
      name: 'OpenAI (ChatGPT)',
      description: 'Powerful, accurate, and versatile. Excellent for reasoning.',
      tag: 'Recommended',
      icon: '⚡',
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      description: 'Great for research, multimodal syllabus docs, and fast response.',
      tag: 'Built-in Server',
      icon: '✨',
    },
    {
      id: 'puter',
      name: 'Puter.js',
      description: 'Open-source, free AI using your own Puter API token.',
      tag: 'Free AI',
      icon: '🚀',
    },
    {
      id: 'claude',
      name: 'Anthropic (Claude)',
      description: 'Great for long-form analysis, paper reading, and synthesis.',
      icon: '🧠',
    },
    {
      id: 'custom',
      name: 'Custom Provider',
      description: 'Connect your own self-hosted or compatible OpenAI endpoint.',
      icon: '🔌',
    },
  ];

  // Send a tiny real request through the same path the app uses, so the user
  // can confirm a key/token actually works before saving.
  const testApiKey = async (providerId: AIProviderType, puterModel?: string) => {
    const key = ((apiKeys as Record<string, string | undefined>)[providerId] || '').trim();
    if (!key) {
      setTestState((s) => ({ ...s, [providerId]: 'error' }));
      setTestMsg((m) => ({ ...m, [providerId]: 'Enter a key or token first.' }));
      return;
    }
    setTestState((s) => ({ ...s, [providerId]: 'testing' }));
    setTestMsg((m) => ({ ...m, [providerId]: '' }));

    const fail = (message: string) => {
      setTestState((s) => ({ ...s, [providerId]: 'error' }));
      setTestMsg((m) => ({ ...m, [providerId]: message }));
    };
    const ok = () => {
      setTestState((s) => ({ ...s, [providerId]: 'ok' }));
      setTestMsg((m) => ({ ...m, [providerId]: 'Connected — this key works.' }));
      playChime('success');
    };

    try {
      if (providerId === 'puter') {
        // Use Puter's free `/drivers/call` RPC (same path as puter.ai.chat()),
        // NOT the paid OpenAI-compatible endpoint.
        const res = await fetch('https://api.puter.com/drivers/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            interface: 'puter-chat-completion',
            method: 'complete',
            args: {
              model: puterModel || config.models.puter || 'openrouter:openrouter/free',
              messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
            },
          }),
        });
        if (!res.ok) {
          let detail = '';
          let code = '';
          try {
            const b = await res.json();
            detail = b?.error?.message || b?.message || '';
            code = b?.code || '';
          } catch {
            detail = await res.text().catch(() => '');
          }
          if (res.status === 401 || res.status === 403 || code === 'token_missing') {
            fail('Token rejected — check it in your Puter dashboard.');
          } else if (res.status === 402 || code === 'insufficient_funds') {
            fail('Free monthly allowance used up. Pick a “Free” model or wait for reset.');
          } else {
            fail(`Puter error (${res.status}). ${detail}`);
          }
          return;
        }
        const data = await res.json();
        // /drivers/call wraps: { success, result: { message: { content } } }
        const result = data?.result ?? data;
        const content = result?.message?.content;
        const hasText =
          (typeof content === 'string' && content.trim().length > 0) ||
          (Array.isArray(content) && content.length > 0);
        if (!hasText) {
          fail('Connected, but this model returned no text. Try another model.');
          return;
        }
        ok();
        return;
      }

      if (providerId === 'gemini') {
        const res = await fetch(apiUrl('/api/ai/gemini'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-gemini-key': key },
          body: JSON.stringify({ prompt: 'Reply with the single word: OK' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          fail(data.error || `Gemini error (${res.status}).`);
          return;
        }
        ok();
        return;
      }

      if (providerId === 'openai' || providerId === 'claude') {
        const res = await fetch(apiUrl('/api/ai/proxy'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ provider: providerId, prompt: 'Reply with the single word: OK' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          fail(data.error || `${providerId === 'openai' ? 'OpenAI' : 'Claude'} error (${res.status}).`);
          return;
        }
        ok();
        return;
      }
    } catch (err: any) {
      fail(err?.message || 'Connection test failed.');
    }
  };

  const handleSave = () => {
    onSaveConfig({
      ...config,
      activeProvider,
      useHybridMode,
      apiKeys: { ...apiKeys, puter: (apiKeys.puter || '').trim() || undefined },
      models: { ...config.models, puter: selectedPuterModel },
      puterUser: null,
    });
    playChime('success');
    onBack();
  };

  return (
    <div className="w-full flex flex-col space-y-5 pb-8 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between min-h-[44px]">
        <button
          onClick={onBack}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors flex items-center gap-1 text-xs font-semibold"
        >
          <ChevronLeft className="w-6 h-6" />
          <span>Settings</span>
        </button>

        <span className="text-sm font-bold">AI Provider</span>
        <div className="w-12" />
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          AI Provider
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Choose your preferred AI provider. You can change this anytime.
        </p>
      </div>

      {/* Provider Cards (Matching Screen 17 in reference image) */}
      <div className="space-y-3">
        {providers.map((p) => {
          const isSelected = activeProvider === p.id;
          return (
            <div
              key={p.id}
              onClick={() => setActiveProvider(p.id)}
              className={`p-4 rounded-3xl border transition-all cursor-pointer shadow-sm ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 dark:border-indigo-500 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <span className="text-2xl p-1 rounded-xl bg-slate-100 dark:bg-slate-800">{p.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</h3>
                      {p.tag && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                          {p.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* API key / token entry + connection test (OpenAI, Gemini, Claude, Puter) */}
              {(p.id === 'openai' || p.id === 'claude' || p.id === 'gemini' || p.id === 'puter') && isSelected && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {p.id === 'puter' ? 'Puter API Token' : `${p.name} API Key`}
                    </label>
                    {testState[p.id] === 'ok' && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={p.id === 'puter' ? 'Paste your Puter API token' : 'Paste your API key'}
                      value={apiKeys[p.id] || ''}
                      onChange={(e) => {
                        setApiKeys({ ...apiKeys, [p.id]: e.target.value });
                        setTestState((s) => ({ ...s, [p.id]: 'idle' }));
                        setTestMsg((m) => ({ ...m, [p.id]: '' }));
                      }}
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void testApiKey(p.id, p.id === 'puter' ? selectedPuterModel : undefined);
                      }}
                      disabled={testState[p.id] === 'testing'}
                      className={`shrink-0 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-60 ${
                        testState[p.id] === 'ok'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                      }`}
                    >
                      {testState[p.id] === 'testing' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing
                        </>
                      ) : testState[p.id] === 'ok' ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Works
                        </>
                      ) : (
                        'Test'
                      )}
                    </button>
                  </div>

                  {/* Puter model selector — free models first, then all models */}
                  {p.id === 'puter' && (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Model
                      </label>
                      <div className="relative">
                        <select
                          value={selectedPuterModel}
                          onChange={(e) => {
                            setSelectedPuterModel(e.target.value);
                            setTestState((s) => ({ ...s, puter: 'idle' }));
                            setTestMsg((m) => ({ ...m, puter: '' }));
                          }}
                          disabled={modelsLoading && puterModels.all.length === 0}
                          className="w-full appearance-none px-3.5 py-2.5 pr-9 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                        >
                          {modelsLoading && puterModels.all.length === 0 && (
                            <option>Loading models…</option>
                          )}
                          {puterModels.free.length > 0 && (
                            <optgroup label={`✅ Free models (${puterModels.free.length})`}>
                              {puterModels.free.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {puterModels.all.length > 0 && (
                            <optgroup label={`All models (${puterModels.all.length})`}>
                              {puterModels.all.map((m) => (
                                <option key={`all-${m.value}`} value={m.value}>
                                  {m.label} {m.free ? '· free' : ''}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {!modelsLoading && puterModels.all.length === 0 && (
                            <option value={selectedPuterModel}>{selectedPuterModel}</option>
                          )}
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                        Pick a <span className="font-semibold text-emerald-600 dark:text-emerald-400">Free</span> model
                        to use Puter at no cost. Paid models need a Puter subscription.
                      </p>
                    </div>
                  )}

                  {testState[p.id] === 'error' && testMsg[p.id] && (
                    <p className="flex items-start gap-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 leading-relaxed">
                      <X className="w-3.5 h-3.5 shrink-0 mt-px" /> {testMsg[p.id]}
                    </p>
                  )}

                  {p.id === 'puter' ? (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Free token from{' '}
                      <span className="font-semibold text-slate-600 dark:text-slate-300">puter.com/dashboard#account</span>{' '}
                      → Create token. Works free in the app and on the website.
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">Stored locally on this device.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hybrid Mode Toggle (Matching Screen 17: "Use hybrid mode") */}
      <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-slate-900 dark:text-white block">
            Use hybrid mode
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
            Automatically use the best model for each task (research, routine, files).
          </span>
        </div>
        <input
          type="checkbox"
          checked={useHybridMode}
          onChange={(e) => setUseHybridMode(e.target.checked)}
          className="w-5 h-5 rounded text-indigo-600 focus:ring-0 cursor-pointer"
        />
      </div>

      {/* Save Button */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition-all"
        >
          Save AI Provider Configuration
        </button>
      </div>
    </div>
  );
};
