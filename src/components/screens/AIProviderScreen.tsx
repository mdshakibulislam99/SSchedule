import React, { useState } from 'react';
import { ChevronLeft, Sparkles, Check, Key, LogIn, LogOut, CheckCircle2, ShieldCheck, Globe } from 'lucide-react';
import { AIProviderConfig, AIProviderType } from '../../types';
import { AIService } from '../../services/aiService';
import { playChime } from '../../utils/audio';

interface AIProviderScreenProps {
  config: AIProviderConfig;
  onSaveConfig: (config: AIProviderConfig) => void;
  onBack: () => void;
}

export const AIProviderScreen: React.FC<AIProviderScreenProps> = ({
  config,
  onSaveConfig,
  onBack,
}) => {
  const [activeProvider, setActiveProvider] = useState<AIProviderType>(config.activeProvider);
  const [useHybridMode, setUseHybridMode] = useState<boolean>(config.useHybridMode);
  const [apiKeys, setApiKeys] = useState(config.apiKeys || {});
  const [puterUser, setPuterUser] = useState(config.puterUser);
  const [isSigningInPuter, setIsSigningInPuter] = useState(false);
  const [puterStatusMsg, setPuterStatusMsg] = useState<string | null>(null);

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
      description: 'Open source, free zero-key cloud AI access via your Puter login.',
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

  const handlePuterSignIn = async () => {
    setIsSigningInPuter(true);
    setPuterStatusMsg(null);
    try {
      const user = await AIService.signInPuter();
      if (user) {
        setPuterUser(user);
        setActiveProvider('puter');
        setPuterStatusMsg(`Connected as @${user.username}`);
        playChime('success');
      }
    } catch (e: any) {
      setPuterStatusMsg(e?.message || 'Puter login cancelled');
    } finally {
      setIsSigningInPuter(false);
    }
  };

  const handlePuterSignOut = async () => {
    await AIService.signOutPuter();
    setPuterUser(null);
    setPuterStatusMsg('Signed out of Puter.js');
  };

  const handleSave = () => {
    onSaveConfig({
      ...config,
      activeProvider,
      useHybridMode,
      apiKeys,
      puterUser,
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

              {/* Puter Specific Sign In Button */}
              {p.id === 'puter' && isSelected && (
                <div className="mt-3 pt-3 border-t border-indigo-100 dark:border-indigo-900/60">
                  {puterUser ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Connected as @{puterUser.username}</span>
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePuterSignOut();
                        }}
                        className="text-xs text-rose-500 font-semibold hover:underline"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePuterSignIn();
                      }}
                      disabled={isSigningInPuter}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-2 hover:bg-indigo-500 transition-colors"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>{isSigningInPuter ? 'Connecting...' : 'Sign in with Puter.js Account'}</span>
                    </button>
                  )}
                  {puterStatusMsg && <p className="text-[11px] text-indigo-500 mt-1">{puterStatusMsg}</p>}
                </div>
              )}

              {/* API Key Input for external models */}
              {(p.id === 'openai' || p.id === 'claude' || p.id === 'gemini') && isSelected && (
                <div className="mt-3 pt-3 border-t border-indigo-100 dark:border-indigo-900/60" onClick={(e) => e.stopPropagation()}>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    {p.name} API Key
                  </label>
                  <input
                    type="password"
                    placeholder="Enter your API key (Stored locally)..."
                    value={apiKeys[p.id] || ''}
                    onChange={(e) => setApiKeys({ ...apiKeys, [p.id]: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
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
