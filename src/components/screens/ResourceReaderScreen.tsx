import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  Edit3,
  Save,
  PenLine,
  Highlighter,
  Eraser,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  CheckCircle2,
  Circle,
  Sparkles,
  ListChecks,
  X,
} from 'lucide-react';
import { AIProviderConfig, Course, CourseResource, CourseResourceReading, ResourceAnnotation } from '../../types';
import { AIOrchestrator } from '../../services/aiOrchestrator';
import { ResourceContent } from '../course/ResourceContent';
import { FileViewer } from '../course/FileViewer';

interface ResourceReaderScreenProps {
  resource: CourseResource;
  course: Course;
  config: AIProviderConfig;
  onBack: () => void;
  onUpdateReading: (resourceId: string, patch: Partial<CourseResourceReading>) => void;
  annotations: ResourceAnnotation[];
  onSaveAnnotation: (annotation: ResourceAnnotation) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  aiConfigured: boolean;
  onAISetupRequired: () => void;
}

/** Strip markdown-ish syntax so text-to-speech reads clean prose. */
function toSpeechText(content: string): string {
  return content
    .replace(/#+\s?/g, '')
    .replace(/\*\*/g, '')
    .replace(/>\s?/g, '')
    .replace(/^-\s?/gm, '')
    .replace(/^\d+\.\s?/gm, '')
    .replace(/\n{2,}/g, '. ')
    .trim();
}

export const ResourceReaderScreen: React.FC<ResourceReaderScreenProps> = ({
  resource,
  course,
  config,
  onBack,
  onUpdateReading,
  annotations,
  onSaveAnnotation,
  onDeleteAnnotation,
  aiConfigured,
  onAISetupRequired,
}) => {
  const hasFile = Boolean(resource.fileData || resource.fileStorageKey);
  const [progress, setProgress] = useState(resource.reading.percent);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [aiPanel, setAiPanel] = useState<{ title: string; body: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [focus, setFocus] = useState(false);
  const [readerTab, setReaderTab] = useState<'view' | 'summarize' | 'notes'>(hasFile ? 'view' : 'summarize');
  const [currentPage, setCurrentPage] = useState(resource.reading.lastPage || 1);
  const [pageCount, setPageCount] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<'pen' | 'highlight' | 'eraser'>('pen');
  const [draftAnnotations, setDraftAnnotations] = useState(annotations);
  const [noteText, setNoteText] = useState('');
  const [notePage, setNotePage] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSaved = useRef(resource.reading.percent);

  const reading = resource.reading;
  const themeStyle = { bg: 'bg-white dark:bg-slate-900', text: 'text-slate-800 dark:text-slate-200' };

  // Resume from the last saved scroll position on mount.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !reading.lastPosition) return;
    const target = (reading.lastPosition / 100) * (el.scrollHeight - el.clientHeight);
    el.scrollTo({ top: Math.max(0, target) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.id]);

  // Stop speech when leaving the reader.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    const pct = scrollable > 0 ? Math.min(100, Math.round((el.scrollTop / scrollable) * 100)) : 100;
    setProgress(pct);
    // Persist every ~5% to avoid flooding storage.
    if (Math.abs(pct - lastSaved.current) >= 5) {
      lastSaved.current = pct;
      onUpdateReading(resource.id, {
        percent: pct,
        lastPosition: pct,
        lastReadAt: new Date().toISOString(),
        completed: reading.completed || pct >= 95,
      });
    }
  };

  const toggleComplete = () => {
    onUpdateReading(resource.id, {
      completed: !reading.completed,
      percent: !reading.completed ? 100 : reading.percent,
    });
  };

  const toggleSpeech = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(toSpeechText(resource.content));
    utterance.rate = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const words = useMemo(() => resource.content.trim().split(/\s+/).length, [resource.content]);

  const runAi = async (title: string, fn: () => Promise<string>) => {
    setAiLoading(true);
    setAiPanel({ title, body: '' });
    try {
      const body = await fn();
      setAiPanel({ title, body });
    } catch (e) {
      setAiPanel({ title, body: 'Sorry, the AI could not respond right now. Please try again.' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSummarize = () => {
    if (!aiConfigured) {
      onAISetupRequired();
      return;
    }
    setReaderTab('summarize');
    return runAi('Summary', () => AIOrchestrator.summarizeResource(resource, config));
  };

  const handleKeyTerms = () => {
    if (!aiConfigured) {
      onAISetupRequired();
      return;
    }
    setReaderTab('summarize');
    return runAi('Key terms', async () => {
      const terms = await AIOrchestrator.extractKeyTerms(resource, config);
      return terms.map((t) => `${t.term} — ${t.definition}`).join('\n');
    });
  };

  const handleSaveEdits = () => {
    annotations
      .filter((annotation) => !draftAnnotations.some((draft) => draft.id === annotation.id))
      .forEach((annotation) => onDeleteAnnotation(annotation.id));
    draftAnnotations.forEach(onSaveAnnotation);
    setEditMode(false);
  };

  const handleAddTextNote = (event: React.FormEvent) => {
    event.preventDefault();
    if (!noteText.trim()) return;
    const now = new Date().toISOString();
    setDraftAnnotations((prev) => [
      ...prev,
      {
        id: `annotation-${Date.now()}`,
        resourceId: resource.id,
        pageNumber: Math.max(1, notePage),
        kind: 'text',
        text: noteText.trim(),
        color: '#334155',
        width: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setNoteText('');
  };

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white select-none">
      {/* Permanent Fixed Header & Action Buttons (NEVER SCROLLS) */}
      <div className="shrink-0 w-full bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800/90 shadow-xs z-40">
        {/* Reader header */}
        <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 p-2 -ml-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="truncate max-w-[120px] font-bold">{course.code}</span>
          </button>
          <div className="min-w-0 text-center">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              {resource.type.toUpperCase()} · {resource.estimatedReadMinutes} min · {words} words
            </p>
          </div>
          <button
            onClick={toggleComplete}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              reading.completed
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {reading.completed ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Done</span>
              </>
            ) : (
              <>
                <Circle className="w-4 h-4" />
                <span>Mark Done</span>
              </>
            )}
          </button>
        </header>

        {/* Reading progress bar */}
        <div className="h-1 bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Fixed Action & Screen Controls */}
        <div className="flex flex-col gap-2 px-4 py-2.5 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setReaderTab('view')}
              disabled={!hasFile}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                readerTab === 'view'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100'
              } ${!hasFile ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <FileText className="w-3.5 h-3.5" /> View
            </button>

            <button
              onClick={handleKeyTerms}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-xs font-semibold shrink-0 transition-all"
            >
              <ListChecks className="w-3.5 h-3.5" /> Key terms
            </button>

            <button
              onClick={() => {
                setReaderTab('notes');
                setNotePage(currentPage);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                readerTab === 'notes'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
              }`}
            >
              <PenLine className="w-3.5 h-3.5" /> Notes
            </button>

            <button
              onClick={handleSummarize}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0 shadow-sm transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" /> Summarize
            </button>

            <button
              onClick={toggleSpeech}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                isSpeaking
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {isSpeaking ? 'Stop' : 'Read aloud'}
            </button>

            <button
              onClick={() => setFocus(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-semibold shrink-0 transition-all"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Focus
            </button>
          </div>

          {readerTab === 'view' && hasFile && (
            <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pt-0.5">
              {/* 1-Page area navigator buttons */}
              <div className="flex items-center gap-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 p-1 shrink-0 shadow-xs">
                <button
                  type="button"
                  onClick={() => {
                    const prev = Math.max(1, currentPage - 1);
                    setCurrentPage(prev);
                    onUpdateReading(resource.id, { lastPage: prev, lastReadAt: new Date().toISOString() });
                  }}
                  disabled={currentPage <= 1}
                  className="p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Previous Page"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span className="text-[11px] text-slate-400 mr-1">Pg</span>
                  <input
                    type="number"
                    min={1}
                    max={pageCount}
                    value={currentPage}
                    onChange={(event) => {
                      const p = Math.max(1, Math.min(pageCount, Number(event.target.value) || 1));
                      setCurrentPage(p);
                      onUpdateReading(resource.id, { lastPage: p, lastReadAt: new Date().toISOString() });
                    }}
                    className="w-10 bg-transparent text-center text-xs font-bold outline-none"
                    aria-label="Current page number"
                  />
                  <span className="text-slate-400 text-xs">/ {pageCount}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(pageCount, currentPage + 1);
                    setCurrentPage(next);
                    onUpdateReading(resource.id, { lastPage: next, lastReadAt: new Date().toISOString() });
                  }}
                  disabled={currentPage >= pageCount}
                  className="p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Next Page"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Annotation actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {editMode ? (
                  <>
                    <button
                      onClick={() => setAnnotationTool('pen')}
                      className={`p-1.5 rounded-xl shrink-0 transition-colors ${
                        annotationTool === 'pen'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                      aria-label="Pen"
                      title="Pen tool"
                    >
                      <PenLine className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setAnnotationTool('highlight')}
                      className={`p-1.5 rounded-xl shrink-0 transition-colors ${
                        annotationTool === 'highlight'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                      aria-label="Highlight"
                      title="Highlighter tool"
                    >
                      <Highlighter className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setAnnotationTool('eraser')}
                      className={`p-1.5 rounded-xl shrink-0 transition-colors ${
                        annotationTool === 'eraser'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                      aria-label="Eraser"
                      title="Eraser tool"
                    >
                      <Eraser className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleSaveEdits}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shrink-0 shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-xs font-semibold shrink-0 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Annotate
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reader Container (the ONLY area that scrolls) */}
      {readerTab === 'view' && hasFile ? (
        <div className="flex-1 min-h-0 w-full overflow-hidden relative">
          <FileViewer
            resource={resource}
            mode="inline"
            annotations={draftAnnotations}
            editMode={editMode}
            annotationTool={annotationTool}
            onAnnotationsChange={setDraftAnnotations}
            pageNumber={currentPage}
            onPageChange={(page, count) => {
              setCurrentPage(page);
              setPageCount(count);
              const pct = Math.round((page / count) * 100);
              setProgress(pct);
              onUpdateReading(resource.id, {
                percent: pct,
                lastPage: page,
                lastReadAt: new Date().toISOString(),
                completed: reading.completed || pct >= 95,
              });
            }}
          />
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`flex-1 min-h-0 overflow-y-auto no-scrollbar pb-16 ${
            readerTab === 'notes'
              ? 'p-0 flex flex-col'
              : `m-3 sm:m-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-8 ${themeStyle.bg} ${themeStyle.text}`
          }`}
        >
          {readerTab === 'notes' && (
            <div className="space-y-4 rounded-2xl border border-slate-200 p-5 m-3 sm:m-4 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">Page notes</h1>
                <p className="mt-1 text-xs text-slate-500">Notes are saved to this file and page.</p>
              </div>
              <form onSubmit={handleAddTextNote} className="space-y-2">
                <div className="flex gap-2">
                  <input type="number" min={1} value={notePage} onChange={(event) => setNotePage(Number(event.target.value))} className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950" aria-label="Page number" />
                  <input value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Add a note for this page" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950" />
                  <button type="submit" className="rounded-xl bg-indigo-600 px-3 py-2 text-white" aria-label="Add note"><Plus className="h-4 w-4" /></button>
                </div>
              </form>
              <div className="space-y-2">
                {draftAnnotations.filter((annotation) => annotation.kind === 'text').map((annotation) => (
                  <div key={annotation.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900">
                    <div><span className="font-bold text-indigo-600">Page {annotation.pageNumber}</span><p className="mt-1 text-slate-700 dark:text-slate-300">{annotation.text}</p></div>
                    <button type="button" onClick={() => setDraftAnnotations((prev) => prev.filter((item) => item.id !== annotation.id))} className="text-slate-400" aria-label="Delete note"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {draftAnnotations.filter((annotation) => annotation.kind === 'text').length === 0 && <p className="text-xs text-slate-500">No typed notes yet.</p>}
              </div>
              <button type="button" onClick={handleSaveEdits} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Save notes</button>
            </div>
          )}
          {readerTab === 'summarize' && (
            <>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-1">{resource.title}</h1>
              <p className="text-[11px] text-slate-400 mb-4">{course.name}</p>
              <ResourceContent content={resource.content} fontScale={1} lineHeight={1.7} />
            </>
          )}
        </div>
      )}

      {/* Distraction-free focus mode — hides all app chrome */}
      {focus && hasFile && (
        <FileViewer resource={resource} mode="focus" onExitFocus={() => setFocus(false)} />
      )}

      {focus && !hasFile && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white dark:bg-slate-950 animate-fade-in">
          <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFocus(false)}
              className="flex items-center gap-1.5 p-2 -ml-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
              <span className="hidden sm:inline">Exit focus</span>
            </button>
            <p className="truncate text-sm font-bold">{resource.title}</p>
            <span className="w-16 shrink-0" />
          </header>
          <div
            className={`flex-1 overflow-y-auto no-scrollbar px-5 sm:px-8 py-8 pb-24 ${themeStyle.bg} ${themeStyle.text}`}
          >
            <div className="max-w-2xl mx-auto">
              <ResourceContent
                content={resource.content}
                fontScale={1.05}
                lineHeight={1.7}
              />
            </div>
          </div>
        </div>
      )}

      {/* AI result panel */}
      {aiPanel && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in sm:items-center">
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                {aiPanel.title}
              </h3>
              <button onClick={() => setAiPanel(null)} className="p-1 text-slate-400" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="py-3">
              {aiLoading ? (
                <p className="text-xs text-slate-500 animate-pulse">StudyAI is thinking…</p>
              ) : (
                <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 space-y-2">
                  {aiPanel.body.split('\n').filter(Boolean).map((line, i) => (
                    <p key={i}>{line.replace(/\*\*/g, '')}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};