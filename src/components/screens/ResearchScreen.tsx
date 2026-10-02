import React, { useState } from 'react';
import { Search, Sparkles, BookOpen, ExternalLink, Bookmark, Plus, FileText, ArrowRight } from 'lucide-react';
import { ResearchItem, AIProviderConfig } from '../../types';
import { AIOrchestrator } from '../../services/aiOrchestrator';

interface ResearchScreenProps {
  researchItems: ResearchItem[];
  onSaveToNotes: (title: string, content: string) => void;
  onAskFollowUp: (query: string) => void;
  config: AIProviderConfig;
}

export const ResearchScreen: React.FC<ResearchScreenProps> = ({
  researchItems,
  onSaveToNotes,
  onAskFollowUp,
  config,
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'sources' | 'notes'>('summary');
  const [searchTopic, setSearchTopic] = useState('');
  const [currentResearch, setCurrentResearch] = useState<ResearchItem>(researchItems[0]);
  const [isSearching, setIsSearching] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTopic.trim()) return;

    setIsSearching(true);
    try {
      const res = await AIOrchestrator.researchTopic(searchTopic.trim(), config);
      setCurrentResearch(res);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveNotes = () => {
    onSaveToNotes(
      `${currentResearch.topic} Research Summary`,
      `${currentResearch.summary}\n\nKey Findings:\n${currentResearch.keyFindings.map((f) => `- ${f}`).join('\n')}`
    );
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="w-full flex flex-col space-y-4 pb-6 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Intelligence</span>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Research Report
          </h1>
        </div>
      </div>

      {/* Research Search Input */}
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          placeholder="Research any topic, theorem, or assignment..."
          value={searchTopic}
          onChange={(e) => setSearchTopic(e.target.value)}
          className="w-full pl-4 pr-10 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-sm"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Active Research Report Card (Matching Screen 12 in reference image) */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
            {currentResearch.topic}
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase shrink-0">
            Synthesized
          </span>
        </div>

        {/* Report Tabs (Matching Screen 12: Summary / Sources / Notes) */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
          {(['summary', 'sources', 'notes'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 rounded-lg transition-all capitalize ${
                activeTab === tab
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab 1: Summary */}
        {activeTab === 'summary' && (
          <div className="space-y-3.5">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {currentResearch.summary}
            </p>

            {/* Key Findings */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Key Findings
              </h3>
              <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                {currentResearch.keyFindings.map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Tab 2: Sources */}
        {activeTab === 'sources' && (
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Recommended Sources
            </h3>
            {currentResearch.sources.map((source, idx) => (
              <a
                key={idx}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 transition-colors text-xs group"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 truncate">
                    {source.title}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">{source.domain}</div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Tab 3: Notes */}
        {activeTab === 'notes' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Research Takeaways
            </h3>
            {currentResearch.notes.map((note, idx) => (
              <div
                key={idx}
                className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-xs text-indigo-950 dark:text-indigo-200"
              >
                {note}
              </div>
            ))}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="pt-2 flex flex-col gap-2">
          <button
            onClick={handleSaveNotes}
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/25 active:scale-[0.98] transition-all"
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>{savedSuccess ? 'Saved to Notes! ✓' : 'Save to Notes'}</span>
          </button>

          <button
            onClick={() => onAskFollowUp(`Tell me more about ${currentResearch.topic}`)}
            className="w-full py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Ask Follow-up in AI Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
};
