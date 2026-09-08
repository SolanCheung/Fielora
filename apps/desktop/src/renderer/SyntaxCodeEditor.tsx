import { useLayoutEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { tags } from '@lezer/highlight';

const highlighting = HighlightStyle.define([
  { tag: tags.keyword, class: 'syntax-keyword' },
  { tag: tags.propertyName, class: 'syntax-property' },
  { tag: [tags.string, tags.special(tags.string)], class: 'syntax-string' },
  { tag: tags.number, class: 'syntax-number' },
  { tag: [tags.bool, tags.null, tags.atom], class: 'syntax-literal' },
  { tag: tags.comment, class: 'syntax-comment' },
  { tag: [tags.punctuation, tags.operator], class: 'syntax-punctuation' },
]);

function languageFor(path: string) {
  if (/\.[cm]?[jt]sx?$/i.test(path)) return javascript({ typescript: /\.[cm]?tsx?$/i.test(path), jsx: /x$/i.test(path) });
  if (/\.jsonc?$/i.test(path)) return json();
  if (/\.(html?|xml|vue|svelte)$/i.test(path)) return html();
  if (/\.(css|scss|sass|less)$/i.test(path)) return css();
  if (/\.(md|mdx|markdown)$/i.test(path)) return markdown();
  return [];
}

const theme = EditorView.theme({
  '&': { height: '100%', width: '100%', color: 'var(--fl-color-text-strong)', backgroundColor: 'transparent', fontSize: 'var(--fl-code-font-size)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', scrollbarGutter: 'stable', scrollBehavior: 'auto', fontFamily: 'var(--fl-font-mono)', lineHeight: '1.65' },
  '.cm-content': { padding: '11px 0 18px', caretColor: 'var(--fl-color-text-strong)' },
  '.cm-line': { padding: '0 14px 0 0' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--fl-color-text-faint)', border: 'none', paddingRight: '12px' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '32px', padding: '0 0 0 8px' },
  '.cm-content ::selection, .cm-content::selection': { backgroundColor: 'color-mix(in srgb,var(--fl-color-accent) 24%,transparent)' },
});

/** One editor owns text, wrapping, native scrolling, selection and line numbers.
 * Its viewport rendering keeps offscreen source out of the resize layout path. */
export function SyntaxCodeEditor({ value, relativePath, reveal, onChange }: {
  value: string;
  relativePath: string;
  reveal?: { lineStart: number; lineEnd: number; nonce: number };
  onChange: (content: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const currentRef = useRef({ value, onChange });
  currentRef.current = { value, onChange };
  useLayoutEffect(() => {
    if (!hostRef.current) return;
    const editor = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: currentRef.current.value,
        extensions: [
          EditorState.lineSeparator.of(currentRef.current.value.includes('\r\n') ? '\r\n' : '\n'),
          lineNumbers(), EditorView.lineWrapping, history(), keymap.of([...defaultKeymap, ...historyKeymap]),
          languageFor(relativePath), syntaxHighlighting(highlighting), theme,
          EditorView.contentAttributes.of({ 'aria-label': `${relativePath} 文件内容`, 'data-testid': 'file-editor', spellcheck: 'false' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) currentRef.current.onChange(update.state.sliceDoc());
          }),
        ],
      }),
    });
    editorRef.current = editor;
    return () => { editorRef.current = null; editor.destroy(); };
  }, [relativePath]);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.state.sliceDoc() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || !reveal) return;
    const start = editor.state.doc.line(Math.min(editor.state.doc.lines, Math.max(1, reveal.lineStart)));
    const end = editor.state.doc.line(Math.min(editor.state.doc.lines, Math.max(start.number, reveal.lineEnd)));
    editor.dispatch({ selection: { anchor: start.from, head: end.to }, effects: EditorView.scrollIntoView(start.from, { y: 'start', yMargin: 42 }) });
    editor.focus();
  }, [relativePath, reveal?.nonce, reveal?.lineStart, reveal?.lineEnd]);
  return <div ref={hostRef} className="dock-code-editor-surface" data-testid="syntax-code-editor" data-source-lines={value.split('\n').length} data-reveal-line-start={reveal?.lineStart} data-reveal-line-end={reveal?.lineEnd}/>;
}
