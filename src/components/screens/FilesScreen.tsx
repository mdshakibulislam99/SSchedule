import React, { useMemo, useState } from 'react';
import { UploadCloud, FileText, MoreVertical, Sparkles, CheckCircle2, Plus, Calendar, X, ArrowRight, Loader2, HelpCircle, Check, BookOpen, Clock, ListChecks, RotateCw } from 'lucide-react';
import { CourseResource, StudyFile, StudyNote, Task } from '../../types';
import { FileViewer } from '../course/FileViewer';
import { saveFileBlob } from '../../utils/fileStorage';
import { extractTextFromFile } from '../../utils/fileExtractor';

function createViewerResource(file: StudyFile): CourseResource {
  const lower = file.name.toLowerCase();
  const mime = lower.endsWith('.pdf')
    ? 'application/pdf'
    : lower.endsWith('.ppt') || lower.endsWith('.pptx')
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : lower.endsWith('.doc') || lower.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : lower.match(/\.(png|jpe?g|gif|webp|svg|bmp)$/)
          ? `image/${lower.endsWith('.svg') ? 'svg+xml' : lower.split('.').pop()}`
          : undefined;

  const type: CourseResource['type'] =
    file.type === 'pdf'
      ? 'pdf'
      : file.type === 'ppt'
        ? 'slide'
        : file.type === 'docx'
          ? 'docx'
          : file.type === 'image'
            ? 'link'
            : 'text';

  return {
    id: file.id,
    courseId: '',
    courseCode: file.courseCode || '',
    title: file.name,
    type,
    sourceUrl: undefined,
    content: file.summary || 'This uploaded resource is ready to read in app.',
    fileName: file.name,
    mime,
    fileData: file.dataUrl,
    fileStorageKey: file.fileStorageKey,
    estimatedReadMinutes: 5,
    tags: file.keyTopics || [],
    createdAt: file.uploadedAt,
    reading: { percent: 0, lastPosition: 0, completed: false },
  };
}

interface FilesScreenProps {
  files: StudyFile[];
  notes: StudyNote[];
  onUploadFile: (file: Partial<StudyFile> & { extractedContent?: string }) => void;
  onAddNote: (title: string, content: string) => void;
  onAskAIAboutFile: (file: StudyFile) => void;
  onCreateTasksFromFile: (file: StudyFile) => void;
  onReindexFile?: (fileId: string) => void;
  onAddTask?: (taskData: Partial<Task>) => void;
}

