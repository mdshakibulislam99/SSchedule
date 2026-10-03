import React, { useState } from 'react';
import { UploadCloud, FileText, MoreVertical, Sparkles, CheckCircle2, Plus, Calendar, X, ArrowRight } from 'lucide-react';
import { StudyFile, StudyNote } from '../../types';

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
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (uploaded) {
      onUploadFile({
        name: uploaded.name,
        size: `${(uploaded.size / (1024 * 1024)).toFixed(1)} MB`,
        type: uploaded.name.endsWith('.pdf') ? 'pdf' : 'docx',
        summary: 'Analyzed course syllabus and lecture notes with extracted deadlines.',
        extractedDeadlines: [
          { title: `${uploaded.name.replace(/\.[^/.]+$/, '')} Final Milestone`, date: 'April 28, 11:59 PM' },
        ],
        keyTopics: ['Core Theory', 'Weekly Readings', 'Exam Weights'],
      });
    }
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
              accept=".pdf,.docx,.txt,image/*"
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
              PDF, DOC, TXT, or image (max 10MB)
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
                  onClick={() => setSelectedFile(file)}
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

            {/* AI File Summary */}
            <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Document Analysis</span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {selectedFile.summary || 'Document analyzed by StudyAI intelligence engine.'}
              </p>
            </div>

            {/* Extracted Deadlines */}
            {selectedFile.extractedDeadlines && selectedFile.extractedDeadlines.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Extracted Deadlines & Exams
                </h4>
                <div className="space-y-1.5">
                  {selectedFile.extractedDeadlines.map((dl, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{dl.title}</span>
                      <span className="font-mono text-rose-500 font-bold">{dl.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  const f = selectedFile;
                  setSelectedFile(null);
                  onAskAIAboutFile(f);
                }}
                className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30"
              >
                <Sparkles className="w-4 h-4" />
                <span>Ask AI About This File</span>
              </button>

              <button
                onClick={() => {
                  onCreateTasksFromFile(selectedFile);
                  setSelectedFile(null);
                }}
                className="w-full py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>Extract Tasks to Schedule</span>
              </button>
            </div>
          </div>
        </div>
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
