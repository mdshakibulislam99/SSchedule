import React from 'react';

/**
 * Renders the small markdown-ish subset used by course resources:
 * headings (#, ##, ###), blockquotes (>), bullet lists (- ), ordered lists (1.),
 * bold (**text**), and paragraphs. Intentionally lightweight — no external deps.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-b-${idx}`} className="font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={`${keyPrefix}-t-${idx}`}>{part}</React.Fragment>;
  });
}

interface ResourceContentProps {
  content: string;
  fontScale: number;   // multiplier, e.g. 0.9 - 1.4
  lineHeight: number;  // e.g. 1.5 - 2.0
}

export const ResourceContent: React.FC<ResourceContentProps> = ({ content, fontScale, lineHeight }) => {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const baseFont = 16 * fontScale;
  const style = { fontSize: `${baseFont}px`, lineHeight };

  const flushList = (key: string) => {
    if (!listBuffer) return;
    const ListTag = listBuffer.type;
    blocks.push(
      <ListTag
        key={key}
        className={`${listBuffer.type === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 space-y-1.5 my-3`}
        style={style}
      >
        {listBuffer.items.map((item, idx) => (
          <li key={`${key}-i-${idx}`}>{renderInline(item, `${key}-${idx}`)}</li>
        ))}
      </ListTag>
    );
    listBuffer = null;
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.replace(/\s+$/, '');
    const key = `blk-${idx}`;

    if (line.startsWith('# ')) {
      flushList(`${key}-flush`);
      blocks.push(
        <h1 key={key} className="font-extrabold tracking-tight mt-5 mb-2" style={{ fontSize: `${1.6 * baseFont}px`, lineHeight: 1.25 }}>
          {renderInline(line.slice(2), key)}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      flushList(`${key}-flush`);
      blocks.push(
        <h2 key={key} className="font-bold tracking-tight mt-5 mb-1.5" style={{ fontSize: `${1.28 * baseFont}px`, lineHeight: 1.3 }}>
          {renderInline(line.slice(3), key)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      flushList(`${key}-flush`);
      blocks.push(
        <h3 key={key} className="font-bold mt-4 mb-1.5" style={{ fontSize: `${1.1 * baseFont}px` }}>
          {renderInline(line.slice(4), key)}
        </h3>
      );
    } else if (line.startsWith('> ')) {
      flushList(`${key}-flush`);
      blocks.push(
        <blockquote
          key={key}
          className="border-l-4 border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 px-4 py-2 rounded-r-xl my-3 font-mono"
          style={style}
        >
          {renderInline(line.slice(2), key)}
        </blockquote>
      );
    } else if (line.startsWith('- ')) {
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList(`${key}-flush`);
        listBuffer = { type: 'ul', items: [] };
      }
      listBuffer.items.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList(`${key}-flush`);
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(line.replace(/^\d+\.\s/, ''));
    } else if (line.trim() === '') {
      flushList(`${key}-flush`);
    } else {
      flushList(`${key}-flush`);
      blocks.push(
        <p key={key} className="my-3 text-slate-700 dark:text-slate-300" style={style}>
          {renderInline(line, key)}
        </p>
      );
    }
  });

  flushList('final-flush');

  return <div className="max-w-2xl mx-auto">{blocks}</div>;
};