import React from 'react';

interface MarkdownMessageProps {
  text: string;
  isUser?: boolean;
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'h'; level: number; text: string }
  | { type: 'code'; content: string }
  | { type: 'quote'; lines: string[] }
  | { type: 'hr' };

const parseBlocks = (text: string): Block[] => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  const pushParagraphLine = (line: string) => {
    const last = blocks[blocks.length - 1];
    if (last && last.type === 'p') last.lines.push(line);
    else blocks.push({ type: 'p', lines: [line] });
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const content: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        content.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', content: content.join('\n') });
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = [line.replace(/^\s*>\s?/, '')];
      i += 1;
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', lines: quoted });
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [line.replace(/^\s*[-*+]\s+/, '')];
      i += 1;
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [line.replace(/^\s*\d+[.)]\s+/, '')];
      i += 1;
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    pushParagraphLine(line.trim());
    i += 1;
  }

  return blocks;
};

const parseInline = (
  text: string,
  keyPrefix: string,
  linkClass: string,
  inlineCodeClass: string
): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const key = `${keyPrefix}-inline-${index++}`;
    if (match[2] !== undefined) {
      nodes.push(<strong key={key} className="font-semibold">{match[2]}</strong>);
    } else if (match[4] !== undefined) {
      nodes.push(<em key={key} className="italic">{match[4]}</em>);
    } else if (match[6] !== undefined) {
      nodes.push(<code key={key} className={inlineCodeClass}>{match[6]}</code>);
    } else if (match[8] !== undefined) {
      nodes.push(
        <a key={key} href={match[9]} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {match[8]}
        </a>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ text, isUser }) => {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);

  const linkClass = isUser
    ? 'font-medium text-white underline'
    : 'font-medium text-indigo-600 underline dark:text-indigo-400';
  const inlineCodeClass = isUser
    ? 'rounded bg-white/20 px-1 py-0.5 font-mono text-[0.85em]'
    : 'rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-slate-800';
  const quoteClass = isUser
    ? 'border-l-2 border-white/40 pl-3 italic text-white/90'
    : 'border-l-2 border-slate-300 pl-3 italic text-slate-600 dark:border-slate-600 dark:text-slate-400';
  const hrClass = isUser ? 'my-2 border-white/30' : 'my-2 border-slate-200 dark:border-slate-700';
  const preClass = isUser
    ? 'my-1 overflow-x-auto rounded-lg bg-white/20 p-2.5 text-[0.8em]'
    : 'my-1 overflow-x-auto rounded-lg bg-slate-100 p-2.5 text-[0.8em] dark:bg-slate-800';

  const headingClass = (level: number) => {
    if (level === 1) return 'mb-1 mt-2 text-base font-bold first:mt-0';
    if (level === 2) return 'mb-1 mt-2 text-sm font-bold first:mt-0';
    return 'mb-1 mt-2 text-xs font-bold uppercase tracking-wide first:mt-0';
  };

  const renderLines = (lines: string[], keyPrefix: string) =>
    lines.map((line, lineIndex) => (
      <React.Fragment key={`${keyPrefix}-line-${lineIndex}`}>
        {lineIndex > 0 && <br />}
        {parseInline(line, `${keyPrefix}-line-${lineIndex}`, linkClass, inlineCodeClass)}
      </React.Fragment>
    ));

  return (
    <div className="space-y-1.5 break-words">
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;
        switch (block.type) {
          case 'h': {
            const Tag = `h${Math.min(block.level, 6)}` as keyof React.JSX.IntrinsicElements;
            return React.createElement(
              Tag,
              { key, className: headingClass(block.level) },
              parseInline(block.text, key, linkClass, inlineCodeClass)
            );
          }
          case 'ul':
            return (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-li-${itemIndex}`} className="leading-relaxed">
                    {parseInline(item, `${key}-li-${itemIndex}`, linkClass, inlineCodeClass)}
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="list-decimal space-y-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-li-${itemIndex}`} className="leading-relaxed">
                    {parseInline(item, `${key}-li-${itemIndex}`, linkClass, inlineCodeClass)}
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={key} className={quoteClass}>
                {renderLines(block.lines, key)}
              </blockquote>
            );
          case 'hr':
            return <hr key={key} className={hrClass} />;
          case 'code':
            return (
              <pre key={key} className={preClass}>
                <code>{block.content}</code>
              </pre>
            );
          case 'p':
          default:
            return (
              <p key={key} className="leading-relaxed">
                {renderLines(block.lines, key)}
              </p>
            );
        }
      })}
    </div>
  );
};
