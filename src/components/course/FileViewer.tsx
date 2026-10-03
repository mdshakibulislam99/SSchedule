import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Maximize2, Minus, Plus, X } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CourseResource, ResourceAnnotation } from '../../types';
import { detectViewer } from '../../utils/viewer';
import { loadFileBlob } from '../../utils/fileStorage';

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface FileViewerProps {
  resource: CourseResource;
  /** 'inline' renders inside the reader; 'focus' renders full-screen. */
  mode: 'inline' | 'focus';
  onExitFocus?: () => void;
  annotations?: ResourceAnnotation[];
  editMode?: boolean;
  annotationTool?: 'pen' | 'highlight' | 'eraser';
  onAnnotationsChange?: (annotations: ResourceAnnotation[]) => void;
  pageNumber?: number;
  onPageChange?: (pageNumber: number, pageCount: number) => void;
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

interface PdfPagesProps {
  src: string;
  title: string;
  resourceId: string;
  pageNumber: number;
  onPageChange?: (pageNumber: number, pageCount: number) => void;
  annotations: ResourceAnnotation[];
  editMode: boolean;
  annotationTool: 'pen' | 'highlight' | 'eraser';
  onAnnotationsChange?: (annotations: ResourceAnnotation[]) => void;
}

const PdfPages: React.FC<PdfPagesProps> = ({
  src,
  title,
  resourceId,
  pageNumber,
  onPageChange,
  annotations,
  editMode,
  annotationTool,
  onAnnotationsChange,
}) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pagesRef = React.useRef<HTMLDivElement>(null);
  const overlayRefs = React.useRef(new Map<number, HTMLCanvasElement>());
  const activePoints = React.useRef<{ x: number; y: number }[]>([]);
  const activePage = React.useRef<number | null>(null);
  const [status, setStatus] = useState('Loading PDF…');

  const redraw = (pageNumber: number) => {
    const canvas = overlayRefs.current.get(pageNumber);
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    annotations
      .filter((annotation) => annotation.pageNumber === pageNumber && annotation.points?.length)
      .forEach((annotation) => {
        const points = annotation.points || [];
        context.beginPath();
        points.forEach((point, index) => {
          const x = point.x * canvas.width;
          const y = point.y * canvas.height;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.strokeStyle = annotation.color;
        context.lineWidth = annotation.width * canvas.width;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.globalAlpha = annotation.kind === 'highlight' ? 0.28 : 1;
        context.stroke();
        context.globalAlpha = 1;
      });
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  useEffect(() => {
    let cancelled = false;
    const pages = pagesRef.current;
    if (!pages) return undefined;
    pages.replaceChildren();

    const renderPdf = async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Unable to load PDF (${response.status})`);
        const data = await response.arrayBuffer();
        const pdf = await getDocument({
          data,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/standard_fonts/',
          wasmUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/wasm/',
        }).promise;
        if (cancelled) return;
        setStatus('');
        onPageChange?.(pageNumber, pdf.numPages);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const wrapper = document.createElement('div');
          wrapper.className = 'relative w-full overflow-hidden bg-white shadow-xl';
          wrapper.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'absolute inset-0 block h-full w-full';
          canvas.setAttribute('aria-label', `${title}, page ${pageNumber}`);
          const overlay = document.createElement('canvas');
          overlay.width = viewport.width;
          overlay.height = viewport.height;
          overlay.className = `absolute inset-0 block h-full w-full ${editMode ? 'cursor-crosshair' : 'pointer-events-none'}`;
          overlayRefs.current.set(pageNumber, overlay);
          overlay.onpointerdown = (event) => {
            if (!editMode || !onAnnotationsChange) return;
            overlay.setPointerCapture(event.pointerId);
            activePage.current = pageNumber;
            activePoints.current = [pointFromEvent(event as unknown as React.PointerEvent<HTMLCanvasElement>)];
          };
          overlay.onpointermove = (event) => {
            if (!editMode || activePage.current !== pageNumber || !activePoints.current.length) return;
            activePoints.current.push(pointFromEvent(event as unknown as React.PointerEvent<HTMLCanvasElement>));
            redraw(pageNumber);
            const context = overlay.getContext('2d');
            if (!context) return;
            context.beginPath();
            activePoints.current.forEach((point, index) => {
              const x = point.x * overlay.width;
              const y = point.y * overlay.height;
              if (index === 0) context.moveTo(x, y);
              else context.lineTo(x, y);
            });
            context.strokeStyle = annotationTool === 'highlight' ? '#facc15' : '#ef4444';
            context.lineWidth = (annotationTool === 'highlight' ? 0.05 : 0.006) * overlay.width;
            context.lineCap = 'round';
            context.globalAlpha = annotationTool === 'highlight' ? 0.28 : 1;
            context.stroke();
            context.globalAlpha = 1;
          };
          overlay.onpointerup = () => {
            if (!editMode || activePage.current !== pageNumber || !activePoints.current.length || !onAnnotationsChange) return;
            const points = activePoints.current;
            const last = points[points.length - 1];
            if (annotationTool === 'eraser') {
              onAnnotationsChange(
                annotations.filter(
                  (annotation) =>
                    !annotation.points?.some((point) => Math.hypot(point.x - last.x, point.y - last.y) < 0.06)
                )
              );
            } else {
              const now = new Date().toISOString();
              onAnnotationsChange([
                ...annotations,
                {
                  id: `annotation-${Date.now()}`,
                  resourceId,
                  pageNumber,
                  kind: annotationTool === 'highlight' ? 'highlight' : 'ink',
                  points,
                  color: annotationTool === 'highlight' ? '#facc15' : '#ef4444',
                  width: annotationTool === 'highlight' ? 0.05 : 0.006,
                  createdAt: now,
                  updatedAt: now,
                },
              ]);
            }
            activePoints.current = [];
            activePage.current = null;
          };
          wrapper.appendChild(canvas);
          wrapper.appendChild(overlay);
          wrapper.dataset.page = String(pageNumber);
          pages.appendChild(wrapper);
          await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
          redraw(pageNumber);
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
  }, [src, title, resourceId, editMode, annotationTool, annotations]);

  useEffect(() => {
    const target = pagesRef.current?.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`);
    target?.scrollIntoView({ block: 'start' });
  }, [pageNumber]);

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const container = event.currentTarget;
        const wrappers = Array.from(container.querySelectorAll<HTMLElement>('[data-page]'));
        const visible = wrappers.reduce((closest, wrapper) => {
          const distance = Math.abs(wrapper.getBoundingClientRect().top - container.getBoundingClientRect().top);
          return distance < closest.distance ? { distance, page: Number(wrapper.dataset.page) } : closest;
        }, { distance: Number.POSITIVE_INFINITY, page: pageNumber });
        if (visible.page) onPageChange?.(visible.page, wrappers.length);
      }}
      className="h-full overflow-auto bg-white p-0 sm:p-2"
    >
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

const ImagePage: React.FC<{
  src: string;
  title: string;
  resourceId: string;
  annotations: ResourceAnnotation[];
  editMode: boolean;
  annotationTool: 'pen' | 'highlight' | 'eraser';
  onAnnotationsChange?: (annotations: ResourceAnnotation[]) => void;
}> = ({ src, title, resourceId, annotations, editMode, annotationTool, onAnnotationsChange }) => {
  const overlayRef = React.useRef<HTMLCanvasElement>(null);
  const pointsRef = React.useRef<{ x: number; y: number }[]>([]);

  const redraw = () => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    annotations.filter((annotation) => annotation.pageNumber === 1 && annotation.points?.length).forEach((annotation) => {
      context.beginPath();
      annotation.points?.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = annotation.color;
      context.lineWidth = annotation.width * canvas.width;
      context.lineCap = 'round';
      context.globalAlpha = annotation.kind === 'highlight' ? 0.28 : 1;
      context.stroke();
      context.globalAlpha = 1;
    });
  };

  useEffect(redraw, [annotations]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };

  const finishStroke = () => {
    if (!onAnnotationsChange || !pointsRef.current.length) return;
    const last = pointsRef.current[pointsRef.current.length - 1];
    if (annotationTool === 'eraser') {
      onAnnotationsChange(annotations.filter((annotation) => !annotation.points?.some((point) => Math.hypot(point.x - last.x, point.y - last.y) < 0.06)));
    } else {
      const now = new Date().toISOString();
      onAnnotationsChange([...annotations, { id: `annotation-${Date.now()}`, resourceId, pageNumber: 1, kind: annotationTool === 'highlight' ? 'highlight' : 'ink', points: pointsRef.current, color: annotationTool === 'highlight' ? '#facc15' : '#ef4444', width: annotationTool === 'highlight' ? 0.05 : 0.006, createdAt: now, updatedAt: now }]);
    }
    pointsRef.current = [];
  };

  return (
    <div className="relative flex min-h-full items-start justify-center overflow-auto p-4">
      <img src={src} alt={title} onLoad={() => { const canvas = overlayRef.current; const image = canvas?.previousElementSibling as HTMLImageElement | null; if (canvas && image) { canvas.width = image.clientWidth; canvas.height = image.clientHeight; redraw(); } }} style={{ transform: `scale(${1})`, transformOrigin: 'top center' }} className="max-w-full rounded-lg shadow-2xl" />
      <canvas
        ref={overlayRef}
        className={`absolute inset-4 h-auto w-auto max-w-[calc(100%-2rem)] ${editMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
        onPointerDown={(event) => { if (!editMode || !onAnnotationsChange) return; event.currentTarget.setPointerCapture(event.pointerId); pointsRef.current = [pointFromEvent(event)]; }}
        onPointerMove={(event) => { if (!editMode || !pointsRef.current.length) return; pointsRef.current.push(pointFromEvent(event)); redraw(); }}
        onPointerUp={finishStroke}
      />
    </div>
  );
};

/**
 * Distraction-free viewer for real file payloads.
 * PDFs open in the browser's built-in reader, images/videos use native
 * elements — no third-party libraries required.
 */
export const FileViewer: React.FC<FileViewerProps> = ({
  resource,
  mode,
  onExitFocus,
  annotations = [],
  editMode = false,
  annotationTool = 'pen',
  onAnnotationsChange,
  pageNumber = 1,
  onPageChange,
}) => {
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
      {viewer === 'pdf' && resolvedFileUrl && (
        <PdfPages
          src={resolvedFileUrl}
          title={resource.title}
          resourceId={resource.id}
          pageNumber={pageNumber}
          onPageChange={onPageChange}
          annotations={annotations}
          editMode={editMode}
          annotationTool={annotationTool}
          onAnnotationsChange={onAnnotationsChange}
        />
      )}

      {viewer === 'pdf' && !resolvedFileUrl && (
        <div className="w-full h-full min-h-[320px] flex items-center justify-center text-sm text-white/70">
          Loading original PDF…
        </div>
      )}

      {viewer === 'image' && (
        <ImagePage
          src={resource.fileData || storedBlobUrl || ''}
          title={resource.title}
          resourceId={resource.id}
          annotations={annotations}
          editMode={editMode}
          annotationTool={annotationTool}
          onAnnotationsChange={onAnnotationsChange}
        />
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
