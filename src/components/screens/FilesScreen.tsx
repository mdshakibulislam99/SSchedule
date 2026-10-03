import React, { useMemo, useState } from 'react';
import { UploadCloud, FileText, MoreVertical, Sparkles, CheckCircle2, Plus, Calendar, X, ArrowRight } from 'lucide-react';
import { CourseResource, StudyFile, StudyNote } from '../../types';
import { FileViewer } from '../course/FileViewer';
import { saveFileBlob } from '../../utils/fileStorage';

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
  onUploadFile: (file: Partial<StudyFile>) => void;
  onAddNote: (title: string, content: string) => void;
  onAskAIAboutFile: (file: StudyFile) => void;
  onCreateTasksFromFile: (file: StudyFile) => void;
}

export const FilesScreen: React.FC<FilesScreenProps> = ({
  files,
  notes,
  onUploadFile,
  onAddNote,
  onAskAIAboutFile,
  onCreateTasksFromFile,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'notes'>('files');
  const [selectedFile, setSelectedFile] = useState<StudyFile | null>(null);
  const [readerFile, setReaderFile] = useState<StudyFile | null>(null);
  const [fileTab, setFileTab] = useState<'file' | 'summary'>('file');
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

    onUploadFile({
      name: uploaded.name,
      size: `${(uploaded.size / (1024 * 1024)).toFixed(1)} MB`,
      type,
      fileStorageKey,
    });
    setUploadNotice(`${uploaded.name} added`);
    window.setTimeout(() => setUploadNotice(null), 3500);
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
                      <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {file.name}
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
