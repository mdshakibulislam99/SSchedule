import React, { useEffect, useState, useRef } from 'react';
import { Download, ExternalLink, Maximize2, Minus, Plus, X, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
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

interface PdfSinglePageProps {
  pdfDoc: any;
  pageNumber: number;
  shouldRender: boolean;
  aspectRatio: number;
  scaleFactor: number;
  annotations: ResourceAnnotation[];
  editMode: boolean;
  annotationTool: 'pen' | 'highlight' | 'eraser';
  onAnnotationsChange?: (annotations: ResourceAnnotation[]) => void;
  resourceId: string;
}

const PdfSinglePage: React.FC<PdfSinglePageProps> = ({
  pdfDoc,
  pageNumber,
  shouldRender,
  aspectRatio,
  scaleFactor,
  annotations,
  editMode,
  annotationTool,
  onAnnotationsChange,
  resourceId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const activePoints = useRef<{ x: number; y: number }[]>([]);
  const [isRendered, setIsRendered] = useState(false);

  const redrawAnnotations = () => {
    const canvas = overlayRef.current;
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

  useEffect(() => {
    redrawAnnotations();
  }, [annotations]);

  useEffect(() => {
    if (!shouldRender || !pdfDoc) return;
    let cancelled = false;

    async function renderPage() {
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        // Render at crisp 1.6 scale
        const viewport = page.getViewport({ scale: 1.6 * scaleFactor });
        const canvas = canvasRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        overlay.width = viewport.width;
        overlay.height = viewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const task = page.render({
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = task;
        await task.promise;

        if (cancelled) return;
        setIsRendered(true);
        redrawAnnotations();
      } catch (err: any) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          console.warn(`Page ${pageNumber} render error:`, err);
        }
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
    };
  }, [shouldRender, pdfDoc, pageNumber, scaleFactor]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editMode || !onAnnotationsChange) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePoints.current = [pointFromEvent(event)];
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editMode || !activePoints.current.length) return;
    const pt = pointFromEvent(event);
    activePoints.current.push(pt);

    const overlay = overlayRef.current;
    if (!overlay) return;
    const context = overlay.getContext('2d');
    if (!context) return;

    const pts = activePoints.current;
    if (pts.length < 2) return;
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];

    context.beginPath();
    context.moveTo(p1.x * overlay.width, p1.y * overlay.height);
    context.lineTo(p2.x * overlay.width, p2.y * overlay.height);
    context.strokeStyle = annotationTool === 'highlight' ? '#facc15' : '#ef4444';
    context.lineWidth = (annotationTool === 'highlight' ? 0.05 : 0.006) * overlay.width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalAlpha = annotationTool === 'highlight' ? 0.28 : 1;
    context.stroke();
    context.globalAlpha = 1;
  };

  const handlePointerUp = () => {
    if (!editMode || !activePoints.current.length || !onAnnotationsChange) return;
    const points = activePoints.current;
    const last = points[points.length - 1];
    if (annotationTool === 'eraser') {
      onAnnotationsChange(
        annotations.filter(
          (annotation) =>
            annotation.pageNumber !== pageNumber ||
            !annotation.points?.some((point) => Math.hypot(point.x - last.x, point.y - last.y) < 0.06)
        )
      );
    } else {
      const now = new Date().toISOString();
      onAnnotationsChange([
        ...annotations,
        {
          id: `annotation-${Date.now()}-${pageNumber}`,
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
  };

  return (
    <div
      className="relative w-full shadow-lg rounded-lg overflow-hidden bg-white border border-slate-200/90 dark:border-slate-800 shrink-0 select-none"
      style={{
        aspectRatio: `${aspectRatio}`,
      }}
    >
      {/* Canvas layer */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full block transition-opacity duration-200 ${isRendered ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Overlay canvas for drawing annotations */}
      <canvas
        ref={overlayRef}
        className={`absolute inset-0 w-full h-full block ${editMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* Placeholder / skeleton before render */}
      {!isRendered && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-400 gap-1.5 animate-pulse">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Page {pageNumber}</span>
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin opacity-60" />
        </div>
      )}

      {/* Page number badge in corner */}
      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/40 backdrop-blur-xs text-[10px] font-bold text-white pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
        {pageNumber}
      </div>
    </div>
  );
};

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
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const isUserScrollingRef = useRef<boolean>(false);
  const scrollTimeoutRef = useRef<any>(null);

  const [numPages, setNumPages] = useState<number>(1);
  const [aspectRatio, setAspectRatio] = useState<number>(0.75); // standard letter/A4 ~0.707 - 0.77
  const [loadingDoc, setLoadingDoc] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set([1, 2]));
  const [zoom, setZoom] = useState<number>(1);

  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);

  // 1. Two-finger pinch-to-zoom touch gesture listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        pinchStartDistanceRef.current = dist;
        pinchStartZoomRef.current = zoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDistanceRef.current !== null) {
        if (e.cancelable) e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        if (pinchStartDistanceRef.current > 0) {
          const ratio = dist / pinchStartDistanceRef.current;
          const newZoom = Math.min(3.0, Math.max(1.0, +(pinchStartZoomRef.current * ratio).toFixed(2)));
          setZoom(newZoom);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDistanceRef.current = null;
      }
      // Double tap to quickly zoom in/out (when not drawing)
      if (!editMode && e.changedTouches.length === 1 && e.touches.length === 0) {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          setZoom((prev) => (prev > 1.15 ? 1.0 : 1.75));
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.01;
        setZoom((prev) => Math.min(3.0, Math.max(1.0, +(prev + delta).toFixed(2))));
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [zoom, editMode]);

  // 1. Load document once and establish baseline aspect ratio
  useEffect(() => {
    let cancelled = false;
    setLoadingDoc(true);
    setErrorMsg(null);

    async function loadDocument() {
      try {
        let pdf: any;
        try {
          const loadingTask = getDocument({
            url: src,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/cmaps/',
            cMapPacked: true,
          });
          pdf = await loadingTask.promise;
        } catch {
          const response = await fetch(src);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await response.arrayBuffer();
          const loadingTask = getDocument({
            data: buffer,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/cmaps/',
            cMapPacked: true,
          });
          pdf = await loadingTask.promise;
        }

        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);

        // Fetch page 1 to establish natural document aspect ratio
        try {
          const page1 = await pdf.getPage(1);
          const vp = page1.getViewport({ scale: 1 });
          if (!cancelled && vp.width && vp.height) {
            setAspectRatio(vp.width / vp.height);
          }
        } catch {}

        setRenderedPages(new Set([1, 2]));
        setLoadingDoc(false);
        onPageChange?.(pageNumber, pdf.numPages);
      } catch (err: any) {
        if (!cancelled) {
          console.warn('PDF load error:', err);
          setErrorMsg('Could not load PDF in browser. You can download the original file.');
          setLoadingDoc(false);
        }
      }
    }

    void loadDocument();
    return () => {
      cancelled = true;
    };
  }, [src]);

  // 2. Set up IntersectionObserver to lazy-render pages as user continuously scrolls
  useEffect(() => {
    const container = containerRef.current;
    if (!container || loadingDoc || numPages <= 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = Number(entry.target.getAttribute('data-page'));
            if (pageNum) {
              setRenderedPages((prev) => {
                if (prev.has(pageNum)) return prev;
                const next = new Set(prev);
                next.add(pageNum);
                return next;
              });
            }
          }
        });
      },
      {
        root: container,
        rootMargin: '350px 0px', // Pre-render 350px before entering viewport
        threshold: 0.01,
      }
    );

    Object.values(pageRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [loadingDoc, numPages]);

  // 3. Track current visible page during continuous scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    isUserScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 250);

    const containerTop = container.getBoundingClientRect().top;
    let closestPage = pageNumber;
    let minDistance = Infinity;

    for (let p = 1; p <= numPages; p++) {
      const el = pageRefs.current[p];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top - containerTop - 15);
      if (dist < minDistance) {
        minDistance = dist;
        closestPage = p;
      }
    }

    if (closestPage !== pageNumber) {
      onPageChange?.(closestPage, numPages);
    }
  };

  // 4. Smooth scroll to page when pageNumber changes externally (header controls)
  useEffect(() => {
    if (!isUserScrollingRef.current && pageRefs.current[pageNumber]) {
      pageRefs.current[pageNumber]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [pageNumber]);

  return (
    <div className="relative w-full h-full flex flex-col min-h-0 bg-slate-100 dark:bg-slate-950">
      {/* Continuous Scroll Viewport */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`w-full flex-1 min-h-0 overflow-y-auto ${zoom > 1.05 ? 'overflow-x-auto' : 'overflow-x-hidden'} p-2.5 sm:p-4 pb-8 flex flex-col items-center gap-3 sm:gap-4 no-scrollbar select-none`}
      >
        {loadingDoc && (
          <div className="flex flex-col items-center justify-center my-auto min-h-[300px] text-slate-500 gap-2">
            <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold">Opening PDF document…</p>
          </div>
        )}

        {errorMsg && (
          <div className="flex flex-col items-center justify-center my-auto min-h-[300px] text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-sm">
            <p className="text-xs text-rose-500 font-semibold mb-3">{errorMsg}</p>
            <a
              href={src}
              download={title}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" /> Download PDF
            </a>
          </div>
        )}

        {!loadingDoc && !errorMsg && (
          <div
            className="mx-auto flex flex-col items-center gap-3 sm:gap-4 transition-all duration-75 origin-top"
            style={{
              width: `${Math.round(zoom * 100)}%`,
              maxWidth: zoom <= 1 ? '36rem' : `${Math.round(zoom * 36)}rem`,
            }}
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
              <div
                key={p}
                data-page={p}
                ref={(el) => {
                  pageRefs.current[p] = el;
                }}
                className="w-full"
              >
                <PdfSinglePage
                  pdfDoc={pdfDocRef.current}
                  pageNumber={p}
                  shouldRender={renderedPages.has(p)}
                  aspectRatio={aspectRatio}
                  scaleFactor={zoom}
                  annotations={annotations}
                  editMode={editMode}
                  annotationTool={annotationTool}
                  onAnnotationsChange={onAnnotationsChange}
                  resourceId={resourceId}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Zoom & Page Controls Bar for PDF */}
      {!loadingDoc && !errorMsg && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full bg-slate-900/90 dark:bg-black/90 text-white backdrop-blur-md px-3 py-1.5 shadow-xl border border-white/10 select-none pointer-events-auto">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono font-bold text-white/90 min-w-[36px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3.5 bg-white/20 mx-0.5" />
          <span className="text-[11px] font-mono text-white/80 px-1 whitespace-nowrap">
            {pageNumber} / {numPages}
          </span>
          {zoom > 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-[10px] font-bold text-white transition-colors cursor-pointer ml-0.5"
            >
              Fit
            </button>
          )}
        </div>
      )}
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
    <div className={`w-full h-full flex-1 min-h-0 relative flex flex-col overflow-hidden ${viewer === 'pdf' ? 'bg-slate-100 dark:bg-slate-950' : 'bg-slate-900 dark:bg-black'}`}>
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
      <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 animate-fade-in pt-safe">
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

  return <div className="w-full h-full flex-1 min-h-0 overflow-hidden flex flex-col">{surface}</div>;
};

export default FileViewer;
