import { CourseResource } from '../types';

/** Which built-in viewer should open a resource, if any. */
export type ResourceViewer = 'pdf' | 'image' | 'video' | 'document';

/**
 * Pick the native viewer for a resource from its MIME type, filename and
 * course-resource type. Returns null when the markdown reader is the right
 * surface (plain text / links / metadata-only entries).
 */
export function detectViewer(
  type: CourseResource['type'],
  mime?: string,
  fileName?: string
): ResourceViewer | null {
  const m = (mime || '').toLowerCase();
  const n = (fileName || '').toLowerCase();
  if (m.includes('pdf') || n.endsWith('.pdf') || type === 'pdf') return 'pdf';
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(n)) return 'image';
  if (m.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)$/.test(n) || type === 'video') return 'video';
  if (type === 'slide' || type === 'docx') return 'document';
  return null;
}
