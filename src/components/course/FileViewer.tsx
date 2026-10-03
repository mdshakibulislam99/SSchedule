import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Maximize2, Minus, Plus, X } from 'lucide-react';
import { CourseResource } from '../../types';
import { detectViewer } from '../../utils/viewer';

interface FileViewerProps {
  resource: CourseResource;
  /** 'inline' renders inside the reader; 'focus' renders full-screen. */
  mode: 'inline' | 'focus';
  onExitFocus?: () => void;
}

/** Turn a stored base64 data URL into an object URL (needed for PDF iframes). */
function dataUrlToBlobUrl(dataUrl: string): string | null {
  try {
    const [header, b64] = dataUrl.split(',');
    if (!b64) return null;
    const mime = (/data:([^;]+);/.exec(header) || [])[1] || 'application/octet-stream';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return null;
  }
}

const VIEWER_LABEL: Record<string, string> = {
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
  document: 'Document',
};

/**
 * Distraction-free viewer for real file payloads.
 * PDFs open in the browser's built-in reader, images/videos use native
 * elements — no third-party libraries required.
 */
export const FileViewer: React.FC<FileViewerProps> = ({ resource, mode, onExitFocus }) => {
  const viewer = detectViewer(resource.type, resource.mime, resource.fileName);
  const [zoom, setZoom] = useState(1);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const isImage = viewer === 'image';
  const hasData = Boolean(resource.fileData);
  const downloadName = resource.fileName || resource.title;

  // Non-image payloads are re-hydrated from base64 into an object URL.
  useEffect(() => {
    if (!resource.fileData || isImage) return;
    const url = dataUrlToBlobUrl(resource.fileData);
    setBlobUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [resource.fileData, isImage]);

  if (!hasData) return null;

  const href = resource.fileData || blobUrl || undefined;

  /** The actual surface — reused by both inline and focus layouts. */
  const surface = (
    <div className="w-full h-full min-h-[320px] bg-slate-900 dark:bg-black relative">
      {viewer === 'pdf' && blobUrl && (
        <iframe
          src={blobUrl}
          title={resource.title}
          allow="fullscreen"
          className="w-full h-full min-h-[320px] border-0 bg-slate-900"
        />
      )}

      {viewer === 'image' && (
        <div className="w-full h-full overflow-auto p-4 flex items-start justify-center no-scrollbar">
          <img
            src={resource.fileData}
            alt={resource.title}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            className="max-w-full rounded-lg shadow-2xl transition-transform"
          />
        </div>
      )}

      {viewer === 'video' && blobUrl && (
        <video src={blobUrl} controls playsInline className="w-full h-full object-contain bg-black" />
      )}

      {viewer === 'document' && (
        <div className="w-full h-full flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center space-y-4">
            <p className="text-4xl">📄</p>
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white break-words">
                {resource.fileName || resource.title}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {VIEWER_LABEL.document} previews need the original app.
              </p>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Open it below in PowerPoint / Keynote / Word, or export it as a PDF and add that
              instead to read it right here with no distractions.
            </p>
            <div className="flex gap-2">
              <a
                href={href}
                download={downloadName}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                <Download className="w-4 h-4" /> Download
              </a>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
              >
                <ExternalLink className="w-4 h-4" /> Open
              </a>
            </div>
          </div>
        </div>
      )}

      {viewer === 'image' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-2xl bg-black/70 backdrop-blur px-2 py-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10"
            aria-label="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-bold text-white/80 w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10"
            aria-label="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="px-2 py-2 rounded-xl text-[11px] font-bold text-white/70 hover:text-white hover:bg-white/10"
          >
            Fit
          </button>
        </div>
      )}
    </div>
  );

  if (mode === 'focus') {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 animate-fade-in">
        <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          <button
            type="button"
            onClick={onExitFocus}
            className="flex items-center gap-1.5 p-2 -ml-2 rounded-xl text-sm font-semibold text-white/70 hover:text-white"
          >
            <X className="w-5 h-5" />
            <span className="hidden sm:inline">Exit focus</span>
          </button>
          <p className="truncate text-sm font-bold text-white">{resource.title}</p>
          <span className="text-[11px] font-bold text-white/45 shrink-0">
            {VIEWER_LABEL[viewer || '']}
          </span>
        </header>
        <div className="flex-1 min-h-0">{surface}</div>
      </div>
    );
  }

  return (
    <div className="h-full rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800">
      {surface}
    </div>
  );
};

export default FileViewer;
