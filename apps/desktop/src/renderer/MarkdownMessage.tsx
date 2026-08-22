import { createElement, useState, type ReactNode } from 'react';

interface MarkdownMessageProps {
  content: string;
  streaming?: boolean;
  onCopyError?: (message: string) => void;
}

interface InlineMatch {
  index: number;
  length: number;
  kind: 'code' | 'strong' | 'strike' | 'emphasis' | 'link';
  label: string;
  target?: string;
}

function firstInlineMatch(value: string): InlineMatch | null {
  const candidates: InlineMatch[] = [];
  const patterns: Array<[InlineMatch['kind'], RegExp]> = [
    ['code', /`([^`\n]+)`/],
    ['link', /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/i],
    ['strong', /\*\*([^*\n]+)\*\*/],
    ['strike', /~~([^~\n]+)~~/],
    ['emphasis', /(^|[^*])\*([^*\n]+)\*/],
  ];

  patterns.forEach(([kind, pattern]) => {
    const match = pattern.exec(value);
    if (!match) return;
    const prefixLength = kind === 'emphasis' ? (match[1]?.length ?? 0) : 0;
    candidates.push({
      index: match.index + prefixLength,
      length: match[0].length - prefixLength,
      kind,
      label: (kind === 'emphasis' ? match[2] : match[1]) ?? '',
      target: kind === 'link' ? match[2] : undefined,
    });
  });

  return candidates.sort((left, right) => left.index - right.index || left.length - right.length)[0] ?? null;
}

function renderInline(value: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = [];
  let remaining = value;
  let sequence = 0;
  while (remaining.length > 0) {
    const match = firstInlineMatch(remaining);
    if (!match) {
      result.push(remaining);
      break;
    }
    if (match.index > 0) result.push(remaining.slice(0, match.index));
    const key = `${keyPrefix}-${sequence++}`;
    if (match.kind === 'code') result.push(<code key={key}>{match.label}</code>);
    if (match.kind === 'strong') result.push(<strong key={key}>{renderInline(match.label, key)}</strong>);
    if (match.kind === 'strike') result.push(<del key={key}>{renderInline(match.label, key)}</del>);
    if (match.kind === 'emphasis') result.push(<em key={key}>{renderInline(match.label, key)}</em>);
    if (match.kind === 'link') result.push(<a key={key} href={match.target} target="_blank" rel="noreferrer noopener">{renderInline(match.label, key)}</a>);
    remaining = remaining.slice(match.index + match.length);
  }
  return result;
}

function CodeBlock({ code, language, onCopyError }: { code: string; language: string; onCopyError?: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await window.fielora.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (reason) {
      onCopyError?.(reason instanceof Error ? reason.message : String(reason));
    }
  }
  return <div className="markdown-code-block">
    <header><span>{language || '代码'}</span><button type="button" onClick={() => void copy()} aria-label={copied ? '代码已复制' : '复制代码'}>{copied ? '已复制' : '复制'}</button></header>
    <pre><code className={language ? `language-${language}` : undefined}>{code}</code></pre>
  </div>;
}

function isFence(line: string): boolean {
  return /^\s*```/.test(line);
}

function isList(line: string): boolean {
  return /^\s*(?:[-+*]|\d+[.)])\s+/.test(line);
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? '';
  if (!line.trim()) return true;
  if (isFence(line) || /^(#{1,6})\s+/.test(line) || /^\s*>\s?/.test(line) || isList(line) || /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) return true;
  return index + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? '');
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderMarkdown(content: string, onCopyError?: (message: string) => void): ReactNode[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) { index += 1; continue; }

    const fence = /^\s*```\s*([\w.+-]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<CodeBlock key={`code-${index}`} code={code.join('\n')} language={fence[1] ?? ''} onCopyError={onCopyError}/>);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      blocks.push(createElement(`h${level}`, { key: `heading-${index}` }, renderInline(heading[2] ?? '', `heading-${index}`)));
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`}/>);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInline(quote.join('\n'), `quote-${index}`)}</blockquote>);
      continue;
    }

    if (isList(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: ReactNode[] = [];
      while (index < lines.length && (ordered ? /^\s*\d+[.)]\s+/.test(lines[index] ?? '') : /^\s*[-+*]\s+/.test(lines[index] ?? ''))) {
        const item = (lines[index] ?? '').replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-+*]\s+/, '');
        items.push(<li key={`item-${index}`}>{renderInline(item, `item-${index}`)}</li>);
        index += 1;
      }
      blocks.push(createElement(ordered ? 'ol' : 'ul', { key: `list-${index}` }, items));
      continue;
    }

    if (index + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? '')) {
      const headings = tableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim()) {
        rows.push(tableCells(lines[index] ?? ''));
        index += 1;
      }
      blocks.push(<div className="markdown-table-wrap" key={`table-${index}`}><table><thead><tr>{headings.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell, `th-${index}-${cellIndex}`)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headings.map((_, cellIndex) => <td key={cellIndex}>{renderInline(row[cellIndex] ?? '', `td-${index}-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.flatMap((item, paragraphIndex) => [paragraphIndex > 0 ? <br key={`br-${index}-${paragraphIndex}`}/> : null, ...renderInline(item, `paragraph-${index}-${paragraphIndex}`)])}</p>);
  }
  return blocks;
}

export function MarkdownMessage({ content, streaming = false, onCopyError }: MarkdownMessageProps) {
  return <div className={`markdown-body${streaming ? ' is-streaming' : ''}`}>{renderMarkdown(content, onCopyError)}</div>;
}
