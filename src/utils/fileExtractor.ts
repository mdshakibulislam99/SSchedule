import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
}

/**
 * Extracts raw textual content from uploaded files (PDFs, Markdown, TXT, JSON, Code, etc.)
 * so the AI can perform thorough context analysis and indexing without asking the user.
 */
export async function extractTextFromFile(file: File | Blob, filename?: string): Promise<string> {
  const name = filename || (file instanceof File ? file.name : 'document');
  const ext = name.split('.').pop()?.toLowerCase() || '';

  // 1. Text-based files
  const textExtensions = [
    'txt',
    'md',
    'markdown',
    'json',
    'csv',
    'ts',
    'js',
    'tsx',
    'jsx',
    'py',
    'java',
    'c',
    'cpp',
    'html',
    'css',
    'xml',
    'yaml',
    'yml',
    'rst',
    'tex',
  ];

  if (textExtensions.includes(ext) || file.type.startsWith('text/')) {
    try {
      const text = await file.text();
      return text.slice(0, 12000);
    } catch (e) {
      console.warn('Text file read error:', e);
    }
  }

  // 2. PDF documents
  if (ext === 'pdf' || file.type === 'application/pdf') {
    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = getDocument({
        data: buffer,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/cmaps/',
        cMapPacked: true,
      });
      const pdf = await loadingTask.promise;
      const pagesToExtract = Math.min(pdf.numPages, 10);
      let extracted = '';
      for (let i = 1; i <= pagesToExtract; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ');
        if (pageText.trim()) {
          extracted += `\n[Page ${i}]:\n${pageText}\n`;
        }
      }
      if (extracted.trim()) {
        return extracted.slice(0, 10000);
      }
    } catch (pdfErr) {
      console.warn('PDF text extraction error:', pdfErr);
    }
  }

  return '';
}