export const FilesScreen: React.FC<FilesScreenProps> = ({
  files,
  notes,
  onUploadFile,
  onAddNote,
  onAskAIAboutFile,
  onCreateTasksFromFile,
  onReindexFile,
  onAddTask,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'notes'>('files');
  const [selectedFile, setSelectedFile] = useState<StudyFile | null>(null);
  const [readerFile, setReaderFile] = useState<StudyFile | null>(null);
  const [fileTab, setFileTab] = useState<'file' | 'summary' | 'aiContext'>('file');
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  const canReadInApp = useMemo(() => (file: StudyFile) => Boolean(file.dataUrl || file.fileStorageKey), []);

  const handleSimulateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;

    const ext = uploaded.name.split('.').pop()?.toLowerCase() || '';
    const type: StudyFile['type'] =
      ext === 'pdf'
        ? 'pdf'
        : ext === 'ppt' || ext === 'pptx'
          ? 'ppt'
          : ['doc', 'docx', 'rtf', 'odt'].includes(ext)
            ? 'docx'
            : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
              ? 'image'
              : 'text';

    let fileStorageKey: string | undefined;

    try {
      fileStorageKey = await saveFileBlob(uploaded, `file-${crypto.randomUUID()}`);
    } catch {
      fileStorageKey = undefined;
    }

    // Extract text content automatically so AI gets rich material context
    const extractedContent = await extractTextFromFile(uploaded, uploaded.name);

    onUploadFile({
      name: uploaded.name,
      size: `${(uploaded.size / (1024 * 1024)).toFixed(1)} MB`,
      type,
      fileStorageKey,
      extractedContent,
    });
    setUploadNotice(`${uploaded.name} added · AI Auto-Indexing in background…`);
    window.setTimeout(() => setUploadNotice(null), 4000);
    e.target.value = '';
  };

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;
    onAddNote(noteTitle.trim(), noteContent.trim());
    setNoteTitle('');
    setNoteContent('');
    setIsNoteModalOpen(false);
  };

  return (
    <div className="w-full flex flex-col space-y-4 pb-6 animate-fade-in text-slate-900 dark:text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Files & Notes
        </h1>

        {activeTab === 'notes' && (
          <button
            onClick={() => setIsNoteModalOpen(true)}
            className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md active:scale-95"
            title="Add Note"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {uploadNotice && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 animate-fade-in">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">✓</span>
          {uploadNotice}
        </div>
      )}

      {/* Tabs (Matching Screen 13: Files / Notes) */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('files')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'files'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500'
          }`}
        >
          Files
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeTab === 'notes'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500'
          }`}
        >
          Notes
        </button>
      </div>

      {activeTab === 'files' ? (
        <div className="space-y-4">
          {/* Upload Area (Matching Screen 13) */}
          <label className="border-2 border-dashed border-indigo-200 dark:border-indigo-900/60 rounded-3xl p-6 bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50/70 transition-colors flex flex-col items-center justify-center text-center cursor-pointer group">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,image/*,video/*"
              onChange={handleSimulateUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30 group-hover:scale-105 transition-transform mb-2">
              <UploadCloud className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              Tap to upload
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              PDF, PPT, DOC, TXT, image, or video
            </span>
          </label>

          {/* Recent Files List (Matching Screen 13) */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              Recent Files
            </h3>

            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => {
                    setSelectedFile(file);
                    setFileTab('file');
                  }}
                  className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-500 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {file.name}
                        </span>
                        {file.aiContext?.status === 'ready' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 shrink-0">
                            <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                            AI Ready
                          </span>
                        )}
                        {file.aiContext?.status === 'analyzing' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 shrink-0 animate-pulse">
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-600" />
                            Indexing…
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {file.size} · Uploaded {file.uploadedAt}
                      </div>
                    </div>
                  </div>

                  <button className="p-1.5 text-slate-400 hover:text-slate-600">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Notes Tab */
        <div className="space-y-2.5">
          {notes.length === 0 ? (
            <div className="text-center py-10 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-200 p-6">
              <p className="text-xs text-slate-500">No notes saved yet.</p>
              <button
                onClick={() => setIsNoteModalOpen(true)}
                className="mt-2 text-xs font-bold text-indigo-600"
              >
                + Create first note
              </button>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{note.title}</h4>
                  <span className="text-[10px] text-slate-400 font-mono">{note.createdAt}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                  {note.content}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* File Detail & AI File Chat Modal (Section 14 & 15) */}
      {selectedFile && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in pb-24 sm:pb-6">
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-slide-up max-h-[85vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-2" />

            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate max-w-[260px]">
                  {selectedFile.name}
                </h3>
              </div>
              <button onClick={() => setSelectedFile(null)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-1 rounded-2xl bg-slate-100 dark:bg-slate-950 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFileTab('file')}
                className={`flex-1 rounded-xl py-2.5 transition-colors ${fileTab === 'file' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500'}`}
              >
                File
              </button>
              <button
                type="button"
                onClick={() => setFileTab('summary')}
                className={`flex-1 rounded-xl py-2.5 transition-colors ${fileTab === 'summary' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500'}`}
              >
                Summary
              </button>
              <button
                type="button"
                onClick={() => setFileTab('aiContext')}
                className={`flex-1 rounded-xl py-2.5 transition-colors flex items-center justify-center gap-1.5 ${fileTab === 'aiContext' ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-800 dark:text-emerald-400' : 'text-slate-500'}`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span>AI Context</span>
              </button>
            </div>

            {fileTab === 'file' && (
              <div className="h-[58vh] min-h-[320px] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                {canReadInApp(selectedFile) ? (
                  <FileViewer resource={createViewerResource(selectedFile)} mode="inline" />
                ) : (
                  <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-500">
                    The original file is unavailable. Re-upload it to view it here.
                  </div>
                )}
              </div>
            )}

            {fileTab === 'summary' && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {selectedFile.summary || 'No summary is available for this file.'}
              </div>
            )}

            {fileTab === 'aiContext' && (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {/* Status banner */}
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        {selectedFile.aiContext?.status === 'ready'
                          ? 'Auto-Indexed & Persisted'
                          : selectedFile.aiContext?.status === 'analyzing'
                            ? 'Indexing Material Context…'
                            : 'Context Ready'}
                      </p>
                      <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400">
                        Cached permanently for instant future AI learning
                      </p>
                    </div>
                  </div>
                  {onReindexFile && (
                    <button
                      type="button"
                      onClick={() => onReindexFile(selectedFile.id)}
                      className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-[11px] font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-1 shrink-0"
                      title="Re-run Gemini AI analysis on this file"
                    >
                      <RotateCw className="w-3 h-3 text-indigo-600" />
                      <span>Re-index</span>
                    </button>
                  )}
                </div>

                {/* Summary */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Executive Summary</h4>
                  <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                    {selectedFile.aiContext?.summary || selectedFile.summary || 'Document indexed for study.'}
                  </p>
                </div>

                {/* Key Concepts */}
                {selectedFile.aiContext?.keyConcepts && selectedFile.aiContext.keyConcepts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Key Concepts</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedFile.aiContext.keyConcepts.map((concept, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold border border-indigo-100 dark:border-indigo-900/60"
                        >
                          {concept}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dense Knowledge Digest */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                      Pre-Indexed Study Digest
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">Zero re-parsing needed</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line font-mono text-[11px] bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    {selectedFile.aiContext?.denseContext || 'Knowledge digest prepared for AI learning sessions.'}
                  </p>
                </div>

                {/* Comprehension Questions */}
                {selectedFile.aiContext?.studyQuestions && selectedFile.aiContext.studyQuestions.length > 0 && (
                  <div className="p-4 rounded-2xl bg-violet-50/50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/50 space-y-2">
                    <h4 className="text-xs font-bold text-violet-950 dark:text-violet-200 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-violet-600" />
                      Pre-Generated Study Questions
                    </h4>
                    <div className="space-y-1.5">
                      {selectedFile.aiContext.studyQuestions.map((q, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setSelectedFile(null);
                            onAskAIAboutFile(selectedFile);
                          }}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-violet-100/80 dark:border-violet-800/40 text-xs text-slate-700 dark:text-slate-200 hover:border-violet-400 cursor-pointer flex items-center justify-between gap-2 group transition-all"
                        >
                          <span className="italic">"{q}"</span>
                          <span className="text-[10px] font-bold text-indigo-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            Ask AI →
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested Tasks */}
                {selectedFile.aiContext?.suggestedTasks && selectedFile.aiContext.suggestedTasks.length > 0 && (
                  <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 space-y-2">
                    <h4 className="text-xs font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                      <ListChecks className="w-3.5 h-3.5 text-amber-600" />
                      Extracted Action Items
                    </h4>
                    <div className="space-y-1.5">
                      {selectedFile.aiContext.suggestedTasks.map((t, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-100/80 dark:border-amber-800/40 text-xs flex items-center justify-between gap-2"
                        >
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{t.title}</p>
                            <span className="text-[10px] text-slate-400 capitalize">{t.priority} priority · {t.estimatedMinutes}m</span>
                          </div>
                          {onAddTask && (
                            <button
                              type="button"
                              onClick={() => {
                                onAddTask({
                                  title: t.title,
                                  priority: t.priority,
                                  estimatedMinutes: t.estimatedMinutes,
                                  courseCode: selectedFile.courseCode || 'Study',
                                });
                                setUploadNotice(`Added task: ${t.title}`);
                                window.setTimeout(() => setUploadNotice(null), 3500);
                              }}
                              className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-500 shrink-0"
                            >
                              + Add Task
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {readerFile && (
        <FileViewer
          resource={createViewerResource(readerFile)}
          mode="focus"
          onExitFocus={() => setReaderFile(null)}
        />
      )}

      {/* Add Note Modal */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in pb-24 sm:pb-6">
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl animate-slide-up max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">New Study Note</h3>
              <button onClick={() => setIsNoteModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3 py-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chapter 3 Proof Notes"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Content
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Key concepts, formulas, ideas..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30"
              >
                Save Note
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
