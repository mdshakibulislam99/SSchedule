import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Maximize2, Minus, Plus, X } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CourseResource } from '../../types';
import { detectViewer } from '../../utils/viewer';
import { loadFileBlob } from '../../utils/fileStorage';

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

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

function buildGoogleViewerUrl(fileUrl: string): string {
  return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fileUrl)}`;
}

const PdfPages: React.FC<{ src: string; title: string }> = ({ src, title }) => {
  const pagesRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading PDF…');

  useEffect(() => {
    let cancelled = false;
    const pages = pagesRef.current;
    if (!pages) return undefined;
    pages.replaceChildren();

    const renderPdf = async () => {
      try {
        const pdf = await getDocument({ url: src }).promise;
        if (cancelled) return;
        setStatus('');

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'block w-full h-auto bg-white shadow-xl';
          canvas.setAttribute('aria-label', `${title}, page ${pageNumber}`);
          pages.appendChild(canvas);
          await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
        }
      } catch {
        if (!cancelled) setStatus('This PDF could not be rendered. Use Download to open the original file.');
      }
    };

    void renderPdf();
    return () => {
      cancelled = true;
      pages.replaceChildren();
    };
  }, [src, title]);

  return (
    <div className="h-full overflow-auto bg-white p-0 sm:p-2">
      {status && <p className="flex min-h-full items-center justify-center text-center text-sm text-white/70">{status}</p>}
      <div ref={pagesRef} className="mx-auto flex max-w-4xl flex-col gap-4" />
    </div>
  );
};

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
  const [storedBlobUrl, setStoredBlobUrl] = useState<string | null>(null);

  const isImage = viewer === 'image';
  const hasData = Boolean(resource.fileData || resource.fileStorageKey);
  const downloadName = resource.fileName || resource.title;
  const officeUrl = blobUrl || storedBlobUrl || resource.fileData || undefined;
  const googleViewerUrl = officeUrl ? buildGoogleViewerUrl(officeUrl) : undefined;

  // Non-image payloads are re-hydrated from base64 into an object URL.
  useEffect(() => {
    if (!resource.fileData || isImage) return;
    const url = dataUrlToBlobUrl(resource.fileData);
    setBlobUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [resource.fileData, isImage]);

  useEffect(() => {
    let active = true;
    if (!resource.fileStorageKey) return undefined;
    loadFileBlob(resource.fileStorageKey)
      .then((blob) => {
        if (active && blob) setStoredBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => undefined);
    return () => {
      active = false;
      setStoredBlobUrl((url) => {
        if (url) URL.revokeObjectURL(url);
        return null;
      });
    };
  }, [resource.fileStorageKey]);

  if (!hasData) return null;

  const resolvedFileUrl = blobUrl || storedBlobUrl;
  const href = resource.fileData || resolvedFileUrl || undefined;

  /** The actual surface — reused by both inline and focus layouts. */
  const surface = (
    <div className={`w-full h-full min-h-[320px] relative ${viewer === 'pdf' ? 'bg-white' : 'bg-slate-900 dark:bg-black'}`}>
      {viewer === 'pdf' && resolvedFileUrl && <PdfPages src={resolvedFileUrl} title={resource.title} />}

      {viewer === 'pdf' && !resolvedFileUrl && (
        <div className="w-full h-full min-h-[320px] flex items-center justify-center text-sm text-white/70">
          Loading original PDF…
        </div>
      )}

      {viewer === 'image' && (
        <div className="w-full h-full overflow-auto p-4 flex items-start justify-center no-scrollbar">
          <img
            src={resource.fileData || storedBlobUrl || undefined}
            alt={resource.title}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            className="max-w-full rounded-lg shadow-2xl transition-transform"
          />
        </div>
      )}

      {viewer === 'video' && (blobUrl || storedBlobUrl) && (
        <video src={blobUrl || storedBlobUrl || undefined} controls playsInline className="w-full h-full object-contain bg-black" />
      )}

      {viewer === 'document' && googleViewerUrl && (
        <iframe
          src={googleViewerUrl}
          title={resource.title}
          className="w-full h-full min-h-[320px] border-0 bg-slate-900"
        />
      )}

      {viewer === 'document' && !googleViewerUrl && (
        <div className="w-full h-full flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center space-y-4">
            <p className="text-4xl">📄</p>
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white break-words">
                {resource.fileName || resource.title}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {VIEWER_LABEL.document} preview is not available offline.
              </p>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Open it below in the original app or keep a PDF version for a native in-app preview.
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

  return <div className="h-full overflow-hidden">{surface}</div>;
};

export default FileViewer;
