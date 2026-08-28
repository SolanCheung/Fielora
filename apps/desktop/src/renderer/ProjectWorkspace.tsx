import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ClipboardEvent, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  AgentChangedEvent, AgentEventView, AgentPermission, AgentRunView, AgentToolCallView, ApprovalView,
  McpConnectionRuntimeView,
  ConversationMessageStatus, ConversationMessageView, ConversationView, ProjectView, ProviderConfigView, ArtifactView,
} from '@fielora/contracts';
import type { AgentTextDeltaEvent } from '../types';
import type { WorkspaceAttachmentView, WorkspaceEnvironmentView, WorkspaceFileEntry, WorkspaceFileView, WorkspaceImagePreview, WorkspaceProjectOpenTarget, WorkspaceProjectOpenTargetView } from '../workspace-types';
import { PrimaryNav, ShellIcon } from './PrimaryNav';
import { BrowsePanel } from './BrowseScreen';
import { AgentTurn } from './AgentTurn';
import { AgentHumanReview } from './AgentHumanReview';
import { AttachmentThumbnail, ConversationImageGallery, ImageContextMenu, ImagePreview } from './AttachmentMedia';
import { AGENT_PROJECTION_UNAVAILABLE_MESSAGE, mergeAgentEventPages } from './agent-projection';
import { buildAgentReview } from './agent-review';
import { MarkdownMessage } from './MarkdownMessage';
import { ResizableDivider } from './ResizableDivider';
import { RightWorkspaceDock, type RightWorkspaceTab } from './RightWorkspaceDock';
import { ArtifactCatalog, ArtifactSurface } from './ArtifactWorkingSurface';
import {
  activeArtifactContext, artifactTabId, emptyArtifactSession, pinArtifactRevision,
  refreshArtifactCurrent, type ArtifactSurfaceSession,
} from './artifact-working-surface';
import { WorkspaceFileTree } from './WorkspaceFileTree';
import { IconButton, SelectMenu, TextActionDialog, ToolbarAction } from './UiPrimitives';
import { persistWorkspaceNavigationWidth, readWorkspaceNavigationWidth, WorkspaceSurface } from './WorkspaceSurface';
import { attachmentsForCapabilities, loadBrowserAttachments, messageAttachments, normalizeAttachmentSelection, persistMessageAttachments } from './attachment-pipeline';
import { modelCapabilities } from './model-capabilities';
import {
  collapseDuplicateUnsentConversations,
  conversationTitleFromContent,
  agentTurnOwnership,
  friendlyFilePreviewFailure,
  hasUserMessage,
  isDefaultConversationTitle,
  resolveComposerPermission,
  reviewDiff,
  shouldSubmitComposerKey,
  workspacePreviewKind,
} from './workspace-presentation';

interface ProjectWorkspaceProps {
  onNow: () => void;
  onBrowse: () => void;
  onFields: () => void;
  onSettings: () => void;
  newConversationRequest: number;
  addProjectRequest: number;
  workspaceRequest: { id: number; tool: 'FILES' | 'DIFF' | 'TERMINAL' | 'BROWSER' };
}

interface ReviewDraft {
  relativePath: string;
  before: string;
  after: string;
  beforeHash: string;
  diff: string;
}

interface UndoChange {
  relativePath: string;
  content: string;
  expectedHash: string;
}

interface ActiveAgent {
  runId: string;
  conversationId: string;
  output: string;
}

interface QueuedFollowUp {
  messageId: string;
  content: string;
  afterRunId: string;
  selectedFilePath: string | null;
  permission: ComposerPermission;
  createdAt: number;
}

interface HistoricalReviewSelection {
  review: ReturnType<typeof buildAgentReview>;
  runId: string;
  task: string;
  path: string;
}

interface ActiveTerminal {
  runId: string;
  command: string;
  output: string;
}

type ConversationDialog =
  | { kind: 'RENAME'; value: string }
  | { kind: 'DELETE' }
  | null;

interface ConversationContextMenuState {
  conversationId: string;
  title: string;
  left: number;
  top: number;
}

type ProjectDialog = { project: ProjectView; value: string } | null;
interface ProjectContextMenuState {
  project: ProjectView;
  left: number;
  top: number;
}
type ProjectSort = 'RECENT' | 'NAME' | 'CREATED';
const showLegacyWorkspace: boolean = false;

type ComposerPermission = AgentPermission;

type FilePreviewState =
  | { kind: 'IMAGE'; preview: WorkspaceImagePreview }
  | { kind: 'UNSUPPORTED'; relativePath: string; message: string }
  | null;

type RightDockKind = 'FILES' | 'FILE' | 'IMAGE' | 'REVIEW' | 'BROWSER' | 'TERMINAL' | 'ARTIFACTS' | 'ARTIFACT';

function WorkspaceAppBadge({ target, iconDataUrl = null }: { target: WorkspaceProjectOpenTarget; iconDataUrl?: string | null }) {
  if (iconDataUrl) return <img className={`workspace-app-icon target-${target.toLowerCase()}`} src={iconDataUrl} alt="" aria-hidden="true" data-app-icon={target} data-icon-source="native"/>;
  const gradientId = `workspace-app-${target.toLowerCase()}`;
  const glyphs: Record<WorkspaceProjectOpenTarget, ReactNode> = {
    FILE_EXPLORER: <><path fill="#f1b932" d="M2.5 7.4V5.7A1.7 1.7 0 0 1 4.2 4h6.1l1.9 2h7.6a1.7 1.7 0 0 1 1.7 1.7v4.1h-19Z"/><path fill="#ffd85e" d="M3.1 8.2h17.8v3.4H3.1Z"/><path fill="#4aa6df" d="M2.5 10.3h19l-1.8 8.2a2 2 0 0 1-2 1.5H4.4a2 2 0 0 1-1.9-1.6Z"/><path fill="#83cef3" d="M2.8 10.3h18.4l-.4 1.8H3.2Z"/></>,
    VISUAL_STUDIO_CODE: <><path fill="#24a8e8" d="m17.8 2.6 3.1 1.5v15.8l-3.1 1.5-9.3-8.1-4.1 3.1-2-1 4.2-3.4-4.2-3.4 2-1 4.1 3.1Z"/><path fill="#0d7fbd" d="m17.8 6.7-6.4 5.3 6.4 5.3ZM8.5 10.7 6.6 12l1.9 1.3 2.9-1.3Z"/></>,
    CURSOR: <><rect x="2" y="2" width="20" height="20" rx="5" fill="#15171a"/><path d="m6.4 5.7 11.7 6.1-5.5 1.1-2.4 5.2Z" fill="#fff"/><path d="m12.6 12.9 4.2 4.2" stroke="#fff" strokeWidth="1.5"/></>,
    VISUAL_STUDIO: <><path fill="#8c4fba" d="m16.8 3 5.2 2.1v13.8L16.8 21 8.9 15.7 4.8 19 2 17.4V6.6L4.8 5l4.1 3.3Zm0 4.3-4.7 4.7 4.7 4.7ZM8.9 10.2 5.9 12l3 1.8 1.8-1.8Z"/><path fill="#b768d4" d="M2 6.6 4.8 5l7.3 7-3.2 3.7-4.1 3L2 17.4 7.8 12Z"/></>,
    GIT_BASH: <><rect x="2" y="2" width="20" height="20" rx="5" fill="#31343a"/><path d="m6 8 3 3-3 3M11 15h6" fill="none" stroke="#f5f6f7" strokeWidth="1.7"/><circle cx="15.5" cy="7" r="1.2" fill="#ef6b59"/><path d="m12.5 8.5 3-1.5 2.2 2" fill="none" stroke="#ef6b59" strokeWidth="1.2"/></>,
    INTELLIJ_IDEA: <><defs><linearGradient id={gradientId} x1="2" y1="2" x2="22" y2="22"><stop stopColor="#ff7a4d"/><stop offset=".48" stopColor="#b94bca"/><stop offset="1" stopColor="#5f63e9"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5" fill={`url(#${gradientId})`}/><rect x="5" y="5" width="14" height="14" rx="2" fill="#111318"/><path d="M7.5 8h1.8v5.2H7.5Zm4.2 0h4.8v1.5h-3v3.7h-1.8Z" fill="#fff"/><path d="M7.5 16.5h5" stroke="#fff" strokeWidth="1.2"/></>,
    PYCHARM: <><defs><linearGradient id={gradientId} x1="2" y1="22" x2="22" y2="2"><stop stopColor="#40d98a"/><stop offset=".52" stopColor="#95e45b"/><stop offset="1" stopColor="#ffe36e"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5" fill={`url(#${gradientId})`}/><rect x="5" y="5" width="14" height="14" rx="2" fill="#111318"/><path d="M7.4 8h3a2 2 0 0 1 0 4h-1.2v1.4H7.4Zm1.8 1.4v1.2h1a.6.6 0 0 0 0-1.2Zm5.5-1.5c.8 0 1.5.2 2 .6l-.8 1.2a2 2 0 0 0-1.1-.3c-.8 0-1.3.5-1.3 1.3s.5 1.3 1.3 1.3c.5 0 .8-.1 1.2-.4l.8 1.2c-.6.5-1.3.7-2.1.7-1.8 0-3.1-1.1-3.1-2.8s1.3-2.8 3.1-2.8Z" fill="#fff"/><path d="M7.4 16.5h5" stroke="#fff" strokeWidth="1.2"/></>,
    WEBSTORM: <><defs><linearGradient id={gradientId} x1="2" y1="2" x2="22" y2="22"><stop stopColor="#22d7c6"/><stop offset=".52" stopColor="#1aa9e8"/><stop offset="1" stopColor="#7467e8"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5" fill={`url(#${gradientId})`}/><rect x="5" y="5" width="14" height="14" rx="2" fill="#111318"/><path d="m7.2 8 1 5.3h1.7l.7-2.8.7 2.8H13L14 8h-1.7l-.4 2.8L11.2 8H10l-.7 2.8L8.9 8Zm8.8-.1c.9 0 1.7.3 2.2.7l-.8 1.2c-.5-.3-.9-.5-1.4-.5-.4 0-.6.1-.6.3 0 .3.4.4 1.1.6 1.1.3 1.8.7 1.8 1.6 0 1.1-.9 1.7-2.4 1.7-1 0-1.9-.3-2.5-.8l.8-1.2c.5.4 1.1.6 1.7.6.4 0 .7-.1.7-.4 0-.3-.4-.4-1.1-.6-1.1-.3-1.8-.7-1.8-1.6 0-1 .9-1.6 2.3-1.6Z" fill="#fff"/><path d="M7.2 16.5h5" stroke="#fff" strokeWidth="1.2"/></>,
  };
  return <svg className={`workspace-app-icon target-${target.toLowerCase()}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-app-icon={target} data-icon-source="fallback">{glyphs[target]}</svg>;
}

interface ProjectDockTab extends RightWorkspaceTab {
  kind: RightDockKind;
  relativePath?: string;
  attachment?: WorkspaceAttachmentView;
  reviewSelection?: HistoricalReviewSelection;
  artifactId?: string;
}

interface FileDockSession {
  file: WorkspaceFileView | null;
  preview: FilePreviewState;
  content: string;
  markdownMode?: 'PREVIEW' | 'SOURCE';
}

function fileTabLabel(relativePath: string): string {
  return relativePath.replaceAll('\\', '/').split('/').at(-1) ?? relativePath;
}

function isMarkdownFile(relativePath: string): boolean {
  return /\.(?:md|markdown)$/i.test(relativePath);
}

type SyntaxLanguage = 'SCRIPT' | 'JSON' | 'MARKUP' | 'STYLE' | 'MARKDOWN' | 'PLAIN';

function syntaxLanguage(relativePath: string): SyntaxLanguage {
  if (/\.(?:[cm]?[jt]sx?)$/i.test(relativePath)) return 'SCRIPT';
  if (/\.(?:json|jsonc)$/i.test(relativePath)) return 'JSON';
  if (/\.(?:html?|xml|vue|svelte)$/i.test(relativePath)) return 'MARKUP';
  if (/\.(?:css|scss|sass|less)$/i.test(relativePath)) return 'STYLE';
  if (/\.(?:md|mdx)$/i.test(relativePath)) return 'MARKDOWN';
  return 'PLAIN';
}

function syntaxTokens(line: string, language: SyntaxLanguage, lineIndex: number): ReactNode[] {
  const patterns: Record<SyntaxLanguage, RegExp> = {
    SCRIPT: /\/\/.*|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:as|async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|private|protected|public|readonly|return|satisfies|static|super|switch|throw|try|type|typeof|var|void|while|with|yield)\b|\b(?:false|null|true|undefined|NaN)\b|\b(?:0x[\da-f]+|\d+(?:\.\d+)?)\b|[{}[\](),.;:]/gi,
    JSON: /\/\/.*|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|\b(?:false|null|true)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|[{}[\],:]/gi,
    MARKUP: /<!--.*?-->|<\/?[A-Za-z][^>]*>|&[A-Za-z\d#]+;/g,
    STYLE: /\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|--?[\w-]+(?=\s*:)|\b(?:inherit|initial|none|transparent|auto|solid|relative|absolute|fixed|flex|grid|block|inline|true|false)\b|#[\da-f]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg)?\b|[{}(),;:]/gi,
    MARKDOWN: /`[^`]+`|!?(?:\[[^\]]*\])\([^)]*\)|^#{1,6}\s+.*|^\s*(?:[-*+] |\d+\. ).*|\*\*[^*]+\*\*/g,
    PLAIN: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:false|null|true)\b|-?\b\d+(?:\.\d+)?\b/g,
  };
  const result: ReactNode[] = [];
  const matcher = patterns[language];
  let cursor = 0;
  for (const match of line.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(line.slice(cursor, index));
    const token = match[0];
    const remaining = line.slice(index + token.length);
    let kind = 'punctuation';
    if (/^(?:\/\/|\/\*|<!--)/.test(token)) kind = 'comment';
    else if (/^["'`]/.test(token)) kind = language === 'JSON' && /^\s*:/.test(remaining) ? 'property' : 'string';
    else if (language === 'MARKUP' && token.startsWith('<')) kind = 'keyword';
    else if (language === 'MARKDOWN' && /^(?:#|\s*(?:[-*+] |\d+\. ))/.test(token)) kind = 'keyword';
    else if (language === 'MARKDOWN' && token.startsWith('`')) kind = 'string';
    else if (language === 'MARKDOWN' && /\]\(/.test(token)) kind = 'property';
    else if (language === 'STYLE' && /^--?[\w-]+$/.test(token)) kind = 'property';
    else if (/^(?:false|null|true|undefined|NaN)$/.test(token)) kind = 'literal';
    else if (/^-?(?:0x[\da-f]+|\d)/i.test(token) || /^#[\da-f]{3,8}$/i.test(token)) kind = 'number';
    else if (/^[A-Za-z]/.test(token)) kind = 'keyword';
    result.push(<span key={`${lineIndex}:${index}`} className={`syntax-${kind}`}>{token}</span>);
    cursor = index + token.length;
  }
  if (cursor < line.length) result.push(line.slice(cursor));
  return result;
}

function SyntaxCodeEditor({ value, relativePath, onChange }: { value: string; relativePath: string; onChange: (content: string) => void }) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const language = syntaxLanguage(relativePath);
  const lines = value.split('\n');
  return <div className="dock-code-editor-surface" data-language={language.toLowerCase()} data-testid="syntax-code-editor">
    <pre ref={highlightRef} className="dock-code-highlight" aria-hidden="true"><code>{lines.map((line, index) => <span className="dock-code-line" key={`${index}:${line}`}><i>{index + 1}</i><span>{line.length > 0 ? syntaxTokens(line, language, index) : '\u200b'}</span></span>)}</code></pre>
    <textarea
      className="dock-code-input"
      value={value}
      wrap="soft"
      onChange={(event) => onChange(event.target.value)}
      onScroll={(event) => {
        if (!highlightRef.current) return;
        highlightRef.current.scrollTop = event.currentTarget.scrollTop;
      }}
      spellCheck={false}
      data-testid="file-editor"
    />
  </div>;
}

function TerminalSession({ workingDirectory, command, lastCommand, output, running, active, onCommandChange, onRun, onCancel, testId }: {
  workingDirectory: string;
  command: string;
  lastCommand: string;
  output: string;
  running: boolean;
  active: boolean;
  onCommandChange: (value: string) => void;
  onRun: () => void;
  onCancel: () => void;
  testId: 'terminal' | 'bottom-terminal';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [lastCommand, output, running]);
  return <div className="terminal-session" data-testid={`${testId}-session`} onClick={(event) => {
    if (!(event.target as HTMLElement).closest('button')) inputRef.current?.focus();
  }}>
    <div ref={transcriptRef} className="terminal-transcript" data-testid={`${testId}-output`}>
      <p>Windows PowerShell</p>
      <p>Copyright (C) Microsoft Corporation. All rights reserved.</p>
      {lastCommand && <p className="terminal-history-command"><span>PS {workingDirectory}&gt;</span> {lastCommand}</p>}
      {output && <pre>{output}</pre>}
      <form className="terminal-prompt" data-terminal-inline-prompt="true" onSubmit={(event) => { event.preventDefault(); onRun(); }}>
        <span>PS {workingDirectory}&gt;</span>
        <input ref={inputRef} value={command} onChange={(event) => onCommandChange(event.target.value)} aria-label={testId === 'terminal' ? 'Terminal command' : 'Bottom terminal command'} autoComplete="off" autoCapitalize="none" spellCheck={false} data-testid={`${testId}-command`}/>
        {running && <button type="button" onClick={onCancel} aria-label="停止当前命令"><ShellIcon name="close"/></button>}
      </form>
    </div>
  </div>;
}

function DockResourceLayout({ children, fileTree, treeWidth, treeCollapsed, onTreeWidthChange }: {
  children: ReactNode;
  fileTree: ReactNode;
  treeWidth: number;
  treeCollapsed: boolean;
  onTreeWidthChange: (width: number) => void;
}) {
  const resourceLayoutRef = useRef<HTMLDivElement>(null);
  return <div
    ref={resourceLayoutRef}
    className={`dock-resource-layout ${treeCollapsed ? 'file-tree-collapsed' : ''}`}
    style={{ '--dock-file-tree-width': `${treeWidth}px` } as CSSProperties}
    data-testid="dock-resource-layout"
  >
    <main className="dock-resource-content">{children}</main>
    <ResizableDivider
      label="调整文件内容与文件菜单宽度"
      value={treeWidth}
      min={190}
      max={420}
      onResize={(clientX) => {
        const rect = resourceLayoutRef.current?.getBoundingClientRect();
        if (rect) onTreeWidthChange(rect.right - clientX);
      }}
      onKeyboardResize={(delta) => onTreeWidthChange(treeWidth - delta)}
      testId="dock-file-tree-resizer"
      className="dock-file-tree-resizer"
    />
    <aside className="dock-resource-file-tree" aria-label="Project 文件" data-testid="dock-resource-file-tree">
      <div className="dock-file-tree-body" data-testid="dock-file-tree-body">{fileTree}</div>
    </aside>
  </div>;
}

function workspaceImageAttachment(preview: WorkspaceImagePreview): WorkspaceAttachmentView {
  return {
    id: `workspace:${preview.relative_path}`, name: fileTabLabel(preview.relative_path), size: preview.size,
    kind: 'IMAGE', mime_type: preview.mime_type, status: 'READY', content: null, data_url: preview.data_url,
    sha256: null, reason: null, width: null, height: null, source: 'file_picker', content_ref: null,
  };
}

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorLike { error: string; }

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function ComposerIcon({ name }: { name: 'plus' | 'microphone' | 'send' | 'stop' | 'file' | 'close' }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14"/>,
    microphone: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></>,
    send: <><path d="m7 12 5-5 5 5M12 7v10"/></>,
    stop: <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>,
    file: <><path d="M7 3.5h7l3 3V20H7z"/><path d="M14 3.5V7h3"/></>,
    close: <path d="m8 8 8 8M16 8l-8 8"/>,
  } as const;
  return <svg className="composer-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function PermissionIcon({ permission }: { permission: ComposerPermission }) {
  const paths = {
    READ_ONLY: <><path d="M7.1 10.2V6.7a1.15 1.15 0 0 1 2.3 0v2.8M9.4 9.5V5.6a1.15 1.15 0 0 1 2.3 0v3.9M11.7 9.5V6.3a1.15 1.15 0 0 1 2.3 0v3.2M14 9.5V7.8a1.15 1.15 0 0 1 2.3 0v4.6a5.7 5.7 0 0 1-5.7 5.7 5.1 5.1 0 0 1-5.1-5.1v-1.5a1.3 1.3 0 0 1 2.2-.9l1.2 1.2"/></>,
    REVIEW_CHANGES: <><rect x="3.4" y="4.2" width="13.2" height="11.6" rx="3.4"/><path d="m7 8 1.7 1.5L7 11M10.5 11h2.7M6.7 15.8l-1.5 2.1"/></>,
    FULL_CONTROL: <><path d="m7 2.9 6 .02 4.2 4.24-.02 5.7L13 17.1l-6-.02-4.2-4.24.02-5.7L7 2.9Z"/><path d="M10 6.2v5.1M10 14.1h.01"/></>,
  } satisfies Record<ComposerPermission, ReactNode>;
  return <svg className="composer-icon permission-icon" data-permission-icon={permission} viewBox="0 0 20 20" aria-hidden="true">{paths[permission]}</svg>;
}

function reasonMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason);
  if (/unknown field [`']attachments[`']|expected one of [`']field_id/i.test(raw)) return '当前桌面与 Agent Runtime 版本不一致。请重新打开最新 Fielora 后重试；已输入的内容仍保留在当前对话中。';
  if (raw.includes('FILE_CHANGED_SINCE_REVIEW')) return '文件在 review 后已被其他程序修改，请重新载入再确认。';
  if (raw.includes('CREDENTIAL_REJECTED')) return '模型凭据无效，请在设置中更新。';
  if (raw.includes('PROVIDER_RATE_LIMITED')) return '模型服务当前限流，请稍后重试。';
  return raw;
}

function withUiTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then((value) => {
      window.clearTimeout(timer);
      resolve(value);
    }, (reason) => {
      window.clearTimeout(timer);
      reject(reason);
    });
  });
}

function messageTimeLabel(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function messageStatusLabel(status: ConversationMessageStatus): string {
  return status === 'FAILED' ? '失败' : status === 'CANCELLED' ? '已取消' : '';
}

function queuedFollowUpKey(conversationId: string): string {
  return `fielora:queued-follow-ups:${conversationId}`;
}

function readQueuedFollowUps(conversationId: string): QueuedFollowUp[] {
  if (!conversationId) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(queuedFollowUpKey(conversationId)) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QueuedFollowUp => Boolean(item && typeof item === 'object'
      && typeof (item as QueuedFollowUp).messageId === 'string'
      && typeof (item as QueuedFollowUp).content === 'string'
      && typeof (item as QueuedFollowUp).afterRunId === 'string'));
  } catch { return []; }
}

function persistQueuedFollowUps(conversationId: string, items: QueuedFollowUp[]): void {
  if (!conversationId) return;
  if (items.length === 0) window.localStorage.removeItem(queuedFollowUpKey(conversationId));
  else window.localStorage.setItem(queuedFollowUpKey(conversationId), JSON.stringify(items));
}

function isLegacyTerminalMessage(content: string): boolean {
  return /^Terminal · ([^\n]+)\n\n([\s\S]*?)\n\nExit: ([^\n]+)$/.test(content.trim());
}

function pendingApproval(events: AgentEventView[], run: AgentRunView | null): ApprovalView | null {
  if (run?.status !== 'WAITING_APPROVAL') return null;
  const event = [...events].reverse().find((item) => item.kind === 'APPROVAL_REQUESTED');
  if (!event || !event.payload || typeof event.payload !== 'object' || !(event.payload as Record<string, unknown>).approval) return null;
  return (event.payload as { approval: ApprovalView }).approval;
}

function pendingToolSummary(events: AgentEventView[], run: AgentRunView | null): string {
  if (run?.status !== 'WAITING_APPROVAL') return '';
  const event = [...events].reverse().find((item) => item.kind === 'APPROVAL_REQUESTED');
  const payload = event?.payload as { tool?: { name?: unknown; arguments?: unknown } } | undefined;
  const name = typeof payload?.tool?.name === 'string' ? payload.tool.name : 'tool';
  const args = payload?.tool?.arguments;
  if (!args || typeof args !== 'object') return name;
  const values = args as Record<string, unknown>;
  if (name === 'run_command') return `${String(values.program ?? '')} ${Array.isArray(values.argv) ? values.argv.map(String).join(' ') : ''}`.trim();
  if (name === 'apply_patches' && Array.isArray(values.patches)) return `修改 ${values.patches.length} 个文件 · ${values.patches.slice(0, 3).map((patch) => patch && typeof patch === 'object' && 'path' in patch ? String((patch as { path: unknown }).path) : '').filter(Boolean).join('、')}`;
  if (name === 'git_stage' || name === 'git_unstage') return `${name === 'git_stage' ? '暂存' : '取消暂存'} · ${Array.isArray(values.paths) ? values.paths.map(String).join('、') : ''}`;
  if (name === 'git_commit') return `创建提交 · ${String(values.message ?? '')}`;
  if (name === 'git_push') return `推送 · ${String(values.remote ?? '')}/${String(values.branch ?? '')}`;
  if (name === 'git_create_branch') return `创建分支 · ${String(values.branch ?? '')}`;
  if (name === 'git_switch_branch') return `切换分支 · ${String(values.branch ?? '')}`;
  if (typeof values.path === 'string') return `${name} · ${values.path}`;
  if (typeof values.from === 'string' && typeof values.to === 'string') return `${name} · ${values.from} → ${values.to}`;
  if (typeof values.objective === 'string') return `${name} · ${values.objective}`;
  return name;
}

function HistoricalAgentTurn({ terminalMessage, requestText, userMessageId, copied, onCopy, onCopyError, onReview }: {
  terminalMessage: ConversationMessageView;
  requestText: string;
  userMessageId: string | null;
  copied: boolean;
  onCopy: () => void;
  onCopyError: (reason: string) => void;
  onReview: (selection: HistoricalReviewSelection) => void;
}) {
  const [run, setRun] = useState<AgentRunView | null>(null);
  const [events, setEvents] = useState<AgentEventView[]>([]);
  const [tools, setTools] = useState<AgentToolCallView[]>([]);
  useEffect(() => {
    const runId = terminalMessage.invocation_id;
    if (!runId) return undefined;
    let current = true;
    void Promise.all([
      window.fielora.agent.get({ run_id: runId }),
      window.fielora.agent.events({ run_id: runId, after_sequence: null, limit: 200 }),
      window.fielora.agent.toolCalls({ run_id: runId }),
    ]).then(([nextRun, nextEvents, nextTools]) => {
      if (!current) return;
      setRun(nextRun); setEvents(nextEvents); setTools(nextTools);
    }).catch(() => undefined);
    return () => { current = false; };
  }, [terminalMessage.invocation_id]);
  const review = useMemo(() => buildAgentReview(tools), [tools]);
  const reviewSelection = (path = ''): HistoricalReviewSelection => ({
    review,
    runId: run?.id ?? terminalMessage.invocation_id ?? '',
    task: run?.task ?? requestText,
    path,
  });
  return <AgentTurn
    run={run}
    requestText={requestText}
    userMessageId={userMessageId}
    terminalMessage={terminalMessage}
    events={events}
    tools={tools}
    review={review}
    copied={copied}
    onReview={() => onReview(reviewSelection())}
    onReviewFile={(path) => onReview(reviewSelection(path))}
    onCopy={onCopy}
    onCopyError={onCopyError}
  />;
}

function ConversationActionsMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', pointer);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', pointer);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return <div className={`conversation-menu ${open ? 'open' : ''}`} ref={rootRef}>
    <IconButton className="conversation-menu-trigger" label="对话菜单" icon={<ShellIcon name="more"/>} active={open} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} testId="conversation-menu-trigger" />
    {open && <div role="menu" data-testid="conversation-menu-popover"><button type="button" role="menuitem" onClick={() => { setOpen(false); onRename(); }}>重命名</button><button type="button" role="menuitem" className="quiet" onClick={() => { setOpen(false); onDelete(); }}>删除对话</button></div>}
  </div>;
}

function ConversationContextMenu({ state, onClose, onRename, onDelete }: {
  state: ConversationContextMenuState;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeWithKeyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithKeyboard);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeWithKeyboard);
    };
  }, [onClose]);
  return createPortal(<div
    ref={menuRef}
    className="conversation-context-menu"
    role="menu"
    aria-label={`${state.title} 对话菜单`}
    data-testid="conversation-context-menu"
    style={{ left: state.left, top: state.top }}
  >
    <button type="button" role="menuitem" onClick={() => { onClose(); onRename(); }}><ShellIcon name="edit"/>重命名</button>
    <button type="button" role="menuitem" className="danger" onClick={() => { onClose(); onDelete(); }}><ShellIcon name="close"/>删除对话</button>
  </div>, document.body);
}

function ProjectContextMenu({ state, onClose, onNewConversation, onManage, onRemove }: {
  state: ProjectContextMenuState;
  onClose: () => void;
  onNewConversation: () => void;
  onManage: () => void;
  onRemove: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeWithKeyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithKeyboard);
    return () => {
      window.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeWithKeyboard);
    };
  }, [onClose]);
  return createPortal(<div
    ref={menuRef}
    className="conversation-context-menu project-context-menu"
    role="menu"
    aria-label={`${state.project.title} 项目菜单`}
    data-testid="project-context-menu"
    style={{ left: state.left, top: state.top }}
  >
    <button type="button" role="menuitem" onClick={() => { onClose(); onNewConversation(); }}><ShellIcon name="plus"/>新建对话</button>
    <button type="button" role="menuitem" onClick={() => { onClose(); onManage(); }}><ShellIcon name="edit"/>管理项目</button>
    <button type="button" role="menuitem" className="danger" onClick={() => { onClose(); onRemove(); }}><ShellIcon name="close"/>从 Fielora 移除</button>
  </div>, document.body);
}

function ProjectSortControl({ value, onChange }: { value: ProjectSort; onChange: (value: ProjectSort) => void }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const updateAnchor = useCallback(() => {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = 154;
    const height = 116;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right - width));
    const top = bounds.bottom + height + 8 <= window.innerHeight
      ? bounds.bottom + 4
      : Math.max(8, bounds.top - height - 4);
    setAnchor({ left, top });
  }, []);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const reposition = () => updateAnchor();
    window.addEventListener('pointerdown', pointer);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('pointerdown', pointer);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, updateAnchor]);
  const options: Array<{ value: ProjectSort; label: string }> = [
    { value: 'RECENT', label: '最近活动' },
    { value: 'NAME', label: '名称' },
    { value: 'CREATED', label: '添加时间' },
  ];
  return <div className={`project-sort-control ${open ? 'open' : ''}`} ref={rootRef}>
    <button ref={triggerRef} type="button" aria-label="整理项目" title="整理项目" aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) updateAnchor(); setOpen((current) => !current); }} data-testid="project-sort-toggle"><ShellIcon name="sort"/></button>
    {open && anchor && createPortal(<div ref={menuRef} className="project-sort-popover" role="menu" data-testid="project-sort-menu" style={{ left: anchor.left, top: anchor.top }}>{options.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={value === option.value} onClick={() => { onChange(option.value); setOpen(false); }}><span>{option.label}</span><em>{value === option.value ? '✓' : ''}</em></button>)}</div>, document.body)}
  </div>;
}

export function ProjectWorkspace({ onNow, onBrowse, onFields, onSettings, newConversationRequest, addProjectRequest, workspaceRequest }: ProjectWorkspaceProps) {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [projectId, setProjectId] = useState('');
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(() => new Set());
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<ConversationMessageView[]>([]);
  const [providers, setProviders] = useState<ProviderConfigView[]>([]);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileView | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreviewState>(null);
  const [editorContent, setEditorContent] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<'FILES' | 'DIFF'>('FILES');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [dockTabs, setDockTabs] = useState<ProjectDockTab[]>([]);
  const [activeDockTabId, setActiveDockTabId] = useState('');
  const [fileDockSessions, setFileDockSessions] = useState<Record<string, FileDockSession>>({});
  const [artifactSessions, setArtifactSessions] = useState<Record<string, ArtifactSurfaceSession>>({});
  const [artifactRefreshToken, setArtifactRefreshToken] = useState(0);
  const [artifactCommandBusy, setArtifactCommandBusy] = useState(false);
  const [fileFilter, setFileFilter] = useState('');
  const [fileTreeSelection, setFileTreeSelection] = useState('');
  const [environment, setEnvironment] = useState<WorkspaceEnvironmentView | null>(null);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [projectLauncherOpen, setProjectLauncherOpen] = useState(false);
  const [dockProjectLauncherOpen, setDockProjectLauncherOpen] = useState(false);
  const [projectOpenTargets, setProjectOpenTargets] = useState<WorkspaceProjectOpenTargetView[]>([{ target: 'FILE_EXPLORER', label: '文件资源管理器', icon_data_url: null }]);
  const [dockFileTreeCollapsed, setDockFileTreeCollapsed] = useState(false);
  const [dockFileTreeWidth, setDockFileTreeWidth] = useState(() => {
    const stored = Number.parseFloat(window.localStorage.getItem('fielora:dock-file-tree-width') ?? '270');
    return Number.isFinite(stored) ? Math.min(Math.max(stored, 190), 420) : 270;
  });
  const [dockFocused, setDockFocused] = useState(false);
  const [conversationDialog, setConversationDialog] = useState<ConversationDialog>(null);
  const [conversationContextMenu, setConversationContextMenu] = useState<ConversationContextMenuState | null>(null);
  const [projectDialog, setProjectDialog] = useState<ProjectDialog>(null);
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | null>(null);
  const [projectRemoval, setProjectRemoval] = useState<ProjectView | null>(null);
  const [projectSort, setProjectSort] = useState<ProjectSort>(() => {
    const stored = window.localStorage.getItem('fielora:project-sort');
    return stored === 'NAME' || stored === 'CREATED' ? stored : 'RECENT';
  });
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [undoChange, setUndoChange] = useState<UndoChange | null>(null);
  const [streamingOutput, setStreamingOutput] = useState('');
  const [agentRun, setAgentRun] = useState<AgentRunView | null>(null);
  const [agentEvents, setAgentEvents] = useState<AgentEventView[]>([]);
  const [agentTools, setAgentTools] = useState<AgentToolCallView[]>([]);
  const [mcpRuntime, setMcpRuntime] = useState<McpConnectionRuntimeView | null>(null);
  const [mcpBusyConnectionId, setMcpBusyConnectionId] = useState('');
  const [agentProjectionNotice, setAgentProjectionNotice] = useState('');
  const [terminalCommand, setTerminalCommand] = useState('');
  const [terminalLastCommand, setTerminalLastCommand] = useState('');
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalRunId, setTerminalRunId] = useState('');
  const [terminalWorkingDirectory, setTerminalWorkingDirectory] = useState('');
  const [bottomTerminalOpen, setBottomTerminalOpen] = useState(false);
  const [bottomTerminalHeight, setBottomTerminalHeight] = useState(() => {
    const stored = Number.parseFloat(window.localStorage.getItem('fielora:terminal-dock-height') ?? '250');
    return Number.isFinite(stored) ? Math.min(Math.max(stored, 170), 520) : 250;
  });
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<WorkspaceAttachmentView[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<WorkspaceAttachmentView | null>(null);
  const [imageContextMenu, setImageContextMenu] = useState<{ left: number; top: number; attachment: WorkspaceAttachmentView } | null>(null);
  const [permission, setPermission] = useState<ComposerPermission>('REVIEW_CHANGES');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState('');
  const [atLatestAnswer, setAtLatestAnswer] = useState(true);
  const [hasUnseenActivity, setHasUnseenActivity] = useState(false);
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUp[]>([]);
  const [agentReviewPath, setAgentReviewPath] = useState('');
  const [historicalReview, setHistoricalReview] = useState<HistoricalReviewSelection | null>(null);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [conversationCreatingFor, setConversationCreatingFor] = useState('');
  const [newConversationStart, setNewConversationStart] = useState(false);
  const [navigationWidth, setNavigationWidth] = useState(() => readWorkspaceNavigationWidth(270, 'fielora:project-navigation-width'));
  const [workspaceWidth, setWorkspaceWidth] = useState(() => {
    const stored = Number.parseFloat(window.localStorage.getItem('fielora:project-workspace-width') ?? '520');
    return Number.isFinite(stored) ? Math.min(Math.max(stored, 360), 900) : 520;
  });
  const activeAgentRef = useRef<ActiveAgent | null>(null);
  const agentRunIdRef = useRef('');
  const agentEventsRef = useRef<AgentEventView[]>([]);
  const agentToolsRef = useRef<AgentToolCallView[]>([]);
  const dockTabsRef = useRef<ProjectDockTab[]>([]);
  const artifactSessionsRef = useRef<Record<string, ArtifactSurfaceSession>>({});
  const handledArtifactToolCallsRef = useRef(new Set<string>());
  const foregroundAgentRunsRef = useRef(new Set<string>());
  const agentProjectionRefreshRef = useRef({ runId: '', inFlight: false, pending: false, timer: null as number | null });
  const terminalAgentRefreshRef = useRef(new Set<string>());
  const terminalRef = useRef<ActiveTerminal | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedConversationRef = useRef('');
  const handledNewConversationRequest = useRef(0);
  const handledAddProjectRequest = useRef(0);
  const handledWorkspaceRequest = useRef(0);
  const layoutRef = useRef<HTMLElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const atLatestAnswerRef = useRef(true);
  const environmentMenuRef = useRef<HTMLDivElement>(null);
  const projectLauncherRef = useRef<HTMLDivElement>(null);
  const dockProjectLauncherRef = useRef<HTMLDivElement>(null);
  const copiedMessageResetRef = useRef<number | null>(null);
  const creatingConversationForRef = useRef(new Set<string>());
  const queuedFollowUpStartingRef = useRef(false);
  const conversationRefreshGenerationRef = useRef(0);
  const [projectActionsLayer, setProjectActionsLayer] = useState<HTMLElement | null>(null);
  const [terminalLayer, setTerminalLayer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    document.body.dataset.projectWorkspace = 'true';
    return () => { delete document.body.dataset.projectWorkspace; };
  }, []);

  useEffect(() => {
    setProjectActionsLayer(document.getElementById('desktop-project-actions-layer'));
    setTerminalLayer(document.getElementById('desktop-terminal-layer'));
  }, []);

  useEffect(() => {
    document.body.style.setProperty('--desktop-navigation-width', `${navigationWidth + 4}px`);
    return () => { document.body.style.removeProperty('--desktop-navigation-width'); };
  }, [navigationWidth]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('fielora:workspace-dock-state', { detail: { open: workspaceOpen, activeTabId: activeDockTabId } }));
  }, [activeDockTabId, workspaceOpen]);

  useEffect(() => { dockTabsRef.current = dockTabs; }, [dockTabs]);
  useEffect(() => { artifactSessionsRef.current = artifactSessions; }, [artifactSessions]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('fielora:terminal-state', { detail: { open: bottomTerminalOpen, height: bottomTerminalHeight } }));
  }, [bottomTerminalHeight, bottomTerminalOpen]);

  useEffect(() => {
    const toggle = () => setBottomTerminalOpen((current) => !current);
    window.addEventListener('fielora:toggle-terminal', toggle);
    return () => {
      window.removeEventListener('fielora:toggle-terminal', toggle);
      window.dispatchEvent(new CustomEvent('fielora:terminal-state', { detail: { open: false, height: 250 } }));
    };
  }, []);

  useEffect(() => {
    document.body.dataset.workspaceDockFocus = String(dockFocused);
    window.dispatchEvent(new CustomEvent('fielora:workspace-focus-state', { detail: { focused: dockFocused } }));
    return () => { delete document.body.dataset.workspaceDockFocus; };
  }, [dockFocused]);

  useEffect(() => {
    const close = () => { setWorkspaceOpen(false); setDockFocused(false); };
    const openLauncher = () => setWorkspaceOpen(true);
    const toggleFocus = () => setDockFocused((current) => !current);
    window.addEventListener('fielora:close-workspace-dock', close);
    window.addEventListener('fielora:open-workspace-launcher', openLauncher);
    window.addEventListener('fielora:toggle-workspace-focus', toggleFocus);
    return () => {
      window.removeEventListener('fielora:close-workspace-dock', close);
      window.removeEventListener('fielora:open-workspace-launcher', openLauncher);
      window.removeEventListener('fielora:toggle-workspace-focus', toggleFocus);
    };
  }, []);

  useEffect(() => {
    atLatestAnswerRef.current = atLatestAnswer;
  }, [atLatestAnswer]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return undefined;
    atLatestAnswerRef.current = true;
    setAtLatestAnswer(true);
    setHasUnseenActivity(false);
    const update = () => {
      const next = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      atLatestAnswerRef.current = next;
      setAtLatestAnswer(next);
      if (next) setHasUnseenActivity(false);
    };
    list.addEventListener('scroll', update, { passive: true });
    window.requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; update(); });
    return () => list.removeEventListener('scroll', update);
  }, [conversationId]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    const frame = window.requestAnimationFrame(() => {
      if (atLatestAnswerRef.current) {
        list.scrollTop = list.scrollHeight;
        setAtLatestAnswer(true);
        setHasUnseenActivity(false);
      } else {
        setAtLatestAnswer(list.scrollHeight - list.scrollTop - list.clientHeight < 80);
        setHasUnseenActivity(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [agentEvents.length, agentRun?.status, agentTools.length, conversationId, messages.length, streamingOutput]);

  const project = projects.find((item) => item.field_id === projectId) ?? null;
  const conversation = conversations.find((item) => item.id === conversationId) ?? null;
  const activeProviders = useMemo(() => providers.filter((item) => item.lifecycle_status !== 'REMOVED'), [providers]);
  const singleActiveProvider = useMemo(() => (activeProviders.length === 1 ? activeProviders[0] : null), [activeProviders]);
  const effectiveConversationProvider = useMemo(() => {
    if (!conversation) return null;
    return conversation.provider_config_id
      ? activeProviders.find((item) => item.id === conversation.provider_config_id) ?? singleActiveProvider
      : singleActiveProvider;
  }, [activeProviders, conversation, singleActiveProvider]);
  const currentModelCapabilities = useMemo(() => modelCapabilities(effectiveConversationProvider), [effectiveConversationProvider]);
  const composerAttachments = useMemo(() => attachmentsForCapabilities(attachments, currentModelCapabilities), [attachments, currentModelCapabilities]);
  const approval = useMemo(() => pendingApproval(agentEvents, agentRun), [agentEvents, agentRun]);
  const approvalToolSummary = useMemo(() => pendingToolSummary(agentEvents, agentRun), [agentEvents, agentRun]);
  const agentTurn = useMemo(() => agentRun ? agentTurnOwnership(messages, agentRun, agentEvents) : null, [agentEvents, agentRun, messages]);
  const agentReview = useMemo(() => buildAgentReview(agentTools), [agentTools]);
  const displayedAgentReview = historicalReview?.review ?? agentReview;
  const agentRunIsTerminal = agentRun ? ['COMPLETED', 'FAILED', 'CANCELLED'].includes(agentRun.status) : false;
  const sortedProjects = useMemo(() => {
    const next = [...projects];
    if (projectSort === 'NAME') return next.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN', { sensitivity: 'base' }));
    if (projectSort === 'CREATED') return next.sort((left, right) => right.created_at - left.created_at || right.field_id.localeCompare(left.field_id));
    return next.sort((left, right) => right.updated_at - left.updated_at || right.field_id.localeCompare(left.field_id));
  }, [projectSort, projects]);

  useEffect(() => {
    setTerminalWorkingDirectory(project?.root_path ?? '');
    setTerminalCommand('');
    setTerminalLastCommand('');
    setTerminalOutput('');
  }, [project?.field_id, project?.root_path]);

  useEffect(() => {
    document.body.dataset.workspacePanelOpen = String(Boolean(project && workspaceOpen));
    document.body.style.setProperty('--desktop-project-workspace-width', `${workspaceWidth + 4}px`);
    return () => {
      delete document.body.dataset.workspacePanelOpen;
      document.body.style.removeProperty('--desktop-project-workspace-width');
    };
  }, [project, workspaceOpen, workspaceWidth]);

  function layoutWidth(): number {
    return layoutRef.current?.getBoundingClientRect().width ?? window.innerWidth;
  }

  function updateNavigationWidth(next: number) {
    const reserved = workspaceOpen && project ? workspaceWidth + 380 : 420;
    const maximum = Math.min(360, Math.max(190, layoutWidth() - reserved));
    const width = Math.min(Math.max(next, 190), maximum);
    setNavigationWidth(width);
    persistWorkspaceNavigationWidth(width, 'fielora:project-navigation-width');
  }

  function updateWorkspaceWidth(next: number) {
    const maximum = Math.max(360, layoutWidth() - navigationWidth - 380);
    const width = Math.min(Math.max(next, 360), Math.min(900, maximum));
    setWorkspaceWidth(width);
    window.localStorage.setItem('fielora:project-workspace-width', String(Math.round(width)));
  }

  function updateBottomTerminalHeight(next: number) {
    const height = Math.min(Math.max(next, 170), 520);
    setBottomTerminalHeight(height);
    window.localStorage.setItem('fielora:terminal-dock-height', String(Math.round(height)));
  }

  const refreshProviders = useCallback(async () => setProviders(await window.fielora.provider.list()), []);
  const refreshProjects = useCallback(async (preferred?: string) => {
    const next = await window.fielora.project.list();
    setProjects(next);
    setProjectId((current) => preferred ?? (next.some((item) => item.field_id === current) ? current : next[0]?.field_id ?? ''));
    setProjectsLoaded(true);
  }, []);
  const refreshConversations = useCallback(async (fieldId: string, preferred?: string) => {
    const generation = ++conversationRefreshGenerationRef.current;
    const next = await window.fielora.conversation.list({ field_id: fieldId });
    const draftCandidates = next.filter((item) => isDefaultConversationTitle(item.title));
    let visible = next;
    if (draftCandidates.length > 0) {
      const draftHistories = await Promise.all(draftCandidates.map(async (item) => ({
        conversation: item,
        messages: await window.fielora.conversation.listMessages({ conversation_id: item.id }),
      })));
      const replacements = new Map<string, ConversationView>();
      await Promise.all(draftHistories.map(async ({ conversation: draftConversation, messages: history }) => {
        const firstUserMessage = history.find((message) => message.role === 'USER');
        if (!firstUserMessage) return;
        const generatedTitle = conversationTitleFromContent(firstUserMessage.content);
        if (isDefaultConversationTitle(generatedTitle)) return;
        try {
          const titled = await window.fielora.conversation.update({
            conversation_id: draftConversation.id,
            expected_revision: draftConversation.revision,
            title: generatedTitle,
            provider_config_id: draftConversation.provider_config_id,
            model_id: draftConversation.model_id,
          });
          replacements.set(titled.id, titled);
        } catch {
          // A concurrent update wins; the next refresh will reconcile the display title.
        }
      }));
      const normalized = next.map((item) => replacements.get(item.id) ?? item);
      const unsentIds = new Set(draftHistories.filter((item) => !hasUserMessage(item.messages)).map((item) => item.conversation.id));
      visible = collapseDuplicateUnsentConversations(normalized, unsentIds);
    }
    if (generation !== conversationRefreshGenerationRef.current) return;
    setConversations(visible);
    setConversationId((current) => {
      if (preferred && visible.some((item) => item.id === preferred)) return preferred;
      return visible.some((item) => item.id === current) ? current : visible[0]?.id ?? '';
    });
  }, []);
  const refreshMessages = useCallback(async (id: string) => {
    const next = await window.fielora.conversation.listMessages({ conversation_id: id });
    if (selectedConversationRef.current === id) setMessages(next);
  }, []);
  const loadAgentRun = useCallback(async (run: AgentRunView, reset = false) => {
    const projectionStarted = performance.now();
    const sameRun = agentRunIdRef.current === run.id;
    const existing = !reset && sameRun ? agentEventsRef.current : [];
    const afterSequence = existing.at(-1)?.sequence ?? null;
    const incremental = await window.fielora.agent.events({ run_id: run.id, after_sequence: afterSequence, limit: reset ? 200 : 100 });
    const needsTools = reset || !sameRun || incremental.some((event) => event.kind.startsWith('TOOL_') || event.kind.startsWith('APPROVAL_'));
    const [tools, nextMcpRuntime] = await Promise.all([
      needsTools ? window.fielora.agent.toolCalls({ run_id: run.id }) : Promise.resolve(agentToolsRef.current),
      window.fielora.agent.mcpRuntime({ run_id: run.id }).catch(() => null),
    ]);
    if (selectedConversationRef.current !== run.conversation_id) return;
    const activeRunId = activeAgentRef.current?.runId;
    if (agentRunIdRef.current && agentRunIdRef.current !== run.id && activeRunId !== run.id) return;
    const events = mergeAgentEventPages(existing, incremental);
    agentEventsRef.current = events;
    agentToolsRef.current = tools;
    processArtifactToolReceipts(tools);
    agentRunIdRef.current = run.id;
    setAgentRun(run); setAgentEvents(events); setAgentTools(tools); setMcpRuntime(nextMcpRuntime); setAgentProjectionNotice('');
    performance.clearMeasures('fielora.agent.projection');
    performance.measure('fielora.agent.projection', { start: projectionStarted });
    if (['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(run.status)) {
      if (activeAgentRef.current?.runId !== run.id) activeAgentRef.current = { runId: run.id, conversationId: run.conversation_id, output: '' };
    } else if (activeAgentRef.current?.runId === run.id) activeAgentRef.current = null;
  }, []);
  const refreshConversationAgent = useCallback(async (id: string) => {
    const runs = (await window.fielora.agent.list({ conversation_id: id })).filter((run) => !run.task.startsWith('[SUBAGENT ') && !run.task.startsWith('[HUMAN_COMMAND '));
    if (selectedConversationRef.current !== id) return;
    if (!runs[0]) { agentRunIdRef.current = ''; agentEventsRef.current = []; agentToolsRef.current = []; setAgentRun(null); setAgentEvents([]); setAgentTools([]); setMcpRuntime(null); activeAgentRef.current = null; return; }
    await loadAgentRun(runs[0], true);
  }, [loadAgentRun]);

  useEffect(() => {
    void Promise.all([refreshProjects(), refreshProviders()]).catch((reason) => setError(reasonMessage(reason)));
  }, [refreshProjects, refreshProviders]);

  useEffect(() => {
    const changed = () => void refreshProviders().catch((reason) => setError(reasonMessage(reason)));
    window.addEventListener('fielora:providers-changed', changed);
    return () => window.removeEventListener('fielora:providers-changed', changed);
  }, [refreshProviders]);

  useEffect(() => {
    if (!projectId) { setConversations([]); setConversationId(''); setFiles([]); setEnvironment(null); setDockTabs([]); setArtifactSessions({}); setActiveDockTabId(''); setWorkspaceOpen(false); setDockFocused(false); foregroundAgentRunsRef.current.clear(); return; }
    setSelectedFile(null); setFilePreview(null); setEditorContent(''); setDraft(null); setUndoChange(null);
    setWorkspaceOpen(false); setDockTabs([]); setArtifactSessions({}); setActiveDockTabId(''); setFileDockSessions({}); setFileTreeSelection(''); setEnvironmentOpen(false); setProjectLauncherOpen(false); setDockProjectLauncherOpen(false); setDockFocused(false); handledArtifactToolCallsRef.current.clear(); foregroundAgentRunsRef.current.clear();
    void Promise.all([
      refreshConversations(projectId),
      window.fielora.workspace.listFiles({ field_id: projectId }).then(setFiles),
      window.fielora.workspace.getEnvironment({ field_id: projectId }).then(setEnvironment),
      window.fielora.workspace.getOpenTargets({ field_id: projectId }).then(setProjectOpenTargets),
    ]).catch((reason) => setError(reasonMessage(reason)));
  }, [projectId, refreshConversations]);

  useEffect(() => {
    selectedConversationRef.current = conversationId;
    setStreamingOutput('');
    setPrompt(''); setAttachments([]);
    setQueuedFollowUps(readQueuedFollowUps(conversationId));
    queuedFollowUpStartingRef.current = false;
    setHistoricalReview(null); setAgentReviewPath('');
    const conversationOverride = conversationId ? localStorage.getItem(`fielora:conversation-permission:${conversationId}`) : null;
    const projectDefault = projectId ? localStorage.getItem(`fielora:project-permission:${projectId}`) : null;
    const globalDefault = localStorage.getItem('fielora:permission:default');
    setPermission(resolveComposerPermission(conversationOverride, projectDefault, globalDefault));
    agentEventsRef.current = [];
    agentToolsRef.current = [];
    agentRunIdRef.current = '';
    setAgentProjectionNotice('');
    if (!conversationId) { setMessages([]); setAgentRun(null); setAgentEvents([]); setAgentTools([]); setMcpRuntime(null); activeAgentRef.current = null; return; }
    void refreshMessages(conversationId).catch((reason) => setError(reasonMessage(reason)));
    void refreshConversationAgent(conversationId).catch(() => setAgentProjectionNotice(AGENT_PROJECTION_UNAVAILABLE_MESSAGE));
  }, [conversationId, projectId, refreshConversationAgent, refreshMessages]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  useEffect(() => () => {
    if (copiedMessageResetRef.current !== null) window.clearTimeout(copiedMessageResetRef.current);
  }, []);

  async function copyMessage(message: ConversationMessageView): Promise<void> {
    try {
      await window.fielora.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      if (copiedMessageResetRef.current !== null) window.clearTimeout(copiedMessageResetRef.current);
      copiedMessageResetRef.current = window.setTimeout(() => {
        setCopiedMessageId('');
        copiedMessageResetRef.current = null;
      }, 1600);
    } catch (reason) {
      setError(`复制消息失败：${reasonMessage(reason)}`);
    }
  }

  useEffect(() => {
    if (!environmentOpen && !projectLauncherOpen && !dockProjectLauncherOpen) return;
    const close = (event: PointerEvent) => {
      if (!environmentMenuRef.current?.contains(event.target as Node)) setEnvironmentOpen(false);
      if (!projectLauncherRef.current?.contains(event.target as Node)) setProjectLauncherOpen(false);
      if (!dockProjectLauncherRef.current?.contains(event.target as Node)) setDockProjectLauncherOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [dockProjectLauncherOpen, environmentOpen, projectLauncherOpen]);

  const refreshChangedAgent = useCallback(async (runId: string) => {
    const refresh = agentProjectionRefreshRef.current;
    refresh.runId = runId;
    if (refresh.inFlight) { refresh.pending = true; return; }
    refresh.inFlight = true;
    try {
      do {
        refresh.pending = false;
        const nextRunId = refresh.runId;
        try {
          const run = await window.fielora.agent.get({ run_id: nextRunId });
          if (run.task.startsWith('[SUBAGENT ') || selectedConversationRef.current !== run.conversation_id) continue;
          if (agentRunIdRef.current && agentRunIdRef.current !== run.id && activeAgentRef.current?.runId !== run.id) continue;
          await loadAgentRun(run);
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status) && !terminalAgentRefreshRef.current.has(run.id)) {
            terminalAgentRefreshRef.current.add(run.id);
            if (activeAgentRef.current?.runId === run.id) activeAgentRef.current = null;
            setStreamingOutput('');
            await Promise.all([
              refreshMessages(run.conversation_id),
              refreshConversations(run.field_id, run.conversation_id),
              window.fielora.workspace.listFiles({ field_id: run.field_id }).then(setFiles),
            ]);
          }
        } catch {
          setAgentProjectionNotice(AGENT_PROJECTION_UNAVAILABLE_MESSAGE);
        }
      } while (refresh.pending);
    } finally {
      refresh.inFlight = false;
    }
  }, [loadAgentRun, refreshConversations, refreshMessages]);

  useEffect(() => window.fielora.core.subscribe((event) => {
    if (event.event === 'event.agent.text_delta') {
      const delta = event as AgentTextDeltaEvent;
      const active = activeAgentRef.current;
      if (!active || active.runId !== delta.run_id) return;
      active.output += delta.text_delta;
      setStreamingOutput(active.output);
      return;
    }
    if (event.event !== 'event.agent.changed') return;
    const runId = (event as AgentChangedEvent).run_id;
    const refresh = agentProjectionRefreshRef.current;
    refresh.runId = runId;
    refresh.pending = true;
    if (refresh.timer !== null) return;
    refresh.timer = window.setTimeout(() => {
      refresh.timer = null;
      void refreshChangedAgent(refresh.runId);
    }, 40);
  }), [refreshChangedAgent]);

  useEffect(() => () => {
    const timer = agentProjectionRefreshRef.current.timer;
    if (timer !== null) window.clearTimeout(timer);
  }, []);

  useEffect(() => window.fielora.workspace.subscribe((event) => {
    const active = terminalRef.current;
    if (!active || active.runId !== event.run_id) return;
    if (event.kind === 'OUTPUT' && event.text) {
      active.output += event.text;
      setTerminalOutput(active.output);
      return;
    }
    if (!['COMPLETED', 'CANCELLED', 'FAILED'].includes(event.kind)) return;
    terminalRef.current = null; setTerminalRunId('');
  }), []);

  async function addProject() {
    setError('');
    try {
      const created = await window.fielora.project.pick({ title: '', goal: null });
      if (created) {
        await refreshProjects(created.field_id);
      }
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function rebindProject(targetProject: ProjectView) {
    setError('');
    try {
      const rebound = await window.fielora.project.rebind({ field_id: targetProject.field_id });
      if (rebound) await refreshProjects(rebound.field_id);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function createConversationFor(targetProject: ProjectView): Promise<ConversationView | null> {
    const fieldId = targetProject.field_id;
    setProjectId(fieldId);
    setCollapsedProjectIds((current) => {
      if (!current.has(fieldId)) return current;
      const next = new Set(current);
      next.delete(fieldId);
      return next;
    });
    setNewConversationStart(false);
    if (creatingConversationForRef.current.has(fieldId)) return null;
    creatingConversationForRef.current.add(fieldId);
    setConversationCreatingFor(fieldId);
    setError('');
    try {
      const existing = await withUiTimeout(window.fielora.conversation.list({ field_id: fieldId }), 12_000, '创建对话超时，请重试。');
      for (const candidate of existing.filter((item) => isDefaultConversationTitle(item.title))) {
        const history = await withUiTimeout(window.fielora.conversation.listMessages({ conversation_id: candidate.id }), 12_000, '读取现有对话超时，请重试。');
        if (!hasUserMessage(history)) {
          await refreshConversations(fieldId, candidate.id);
          return candidate;
        }
      }
      const ready = singleActiveProvider?.credential_present ? singleActiveProvider : (activeProviders.find((item) => item.credential_present) ?? singleActiveProvider ?? activeProviders[0] ?? null);
      const created = await withUiTimeout(window.fielora.conversation.create({
        field_id: fieldId, title: '新对话', provider_config_id: ready?.id ?? null, model_id: ready?.default_model ?? null,
      }), 12_000, '创建对话超时，请重试。');
      await refreshConversations(fieldId, created.id);
      return created;
    } catch (reason) {
      setError(`无法创建新对话：${reasonMessage(reason)}`);
      return null;
    } finally {
      creatingConversationForRef.current.delete(fieldId);
      setConversationCreatingFor((current) => current === fieldId ? '' : current);
    }
  }

  async function createConversation() {
    if (!project) { setNewConversationStart(true); return; }
    await createConversationFor(project);
  }

  function activateConversation(id: string) {
    setConversationId(id);
  }

  useEffect(() => {
    if (!projectsLoaded || newConversationRequest <= handledNewConversationRequest.current) return;
    handledNewConversationRequest.current = newConversationRequest;
    if (project) void createConversation();
    else setNewConversationStart(true);
  }, [newConversationRequest, project, projectsLoaded]);

  useEffect(() => {
    if (!projectsLoaded || addProjectRequest <= handledAddProjectRequest.current) return;
    handledAddProjectRequest.current = addProjectRequest;
    void addProject();
  }, [addProjectRequest, projectsLoaded]);

  useEffect(() => {
    if (!projectsLoaded || workspaceRequest.id <= handledWorkspaceRequest.current) return;
    if (projects.length === 0) {
      handledWorkspaceRequest.current = workspaceRequest.id;
      setError('请先打开一个本地 Project，再使用文件、审阅或终端。');
      return;
    }
    if (!project) return;
    handledWorkspaceRequest.current = workspaceRequest.id;
    openWorkspace(workspaceRequest.tool);
  }, [project, projects, projectsLoaded, workspaceRequest]);

  async function renameConversation(title: string) {
    if (!conversation) return;
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === conversation.title) { setConversationDialog(null); return; }
    try {
      const updated = await window.fielora.conversation.update({
        conversation_id: conversation.id, expected_revision: conversation.revision, title: nextTitle,
        provider_config_id: conversation.provider_config_id, model_id: conversation.model_id,
      });
      await refreshConversations(updated.field_id, updated.id);
      setConversationDialog(null);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  function updateProjectSort(value: ProjectSort) {
    setProjectSort(value);
    window.localStorage.setItem('fielora:project-sort', value);
  }

  async function renameProject() {
    if (!projectDialog) return;
    const nextTitle = projectDialog.value.trim();
    if (!nextTitle || nextTitle === projectDialog.project.title) { setProjectDialog(null); return; }
    try {
      const updated = await window.fielora.project.update({
        field_id: projectDialog.project.field_id,
        expected_revision: projectDialog.project.revision,
        title: nextTitle,
      });
      await refreshProjects(updated.field_id);
      setProjectDialog(null);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function archiveProject(target: ProjectView) {
    if (target.field_id === projectId && activeAgentRef.current) {
      setProjectRemoval(null);
      setError('请先停止当前 Agent，再移除这个项目。');
      return;
    }
    if (target.field_id === projectId && terminalRunId) {
      setProjectRemoval(null);
      setError('请先停止当前终端任务，再移除这个项目。');
      return;
    }
    try {
      await window.fielora.project.archive({
        field_id: target.field_id,
        expected_revision: target.revision,
      });
      const remaining = sortedProjects.filter((item) => item.field_id !== target.field_id);
      const preferred = target.field_id === projectId ? remaining[0]?.field_id ?? '' : projectId;
      setProjectRemoval(null);
      setProjectContextMenu(null);
      await refreshProjects(preferred);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function archiveConversation() {
    if (!conversation) return;
    try {
      await window.fielora.conversation.archive({ conversation_id: conversation.id, expected_revision: conversation.revision });
      await refreshConversations(conversation.field_id);
      setConversationDialog(null);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function updateConversationSelection(providerId: string, modelId?: string) {
    if (!conversation) return;
    const provider = activeProviders.find((item) => item.id === providerId) ?? null;
    try {
      const updated = await window.fielora.conversation.update({
        conversation_id: conversation.id, expected_revision: conversation.revision, title: conversation.title,
        provider_config_id: provider?.id ?? null, model_id: modelId ?? provider?.default_model ?? null,
      });
      setConversations((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  function updatePermission(value: ComposerPermission) {
    setPermission(value);
    if (conversation) localStorage.setItem(`fielora:conversation-permission:${conversation.id}`, value);
    if (project) localStorage.setItem(`fielora:project-permission:${project.field_id}`, value);
    localStorage.setItem('fielora:permission:default', value);
  }

  async function decideApproval(decision: 'ALLOW_ONCE' | 'DENY') {
    if (!agentRun || !approval) return;
    setBusy(true); setError('');
    try {
      await window.fielora.agent.resolveApproval({ run_id: agentRun.id, approval_id: approval.id, nonce: approval.nonce, decision });
      const next = await window.fielora.agent.get({ run_id: agentRun.id });
      await loadAgentRun(next);
    } catch (reason) { setError(reasonMessage(reason)); }
    finally { setBusy(false); }
  }

  async function resumeAgent() {
    if (!agentRun) return;
    try { const next = await window.fielora.agent.resume({ run_id: agentRun.id }); activeAgentRef.current = { runId: next.id, conversationId: next.conversation_id, output: '' }; await loadAgentRun(next); }
    catch (reason) { setError(reasonMessage(reason)); }
  }

  async function activateMcpConnection(connectionId: string) {
    if (!agentRun || mcpBusyConnectionId) return;
    setMcpBusyConnectionId(connectionId); setError('');
    try {
      await window.fielora.agent.activateMcpConnection({ run_id: agentRun.id, connection_id: connectionId });
      const next = await window.fielora.agent.get({ run_id: agentRun.id });
      await loadAgentRun(next);
    } catch (reason) {
      setError(`MCP 激活请求失败：${reasonMessage(reason)}`);
      const runtime = await window.fielora.agent.mcpRuntime({ run_id: agentRun.id }).catch(() => null);
      setMcpRuntime(runtime);
    } finally {
      setMcpBusyConnectionId('');
    }
  }

  async function cancelAgent() {
    if (!agentRun) return;
    try { await window.fielora.agent.cancel({ run_id: agentRun.id }); }
    catch (reason) { setError(reasonMessage(reason)); }
  }

  async function retryAgent() {
    if (!project || !conversation || !agentRun || agentRun.status !== 'FAILED' || activeAgentRef.current) return;
    const provider = activeProviders.find((item) => item.id === agentRun.provider_config_id) ?? effectiveConversationProvider;
    if (!provider || !provider.credential_present) { setError('原模型配置已不可用，请先在设置中检查。'); return; }
    setBusy(true); setError('');
    try {
      const ownership = agentTurnOwnership(messages, agentRun, agentEvents);
      const retryImages = await Promise.all((ownership.userMessageId ? messageAttachments(ownership.userMessageId) : []).map(async (item) => {
        if (item.data_url || !item.content_ref) return item;
        const stored = await window.fielora.workspace.readAttachment({ content_ref: item.content_ref });
        return { ...item, data_url: stored.data_url, mime_type: stored.mime_type };
      }));
      const started = await window.fielora.agent.start({
        field_id: project.field_id,
        conversation_id: conversation.id,
        user_message_id: ownership.userMessageId,
        provider_config_id: provider.id,
        model_id: agentRun.model_id,
        task: agentRun.task,
        permission: agentRun.permission,
        max_steps: agentRun.max_steps,
        attachments: retryImages.filter((item) => item.data_url && item.width && item.height).map((item) => ({
          id: item.id, filename: item.name, mime_type: item.mime_type, size: item.size, width: item.width!, height: item.height!, source: item.source, data_url: item.data_url!,
        })),
        active_work_surface: selectedActiveArtifactContext(),
      });
      foregroundAgentRunsRef.current.add(started.id);
      activeAgentRef.current = { runId: started.id, conversationId: conversation.id, output: '' };
      agentRunIdRef.current = started.id; agentEventsRef.current = []; agentToolsRef.current = [];
      setAgentRun(started); setAgentEvents([]); setAgentTools([]); setMcpRuntime(null); setStreamingOutput('');
      scrollToLatestAnswer();
    } catch (reason) { setError(reasonMessage(reason)); }
    finally { setBusy(false); }
  }

  async function pickAttachments() {
    setError('');
    try {
      const selection = await window.fielora.workspace.pickAttachments();
      await acceptAttachmentSelection(selection.attachments, 'file_picker', selection.truncated_count);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function acceptAttachmentSelection(incoming: WorkspaceAttachmentView[], source: WorkspaceAttachmentView['source'], truncatedCount = 0) {
    const normalized = await normalizeAttachmentSelection(incoming, source, (request) => window.fielora.workspace.storeAttachment(request));
    const unique = normalized.filter((item) => !attachments.some((existing) => existing.id === item.id));
    const next = [...attachments, ...unique].slice(0, 4);
    setAttachments(next);
    const rejected = attachmentsForCapabilities(normalized, currentModelCapabilities).filter((item) => item.status !== 'READY');
    const overflow = truncatedCount + Math.max(0, attachments.length + unique.length - 4);
    if (overflow > 0) setError(`一次最多添加 4 个附件，已忽略 ${overflow} 个。`);
    else if (rejected.length > 0) setError(rejected.map((item) => `${item.name}：${item.reason}`).join('；'));
    else setError('');
  }

  async function addBrowserAttachments(files: readonly File[], source: 'clipboard' | 'drag_drop') {
    try {
      const selection = await loadBrowserAttachments(files, source);
      await acceptAttachmentSelection(selection.attachments, source, selection.truncated_count);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) return; // Keep Chromium's native text/code paste and cursor behavior.
    event.preventDefault();
    void addBrowserAttachments(files, 'clipboard');
  }

  function handleComposerDrop(event: DragEvent<HTMLFormElement>) {
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    void addBrowserAttachments(files, 'drag_drop');
  }

  function openImageContextMenu(event: ReactMouseEvent, attachment: WorkspaceAttachmentView) {
    setImageContextMenu({ left: Math.max(8, Math.min(window.innerWidth - 170, event.clientX)), top: Math.max(8, Math.min(window.innerHeight - 48, event.clientY)), attachment });
  }

  async function saveImageAttachment(attachment: WorkspaceAttachmentView) {
    setImageContextMenu(null);
    if (!attachment.content_ref) { setError('这张图片还没有可保存的本地内容。'); return; }
    try { await window.fielora.workspace.saveAttachment({ content_ref: attachment.content_ref, filename: attachment.name }); }
    catch (reason) { setError(reasonMessage(reason)); }
  }

  async function copyImageAttachment(attachment: WorkspaceAttachmentView) {
    setImageContextMenu(null);
    if (!attachment.content_ref) { setError('这张图片还没有可复制的本地内容。'); return; }
    try { await window.fielora.workspace.copyAttachment({ content_ref: attachment.content_ref }); }
    catch (reason) { setError(reasonMessage(reason)); }
  }

  function toggleVoiceInput() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setError('当前 Windows 语音识别服务不可用，请继续使用文字输入。'); return; }
    const recognition = new Recognition();
    const original = prompt.trim();
    recognition.lang = navigator.language || 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index]?.[0]?.transcript ?? '';
      setPrompt(`${original}${original && transcript ? ' ' : ''}${transcript}`);
    };
    recognition.onerror = (event) => {
      setListening(false); recognitionRef.current = null;
      setError(event.error === 'not-allowed' ? '麦克风权限未开启，请在 Windows 隐私设置中允许后重试。' : '语音识别没有成功，请重试或继续输入文字。');
    };
    recognition.onend = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = recognition;
    setError(''); setListening(true);
    try { recognition.start(); }
    catch { setListening(false); recognitionRef.current = null; setError('语音识别无法启动，请继续使用文字输入。'); }
  }

  async function queueFollowUp(content: string) {
    const active = activeAgentRef.current;
    if (!project || !conversation || !active) return;
    const userText = content.trim();
    if (!userText) return;
    if (composerAttachments.some((item) => item.status === 'READY')) {
      setError('运行中追加暂时只支持文字；附件仍保留在输入框中，可在当前任务结束后发送。');
      return;
    }
    setBusy(true); setError('');
    try {
      const message = await window.fielora.conversation.createMessage({
        conversation_id: conversation.id, role: 'USER', content: userText, status: 'COMPLETED',
        provider_config_id: null, model_id: null, invocation_id: null,
      });
      const queued: QueuedFollowUp = {
        messageId: message.id,
        content: userText,
        afterRunId: active.runId,
        selectedFilePath: selectedFile?.relative_path ?? null,
        permission,
        createdAt: Date.now(),
      };
      setQueuedFollowUps((current) => {
        const next = [...current, queued];
        persistQueuedFollowUps(conversation.id, next);
        return next;
      });
      setPrompt('');
      await refreshMessages(conversation.id);
      scrollToLatestAnswer();
    } catch (reason) { setError(reasonMessage(reason)); }
    finally { setBusy(false); }
  }

  async function startQueuedFollowUp(item: QueuedFollowUp) {
    if (!project || !conversation || activeAgentRef.current || !agentRunIsTerminal) return;
    const provider = effectiveConversationProvider;
    if (!provider || !provider.credential_present) throw new Error('追加任务对应的模型服务当前不可用，请在设置中检查。');
    const selectedHint = item.selectedFilePath ? `\n\nThe currently selected project file is: ${item.selectedFilePath}` : '';
    const started = await window.fielora.agent.start({
      field_id: project.field_id, conversation_id: conversation.id,
      user_message_id: item.messageId,
      provider_config_id: provider.id, model_id: provider.default_model,
      task: `${item.content}${selectedHint}`.slice(0, 32_000), permission: item.permission, max_steps: 24,
      attachments: [],
      active_work_surface: selectedActiveArtifactContext(),
    });
    foregroundAgentRunsRef.current.add(started.id);
    activeAgentRef.current = { runId: started.id, conversationId: conversation.id, output: '' };
    agentRunIdRef.current = started.id; agentEventsRef.current = []; agentToolsRef.current = [];
    setAgentRun(started); setAgentEvents([]); setAgentTools([]); setMcpRuntime(null); setStreamingOutput('');
    scrollToLatestAnswer();
    setQueuedFollowUps((current) => {
      const next = current.filter((queued) => queued.messageId !== item.messageId);
      persistQueuedFollowUps(conversation.id, next);
      return next;
    });
  }

  async function send(content: string) {
    if (!project || !conversation) return;
    if (activeAgentRef.current) { await queueFollowUp(content); return; }
    const provider = effectiveConversationProvider;
    if (!provider || !provider.credential_present) { setError('请先选择已配置凭据的模型服务。'); return; }
    const blockedImage = composerAttachments.find((item) => item.kind === 'IMAGE' && item.status !== 'READY');
    if (blockedImage) { setError(blockedImage.reason ?? '当前模型不支持图片输入'); return; }
    const readyTextAttachments = composerAttachments.filter((item) => item.status === 'READY' && item.kind === 'TEXT' && item.content !== null && item.sha256 !== null);
    const readyImageAttachments = composerAttachments.filter((item) => item.status === 'READY' && item.kind === 'IMAGE' && item.data_url && item.sha256 && item.width && item.height && item.content_ref);
    const readyAttachments = [...readyTextAttachments, ...readyImageAttachments];
    const userText = content.trim() || (readyAttachments.length > 0 ? '请阅读并分析这些附件。' : '');
    if (!userText) return;
    setBusy(true); setError('');
    try {
      let activeConversation = conversation;
      if (conversation.model_id !== provider.default_model) {
        const synced = await window.fielora.conversation.update({
          conversation_id: conversation.id, expected_revision: conversation.revision, title: conversation.title,
          provider_config_id: provider.id, model_id: provider.default_model,
        });
        activeConversation = synced;
        setConversations((items) => items.map((item) => item.id === synced.id ? synced : item));
      }
      const visibleMessage = readyTextAttachments.length > 0 ? `${userText}\n\n附件：${readyTextAttachments.map((item) => item.name).join('、')}` : userText;
      const userMessage = await window.fielora.conversation.createMessage({
        conversation_id: conversation.id, role: 'USER', content: visibleMessage, status: 'COMPLETED',
        provider_config_id: null, model_id: null, invocation_id: null,
      });
      persistMessageAttachments(userMessage.id, readyImageAttachments);
      await refreshMessages(conversation.id);
      if (isDefaultConversationTitle(activeConversation.title)) {
        try {
          const latest = await window.fielora.conversation.get({ conversation_id: conversation.id });
          const generatedTitle = conversationTitleFromContent(userText);
          if (!isDefaultConversationTitle(generatedTitle)) {
            const titled = await window.fielora.conversation.update({
              conversation_id: latest.id,
              expected_revision: latest.revision,
              title: generatedTitle,
              provider_config_id: latest.provider_config_id,
              model_id: latest.model_id,
            });
            await refreshConversations(titled.field_id, titled.id);
          }
        } catch {
          // Title generation is presentation metadata and must never stop an accepted user task.
        }
      }
      const selectedHint = selectedFile ? `\n\nThe currently selected project file is: ${selectedFile.relative_path}` : '';
      const attachmentContext = readyTextAttachments.map((item) => `\n<attachment name=${JSON.stringify(item.name)} sha256=${JSON.stringify(item.sha256)}>\n${item.content!.slice(0, 32_000)}\n</attachment>`).join('');
      const task = `${userText}${selectedHint}${attachmentContext}`.slice(0, 32_000);
      const started = await window.fielora.agent.start({
        field_id: project.field_id, conversation_id: conversation.id,
        user_message_id: userMessage.id,
        provider_config_id: provider.id, model_id: provider.default_model,
        task, permission, max_steps: 24,
        attachments: readyImageAttachments.map((item) => ({
          id: item.id, filename: item.name, mime_type: item.mime_type, size: item.size,
          width: item.width!, height: item.height!, source: item.source, data_url: item.data_url!,
        })),
        active_work_surface: selectedActiveArtifactContext(),
      });
      foregroundAgentRunsRef.current.add(started.id);
      activeAgentRef.current = { runId: started.id, conversationId: conversation.id, output: '' };
      agentRunIdRef.current = started.id; agentEventsRef.current = []; agentToolsRef.current = [];
      setAgentRun(started); setAgentEvents([]); setAgentTools([]); setMcpRuntime(null);
      setStreamingOutput(''); setPrompt(''); setAttachments([]);
      scrollToLatestAnswer();
    } catch (reason) { setError(reasonMessage(reason)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const next = queuedFollowUps[0];
    if (!next || !agentRunIsTerminal || activeAgentRef.current || queuedFollowUpStartingRef.current) return;
    queuedFollowUpStartingRef.current = true;
    setBusy(true);
    void startQueuedFollowUp(next)
      .catch((reason) => setError(reasonMessage(reason)))
      .finally(() => { queuedFollowUpStartingRef.current = false; setBusy(false); });
  }, [agentRun?.id, agentRun?.status, queuedFollowUps]);

  function selectedActiveArtifactContext() {
    const tab = dockTabsRef.current.find((candidate) => candidate.id === activeDockTabId);
    if (tab?.kind !== 'ARTIFACT') return undefined;
    return activeArtifactContext(artifactSessionsRef.current[tab.id] ?? null) ?? undefined;
  }

  function updateArtifactTabLabel(artifact: ArtifactView) {
    const id = artifactTabId(artifact.artifact_id);
    setDockTabs((current) => current.map((tab) => tab.id === id ? {
      ...tab,
      label: artifact.title?.trim() || `未命名${artifact.artifact_type === 'PRESENTATION' ? '演示文稿' : artifact.artifact_type === 'SPREADSHEET' ? '电子表格' : artifact.artifact_type === 'DIAGRAM' ? '图示' : '文档'}`,
    } : tab));
  }

  async function loadArtifactRevision(artifactId: string, revisionId: string | null, mode: 'CURRENT' | 'HISTORICAL') {
    const tabId = artifactTabId(artifactId);
    setArtifactSessions((current) => ({ ...current, [tabId]: { ...(current[tabId] ?? emptyArtifactSession(artifactId)), loading: true, error: '' } }));
    try {
      const [read, history] = await Promise.all([
        window.fielora.artifact.read({ artifact_id: artifactId, revision_id: revisionId }),
        window.fielora.artifact.history({ artifact_id: artifactId, before_sequence: null, limit: 50 }),
      ]);
      setArtifactSessions((current) => {
        const previous = current[tabId] ?? emptyArtifactSession(artifactId);
        let next = mode === 'CURRENT'
          ? refreshArtifactCurrent({ ...previous, mode: 'CURRENT' }, read, history)
          : pinArtifactRevision(previous, read, history);
        if (read.revision.content.type === 'PRESENTATION' && next.selectedSlide === null) next = { ...next, selectedSlide: 0 };
        if (read.revision.content.type === 'SPREADSHEET' && next.selectedSheetId === null) next = { ...next, selectedSheetId: read.revision.content.content.sheets[0]?.sheet_id ?? null };
        return { ...current, [tabId]: next };
      });
      updateArtifactTabLabel(read.artifact);
      setArtifactRefreshToken((value) => value + 1);
    } catch {
      setArtifactSessions((current) => ({ ...current, [tabId]: { ...(current[tabId] ?? emptyArtifactSession(artifactId)), loading: false, error: '暂时无法读取这个工作对象或版本。' } }));
    }
  }

  function openArtifact(artifact: ArtifactView | string) {
    const artifactId = typeof artifact === 'string' ? artifact : artifact.artifact_id;
    const tabId = artifactTabId(artifactId);
    const artifactType = typeof artifact === 'string' ? null : artifact.artifact_type;
    ensureDockTab({ id: tabId, kind: 'ARTIFACT', label: typeof artifact === 'string' ? '工作对象' : artifact.title || '工作对象', icon: artifactType === 'PRESENTATION' ? 'image' : 'files', artifactId });
    if (!artifactSessionsRef.current[tabId]) {
      const session = emptyArtifactSession(artifactId);
      artifactSessionsRef.current = { ...artifactSessionsRef.current, [tabId]: session };
      setArtifactSessions((current) => ({ ...current, [tabId]: session }));
      void loadArtifactRevision(artifactId, null, 'CURRENT');
    }
  }

  function refreshOpenArtifact(artifactId: string) {
    const tabId = artifactTabId(artifactId);
    const session = artifactSessionsRef.current[tabId];
    if (!session) return;
    if (session.mode === 'CURRENT') {
      void loadArtifactRevision(artifactId, null, 'CURRENT');
      return;
    }
    void Promise.all([
      window.fielora.artifact.read({ artifact_id: artifactId, revision_id: null }),
      window.fielora.artifact.history({ artifact_id: artifactId, before_sequence: null, limit: 50 }),
    ]).then(([currentRead, history]) => setArtifactSessions((current) => {
      const existing = current[tabId];
      return existing ? { ...current, [tabId]: refreshArtifactCurrent(existing, currentRead, history) } : current;
    })).catch(() => undefined);
  }

  async function setArtifactArchiveState(session: ArtifactSurfaceSession, archived: boolean) {
    if (!project || !conversation || !effectiveConversationProvider) return;
    setArtifactCommandBusy(true);
    try {
      await window.fielora.artifact.setArchiveState({
        field_id: project.field_id,
        conversation_id: conversation.id,
        provider_config_id: effectiveConversationProvider.id,
        model_id: effectiveConversationProvider.default_model,
        artifact_id: session.artifactId,
        archived,
      });
      await loadArtifactRevision(session.artifactId, session.mode === 'HISTORICAL' ? session.viewedRevisionId : null, session.mode);
      setArtifactRefreshToken((value) => value + 1);
    } catch (reason) {
      setError(reasonMessage(reason));
    } finally {
      setArtifactCommandBusy(false);
    }
  }

  function processArtifactToolReceipts(tools: AgentToolCallView[]) {
    for (const tool of tools) {
      if (tool.status !== 'COMPLETED'
        || handledArtifactToolCallsRef.current.has(tool.id)
        || !foregroundAgentRunsRef.current.has(tool.run_id)
        || !tool.receipt
        || typeof tool.receipt !== 'object') continue;
      const receipt = tool.receipt as Record<string, unknown>;
      if (receipt.kind !== 'ARTIFACT_REVISION_COMMITTED' || typeof receipt.artifact_id !== 'string') continue;
      handledArtifactToolCallsRef.current.add(tool.id);
      if (receipt.mutation_kind === 'CREATE') openArtifact(receipt.artifact_id);
      else if (receipt.mutation_kind === 'UPDATE') refreshOpenArtifact(receipt.artifact_id);
      setArtifactRefreshToken((value) => value + 1);
    }
  }

  useEffect(() => processArtifactToolReceipts(agentTools), [agentTools]);

  function ensureDockTab(tab: ProjectDockTab) {
    setDockTabs((current) => current.some((item) => item.id === tab.id) ? current : [...current, tab]);
    setActiveDockTabId(tab.id);
    setWorkspaceOpen(true);
    setWorkspaceWidth((current) => {
      const maximum = Math.max(360, layoutWidth() - navigationWidth - 420);
      const preferred = tab.kind === 'FILES' ? 400 : tab.kind === 'REVIEW' ? 520 : tab.kind === 'IMAGE' ? 580 : tab.kind === 'ARTIFACT' || tab.kind === 'ARTIFACTS' ? 760 : 600;
      return Math.min(Math.max(current, preferred), Math.min(900, maximum));
    });
  }

  function openDockTool(kind: 'FILES' | 'REVIEW' | 'BROWSER' | 'TERMINAL' | 'ARTIFACTS') {
    const definitions: Record<typeof kind, ProjectDockTab> = {
      FILES: { id: 'files', kind: 'FILES', label: '文件', icon: 'folder' },
      REVIEW: { id: 'review', kind: 'REVIEW', label: '审阅', icon: 'diff' },
      BROWSER: { id: 'browser', kind: 'BROWSER', label: '浏览器', icon: 'browse' },
      TERMINAL: { id: 'terminal', kind: 'TERMINAL', label: 'PowerShell', icon: 'terminal' },
      ARTIFACTS: { id: 'artifacts', kind: 'ARTIFACTS', label: '工作对象', icon: 'filePlus' },
    };
    if (kind === 'REVIEW') {
      setHistoricalReview(null);
      setAgentReviewPath('');
    }
    ensureDockTab(definitions[kind]);
  }

  function syncFileSession(tabId: string) {
    const session = fileDockSessions[tabId];
    if (!session) return;
    setSelectedFile(session.file);
    setFilePreview(session.preview);
    setEditorContent(session.content);
  }

  function activateDockTab(id: string) {
    setActiveDockTabId(id);
    const tab = dockTabs.find((item) => item.id === id);
    if (tab?.kind === 'FILE' || (tab?.kind === 'IMAGE' && tab.relativePath)) syncFileSession(id);
    if (tab?.kind === 'REVIEW') {
      setHistoricalReview(tab.reviewSelection ?? null);
      setAgentReviewPath(tab.relativePath ?? '');
    }
  }

  function closeDockTab(id: string) {
    const index = dockTabs.findIndex((item) => item.id === id);
    const next = dockTabs.filter((item) => item.id !== id);
    setDockTabs(next);
    if (id.startsWith('file:')) setFileDockSessions((current) => { const copy = { ...current }; delete copy[id]; return copy; });
    if (id.startsWith('artifact:')) {
      const nextSessions = { ...artifactSessionsRef.current };
      delete nextSessions[id];
      artifactSessionsRef.current = nextSessions;
      setArtifactSessions(nextSessions);
    }
    if (next.length === 0) {
      setActiveDockTabId('');
      setWorkspaceOpen(false);
      setDockFocused(false);
      return;
    }
    if (activeDockTabId !== id) return;
    const nextTab = next[Math.min(Math.max(index, 0), next.length - 1)]!;
    setActiveDockTabId(nextTab.id);
    if (nextTab.kind === 'FILE' || (nextTab.kind === 'IMAGE' && nextTab.relativePath)) syncFileSession(nextTab.id);
    if (nextTab.kind === 'REVIEW') {
      setHistoricalReview(nextTab.reviewSelection ?? null);
      setAgentReviewPath(nextTab.relativePath ?? '');
    }
  }

  function openAttachmentInDock(attachment: WorkspaceAttachmentView) {
    ensureDockTab({ id: `image:${attachment.id}`, kind: 'IMAGE', label: attachment.name, icon: 'image', attachment });
  }

  async function openFile(entry: WorkspaceFileEntry) {
    if (!project) return;
    setFileTreeSelection(entry.relative_path);
    const tabId = `file:${entry.relative_path}`;
    const existing = fileDockSessions[tabId];
    if (existing) {
      syncFileSession(tabId);
      ensureDockTab({ id: tabId, kind: existing.preview?.kind === 'IMAGE' ? 'IMAGE' : 'FILE', label: fileTabLabel(entry.relative_path), icon: existing.preview?.kind === 'IMAGE' ? 'image' : 'files', relativePath: entry.relative_path });
      return;
    }
    try {
      const kind = workspacePreviewKind(entry.relative_path);
      if (kind === 'IMAGE') {
        const preview = await window.fielora.workspace.previewFile({ field_id: project.field_id, relative_path: entry.relative_path });
        const session: FileDockSession = { file: null, preview: { kind: 'IMAGE', preview }, content: '' };
        setFileDockSessions((current) => ({ ...current, [tabId]: session }));
        setSelectedFile(null); setFilePreview(session.preview); setEditorContent(''); setDraft(null); setError('');
        ensureDockTab({ id: tabId, kind: 'IMAGE', label: fileTabLabel(entry.relative_path), icon: 'image', relativePath: entry.relative_path });
        return;
      }
      if (kind === 'UNSUPPORTED') {
        const preview: FilePreviewState = { kind: 'UNSUPPORTED', relativePath: entry.relative_path, message: friendlyFilePreviewFailure('unsupported') };
        setFileDockSessions((current) => ({ ...current, [tabId]: { file: null, preview, content: '' } }));
        setSelectedFile(null); setFilePreview(preview); setEditorContent(''); setDraft(null); setError('');
        ensureDockTab({ id: tabId, kind: 'FILE', label: fileTabLabel(entry.relative_path), icon: 'files', relativePath: entry.relative_path });
        return;
      }
      const file = await window.fielora.workspace.readFile({ field_id: project.field_id, relative_path: entry.relative_path });
      setFileDockSessions((current) => ({ ...current, [tabId]: { file, preview: null, content: file.content, markdownMode: isMarkdownFile(file.relative_path) ? 'PREVIEW' : undefined } }));
      setSelectedFile(file); setFilePreview(null); setEditorContent(file.content); setDraft(null); setError('');
      ensureDockTab({ id: tabId, kind: 'FILE', label: fileTabLabel(entry.relative_path), icon: 'files', relativePath: entry.relative_path });
    } catch (reason) {
      const preview: FilePreviewState = { kind: 'UNSUPPORTED', relativePath: entry.relative_path, message: friendlyFilePreviewFailure(reason) };
      setFileDockSessions((current) => ({ ...current, [tabId]: { file: null, preview, content: '' } }));
      setSelectedFile(null); setFilePreview(preview); setEditorContent(''); setDraft(null); setError('');
      ensureDockTab({ id: tabId, kind: 'FILE', label: fileTabLabel(entry.relative_path), icon: 'files', relativePath: entry.relative_path });
    }
  }

  function reviewEditor() {
    if (!selectedFile || editorContent === selectedFile.content) return;
    setDraft({ relativePath: selectedFile.relative_path, before: selectedFile.content, after: editorContent, beforeHash: selectedFile.sha256, diff: reviewDiff(selectedFile.relative_path, selectedFile.content, editorContent) });
    openDockTool('REVIEW');
  }

  async function acceptDraft() {
    if (!project || !draft) return;
    try {
      const applied = await window.fielora.workspace.applyFile({ field_id: project.field_id, relative_path: draft.relativePath, expected_sha256: draft.beforeHash, content: draft.after });
      setUndoChange({ relativePath: draft.relativePath, content: draft.before, expectedHash: applied.sha256 });
      const tabId = `file:${applied.relative_path}`;
      setFileDockSessions((current) => ({ ...current, [tabId]: { file: applied, preview: null, content: applied.content, markdownMode: isMarkdownFile(applied.relative_path) ? (current[tabId]?.markdownMode ?? 'PREVIEW') : undefined } }));
      setSelectedFile(applied); setEditorContent(applied.content); setDraft(null);
      ensureDockTab({ id: tabId, kind: 'FILE', label: fileTabLabel(applied.relative_path), icon: 'files', relativePath: applied.relative_path });
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function undoAcceptedChange() {
    if (!project || !undoChange) return;
    try {
      const restored = await window.fielora.workspace.applyFile({ field_id: project.field_id, relative_path: undoChange.relativePath, expected_sha256: undoChange.expectedHash, content: undoChange.content });
      const tabId = `file:${restored.relative_path}`;
      setFileDockSessions((current) => ({ ...current, [tabId]: { file: restored, preview: null, content: restored.content, markdownMode: isMarkdownFile(restored.relative_path) ? (current[tabId]?.markdownMode ?? 'PREVIEW') : undefined } }));
      setSelectedFile(restored); setEditorContent(restored.content); setUndoChange(null);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function runTerminal(command = terminalCommand, presentation: 'RIGHT' | 'BOTTOM' = 'RIGHT') {
    const nextCommand = command.trim();
    if (!project || terminalRef.current || !nextCommand) return;
    const workingDirectory = terminalWorkingDirectory || project.root_path;
    setTerminalOutput('');
    setTerminalLastCommand(nextCommand);
    setTerminalCommand('');
    if (presentation === 'RIGHT') openDockTool('TERMINAL');
    else setBottomTerminalOpen(true);
    try {
      const started = await window.fielora.workspace.runTerminal({ field_id: project.field_id, command: nextCommand, working_directory: workingDirectory });
      if (started.working_directory) {
        setTerminalWorkingDirectory(started.working_directory);
        return;
      }
      terminalRef.current = { runId: started.run_id, command: nextCommand, output: '' };
      setTerminalRunId(started.run_id);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  function openWorkspace(tab: 'FILES' | 'DIFF' | 'TERMINAL' | 'BROWSER') {
    if (!project) { setError(`请先打开一个 Project，再使用${tab === 'TERMINAL' ? '终端' : '工作区工具'}。`); return; }
    openDockTool(tab === 'DIFF' ? 'REVIEW' : tab);
  }

  async function openAgentReviewFile(relativePath: string) {
    const entry = files.find((file) => file.relative_path === relativePath) ?? { relative_path: relativePath, size: 0 };
    await openFile(entry);
  }

  function openAgentReview(relativePath = '') {
    setHistoricalReview(null);
    setAgentReviewPath(relativePath);
    if (!project) { setError('请先打开一个 Project，再使用工作区工具。'); return; }
    const runId = agentRun?.id ?? conversation?.id ?? 'current';
    ensureDockTab({
      id: `review:${runId}:${relativePath || 'summary'}`,
      kind: 'REVIEW',
      label: relativePath ? `${fileTabLabel(relativePath)} Diff` : '变更 Diff',
      icon: 'diff',
      relativePath: relativePath || undefined,
    });
  }

  function openHistoricalAgentReview(selection: HistoricalReviewSelection) {
    setHistoricalReview(selection);
    setAgentReviewPath(selection.path);
    if (!project) { setError('请先打开一个 Project，再使用工作区工具。'); return; }
    ensureDockTab({
      id: `review:${selection.runId || 'historical'}:${selection.path || 'summary'}`,
      kind: 'REVIEW',
      label: selection.path ? `${fileTabLabel(selection.path)} Diff` : '变更 Diff',
      icon: 'diff',
      relativePath: selection.path || undefined,
      reviewSelection: selection,
    });
  }

  function runEnvironmentCommand(command: string) {
    setEnvironmentOpen(false);
    setTerminalCommand(command);
    openDockTool('TERMINAL');
    void runTerminal(command);
  }

  async function toggleProjectLauncher() {
    const next = !projectLauncherOpen;
    setEnvironmentOpen(false);
    setDockProjectLauncherOpen(false);
    setProjectLauncherOpen(next);
    if (!next || !project) return;
    try { setProjectOpenTargets(await window.fielora.workspace.getOpenTargets({ field_id: project.field_id })); }
    catch (reason) { setError(reasonMessage(reason)); }
  }

  async function toggleDockProjectLauncher() {
    const next = !dockProjectLauncherOpen;
    setEnvironmentOpen(false);
    setProjectLauncherOpen(false);
    setDockProjectLauncherOpen(next);
    if (!next || !project) return;
    try { setProjectOpenTargets(await window.fielora.workspace.getOpenTargets({ field_id: project.field_id })); }
    catch (reason) { setError(reasonMessage(reason)); }
  }

  async function openProjectTarget(target: WorkspaceProjectOpenTarget) {
    if (!project) return;
    setProjectLauncherOpen(false);
    setDockProjectLauncherOpen(false);
    try { await window.fielora.workspace.openProject({ field_id: project.field_id, target }); }
    catch (reason) { setError(reasonMessage(reason)); }
  }

  function updateDockFileTreeWidth(width: number) {
    const next = Math.min(Math.max(width, 190), 420);
    setDockFileTreeWidth(next);
    window.localStorage.setItem('fielora:dock-file-tree-width', String(next));
  }

  function reviewDockFileSession(tab: ProjectDockTab, session: FileDockSession) {
    if (!session.file) return;
    setSelectedFile(session.file);
    setEditorContent(session.content);
    setDraft({
      relativePath: session.file.relative_path,
      before: session.file.content,
      after: session.content,
      beforeHash: session.file.sha256,
      diff: reviewDiff(session.file.relative_path, session.file.content, session.content),
    });
    setActiveDockTabId(tab.id);
    openDockTool('REVIEW');
  }

  function prepareVersionControl() {
    setEnvironmentOpen(false);
    const routing = permission === 'FULL_CONTROL'
      ? '当前为完全访问权限，按既定范围自动完成这些 Git 操作。'
      : 'Git 写操作按当前权限设置请求我批准。';
    setPrompt(`请检查当前 Git 变更，运行最相关的测试，并用 git_read 审阅 diff。测试通过后，只暂存与本任务相关的文件，创建一个简洁准确的提交；如果当前分支已有上游，再推送。${routing}`);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function scrollToLatestAnswer() {
    const list = messageListRef.current;
    if (!list) return;
    atLatestAnswerRef.current = true;
    setAtLatestAnswer(true);
    setHasUnseenActivity(false);
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }

  const environmentSources = [...attachments, ...messages.flatMap((message) => messageAttachments(message.id))]
    .filter((source, index, all) => all.findIndex((candidate) => candidate.id === source.id) === index)
    .slice(-3)
    .reverse();
  const fileExplorerIconDataUrl = projectOpenTargets.find((target) => target.target === 'FILE_EXPLORER')?.icon_data_url ?? null;
  const environmentControl = project && projectActionsLayer ? createPortal(<>
    <div className="project-launcher" ref={projectLauncherRef}>
      <button type="button" className="project-launcher-main" aria-label="在文件资源管理器中打开 Project" title="打开 Project" onClick={() => void openProjectTarget('FILE_EXPLORER')} data-testid="project-open-default"><WorkspaceAppBadge target="FILE_EXPLORER" iconDataUrl={fileExplorerIconDataUrl}/></button>
      <button type="button" className={`project-launcher-more ${projectLauncherOpen ? 'active' : ''}`} aria-label="选择打开方式" title="选择打开方式" aria-expanded={projectLauncherOpen} onClick={() => void toggleProjectLauncher()} data-testid="project-open-menu-toggle"><ShellIcon name="chevronDown"/></button>
      {projectLauncherOpen && <div className="project-launcher-popover" role="menu" data-testid="project-open-menu">
        {projectOpenTargets.map((target) => <button key={target.target} type="button" role="menuitem" onClick={() => void openProjectTarget(target.target)}><WorkspaceAppBadge target={target.target} iconDataUrl={target.icon_data_url}/><span>{target.label}</span></button>)}
        <div className="project-launcher-divider"/>
        <button type="button" role="menuitem" onClick={() => { setProjectLauncherOpen(false); openDockTool('FILES'); }}><span className="workspace-app-badge target-fielora"><ShellIcon name="files"/></span><span>Fielora 文件</span></button>
        <button type="button" role="menuitem" onClick={() => { setProjectLauncherOpen(false); openDockTool('TERMINAL'); }}><span className="workspace-app-badge target-fielora"><ShellIcon name="terminal"/></span><span>Fielora 终端</span></button>
      </div>}
    </div>
    <div className="environment-menu" ref={environmentMenuRef}>
      <ToolbarAction label="切换摘要" icon={<ShellIcon name="environment"/>} active={environmentOpen} onClick={() => { const next = !environmentOpen; setProjectLauncherOpen(false); setDockProjectLauncherOpen(false); setEnvironmentOpen(next); if (next) void window.fielora.workspace.getEnvironment({ field_id: project.field_id }).then(setEnvironment).catch((reason) => setError(reasonMessage(reason))); }} aria-expanded={environmentOpen} testId="environment-menu-toggle" />
      {environmentOpen && <div className="environment-popover" data-testid="environment-popover">
        <header><span>环境信息</span><button type="button" aria-label="添加来源" title="添加来源" onClick={() => void pickAttachments()}><ShellIcon name="plus"/></button></header>
        <button onClick={() => { setEnvironmentOpen(false); openWorkspace('DIFF'); }}><ShellIcon name="diff"/><span><strong>变更</strong><small className="environment-diff-stat"><em>+{displayedAgentReview.additions}</em><del>−{displayedAgentReview.deletions}</del></small></span></button>
        <button onClick={() => runEnvironmentCommand('git status --short')}><ShellIcon name="computer"/><span><strong>本地</strong><small>{environment?.changed_files ?? 0} 个文件</small></span><ShellIcon name="chevronDown"/></button>
        <button onClick={() => runEnvironmentCommand('git branch --show-current')} disabled={!environment?.is_git_repository}><ShellIcon name="branch"/><span><strong>{environment?.branch || (environment?.is_git_repository ? '默认分支尚未建立' : '不是 Git 仓库')}</strong><small>{environment?.upstream || '没有上游分支'}</small></span><ShellIcon name="chevronDown"/></button>
        <button onClick={prepareVersionControl} disabled={!environment?.is_git_repository}><ShellIcon name="cloud"/><span><strong>提交或推送</strong><small>{environment?.ahead ? `领先 ${environment.ahead} · 先测试和审阅` : '测试通过后进入变更审阅'}</small></span></button>
        <button className="environment-muted-action" disabled><ShellIcon name="source"/><span><strong>拉取请求状态</strong><small>当前 Project 未连接托管服务</small></span></button>
        <button onClick={() => runEnvironmentCommand('git diff --stat HEAD')} disabled={!environment?.is_git_repository}><ShellIcon name="branch"/><span><strong>比较分支</strong><small>{environment?.behind ? `落后 ${environment.behind}` : '与 HEAD 比较'}</small></span></button>
        <div className="environment-sources"><header><span>来源</span><button type="button" aria-label="添加来源" onClick={() => void pickAttachments()}><ShellIcon name="plus"/></button></header>{environmentSources.map((source) => <button key={source.id} onClick={() => { setEnvironmentOpen(false); openAttachmentInDock(source); }}><span className="environment-source-thumb">{source.data_url ? <img src={source.data_url} alt=""/> : <ShellIcon name={source.kind === 'IMAGE' ? 'image' : 'source'}/>}</span><span>{source.name}</span></button>)}{environmentSources.length === 0 && selectedFile ? <button onClick={() => { setEnvironmentOpen(false); openWorkspace('FILES'); }}><ShellIcon name="source"/><span>{selectedFile.relative_path}</span></button> : environmentSources.length === 0 ? <small>当前对话还没有来源。</small> : null}</div>
      </div>}
    </div>
  </>, projectActionsLayer) : null;

  const currentTerminalMessage = agentTurn?.assistantMessageId
    ? messages.find((message) => message.id === agentTurn.assistantMessageId) ?? null
    : null;
  const activeDockTab = dockTabs.find((tab) => tab.id === activeDockTabId) ?? dockTabs.at(-1) ?? null;
  const activeFileSession = activeDockTab ? fileDockSessions[activeDockTab.id] ?? null : null;
  const activeReview = activeDockTab?.reviewSelection?.review ?? displayedAgentReview;
  const agentReviewOpen = Boolean(project && workspaceOpen && activeDockTab?.kind === 'REVIEW' && !draft && activeReview.files.length > 0);
  const dockBreadcrumb = project
    ? [project.title, ...(activeDockTab?.relativePath?.replaceAll('\\', '/').split('/').filter(Boolean) ?? [])]
    : [];
  const dockToolbar = activeDockTab && activeDockTab.kind !== 'TERMINAL' && project ? <>
    <div className="right-dock-breadcrumb" title={dockBreadcrumb.join(' / ')}>
      {dockBreadcrumb.map((segment, index) => <Fragment key={`${segment}:${index}`}>{index > 0 && <i>/</i>}<span>{segment}</span></Fragment>)}
    </div>
    {(activeDockTab.kind === 'FILE' || activeDockTab.kind === 'IMAGE') && <div className="right-dock-resource-actions">
      {activeDockTab.kind === 'FILE' && activeFileSession?.file && isMarkdownFile(activeFileSession.file.relative_path) && <div className="markdown-view-toggle" role="tablist" aria-label="Markdown 显示方式" data-testid="markdown-view-toggle">
        <button type="button" role="tab" aria-selected={(activeFileSession.markdownMode ?? 'PREVIEW') === 'PREVIEW'} onClick={() => setFileDockSessions((current) => ({ ...current, [activeDockTab.id]: { ...activeFileSession, markdownMode: 'PREVIEW' } }))} data-testid="markdown-preview-toggle">预览</button>
        <button type="button" role="tab" aria-selected={activeFileSession.markdownMode === 'SOURCE'} onClick={() => setFileDockSessions((current) => ({ ...current, [activeDockTab.id]: { ...activeFileSession, markdownMode: 'SOURCE' } }))} data-testid="markdown-source-toggle">源代码</button>
      </div>}
      {activeDockTab.kind === 'FILE' && activeFileSession?.file && activeFileSession.content !== activeFileSession.file.content && <button type="button" className="right-dock-review-change" onClick={() => reviewDockFileSession(activeDockTab, activeFileSession)} data-testid="review-change">审阅修改</button>}
      <div className="dock-project-launcher" ref={dockProjectLauncherRef}>
        <button type="button" className="dock-project-launcher-main" onClick={() => void openProjectTarget('FILE_EXPLORER')} aria-label="在文件资源管理器中打开 Project" title="打开 Project" data-testid="dock-project-open-default"><WorkspaceAppBadge target="FILE_EXPLORER" iconDataUrl={fileExplorerIconDataUrl}/><span>打开</span></button>
        <button type="button" className={`dock-project-launcher-more ${dockProjectLauncherOpen ? 'active' : ''}`} onClick={() => void toggleDockProjectLauncher()} aria-label="选择打开方式" title="选择打开方式" aria-expanded={dockProjectLauncherOpen} data-testid="dock-project-open-menu-toggle"><ShellIcon name="chevronDown"/></button>
        {dockProjectLauncherOpen && <div className="project-launcher-popover dock-project-launcher-popover" role="menu" data-testid="dock-project-open-menu">
          {projectOpenTargets.map((target) => <button key={target.target} type="button" role="menuitem" onClick={() => void openProjectTarget(target.target)}><WorkspaceAppBadge target={target.target} iconDataUrl={target.icon_data_url}/><span>{target.label}</span></button>)}
          <div className="project-launcher-divider"/>
          <button type="button" role="menuitem" onClick={() => { setDockProjectLauncherOpen(false); openDockTool('FILES'); }}><span className="workspace-app-badge target-fielora"><ShellIcon name="files"/></span><span>Fielora 文件</span></button>
          <button type="button" role="menuitem" onClick={() => { setDockProjectLauncherOpen(false); openDockTool('TERMINAL'); }}><span className="workspace-app-badge target-fielora"><ShellIcon name="terminal"/></span><span>Fielora 终端</span></button>
        </div>}
      </div>
      <button type="button" onClick={() => setDockFileTreeCollapsed((current) => !current)} aria-label={dockFileTreeCollapsed ? '展开文件菜单' : '收起文件菜单'} title={dockFileTreeCollapsed ? '展开文件菜单' : '收起文件菜单'} aria-expanded={!dockFileTreeCollapsed} data-testid="dock-file-tree-toggle"><ShellIcon name="panelRight"/></button>
    </div>}
  </> : null;
  const dockViews = project ? dockTabs.map((tab) => {
    const session = fileDockSessions[tab.id] ?? null;
    const artifactSession = artifactSessions[tab.id] ?? null;
    const imageAttachment = tab.attachment ?? (session?.preview?.kind === 'IMAGE' ? workspaceImageAttachment(session.preview.preview) : null);
    const dockFileTree = <WorkspaceFileTree files={files} filter={fileFilter} activePath={fileTreeSelection} onFilter={setFileFilter} onRefresh={() => void window.fielora.workspace.listFiles({ field_id: project.field_id }).then(setFiles).catch((reason) => setError(reasonMessage(reason)))} onOpen={(file) => void openFile(file)}/>;
    return <section key={tab.id} className={`right-dock-view right-dock-view-${tab.kind.toLowerCase()}`} hidden={tab.id !== activeDockTabId} data-dock-kind={tab.kind} data-testid={`right-dock-view-${tab.id}`}>
      {tab.kind === 'FILES' && dockFileTree}
      {tab.kind === 'FILE' && <DockResourceLayout fileTree={dockFileTree} treeWidth={dockFileTreeWidth} treeCollapsed={dockFileTreeCollapsed} onTreeWidthChange={updateDockFileTreeWidth}>
        <>
          {session?.file && <div className={`file-editor dock-file-editor ${undoChange?.relativePath === session.file.relative_path ? 'has-undo' : ''}`}>{undoChange?.relativePath === session.file.relative_path && <header><span/><button onClick={() => void undoAcceptedChange()} data-testid="undo-change">撤销已接受变更</button></header>}{isMarkdownFile(session.file.relative_path) && (session.markdownMode ?? 'PREVIEW') === 'PREVIEW'
            ? <div className="dock-markdown-preview" data-testid="markdown-preview"><MarkdownMessage content={session.content} onCopyError={(reason) => setError(`复制代码失败：${reason}`)}/></div>
            : <SyntaxCodeEditor value={session.content} relativePath={session.file.relative_path} onChange={(content) => { setFileDockSessions((current) => ({ ...current, [tab.id]: { ...session, content } })); if (tab.id === activeDockTabId) setEditorContent(content); }}/>}</div>}
          {session?.preview?.kind === 'UNSUPPORTED' && <div className="file-unsupported-preview" data-testid="file-unsupported-preview"><ShellIcon name="files"/><h3>无法在此预览</h3><strong>{session.preview.relativePath}</strong><p>{session.preview.message}</p></div>}
        </>
      </DockResourceLayout>}
      {tab.kind === 'IMAGE' && imageAttachment && <DockResourceLayout fileTree={dockFileTree} treeWidth={dockFileTreeWidth} treeCollapsed={dockFileTreeCollapsed} onTreeWidthChange={updateDockFileTreeWidth}><div className="dock-image-preview" data-testid="file-image-preview"><button type="button" aria-label={`放大 ${imageAttachment.name}`} onClick={() => setPreviewAttachment(imageAttachment)} onContextMenu={(event) => openImageContextMenu(event, imageAttachment)}><img src={imageAttachment.data_url ?? ''} alt={imageAttachment.name}/></button><small>{imageAttachment.mime_type} · {Math.max(1, Math.ceil(imageAttachment.size / 1024))} KB · 点击放大</small></div></DockResourceLayout>}
      {tab.kind === 'REVIEW' && <div className="diff-workspace">{draft ? <><header><div><p className="eyebrow">REVIEW</p><h3>{draft.relativePath}</h3></div><span>写入前不会修改磁盘</span></header><pre className="diff-view" data-testid="diff-view">{draft.diff}</pre><footer><button className="secondary-button" onClick={() => { setDraft(null); setEditorContent(selectedFile?.content ?? ''); if (selectedFile) ensureDockTab({ id: `file:${selectedFile.relative_path}`, kind: 'FILE', label: fileTabLabel(selectedFile.relative_path), icon: 'files', relativePath: selectedFile.relative_path }); else openDockTool('FILES'); }}>放弃</button><button className="primary-button" onClick={() => void acceptDraft()} data-testid="accept-change">接受变更</button></footer></> : (tab.reviewSelection?.review ?? displayedAgentReview).files.length > 0 ? <AgentHumanReview review={tab.reviewSelection?.review ?? displayedAgentReview} task={tab.reviewSelection?.task ?? agentRun?.task ?? conversation?.title ?? ''} runId={tab.reviewSelection?.runId ?? agentRun?.id ?? ''} selectedPathHint={tab.relativePath ?? agentReviewPath} onOpenFile={(path) => void openAgentReviewFile(path)}/> : <div className="workspace-blank"><h3>{conversation ? '本次任务没有文件变更' : '当前 Project 没有可审阅的变更'}</h3><p>文件写入、补丁和替换会显示在这里。</p></div>}</div>}
      {tab.kind === 'BROWSER' && <BrowsePanel browser={window.fielora.browser} onSaveToLibrary={(input) => window.fielora.library.saveWeb(input)} onOpenBrowserSettings={() => window.dispatchEvent(new CustomEvent('fielora:open-settings', { detail: 'BROWSER' }))}/>}
      {tab.kind === 'TERMINAL' && <div className="right-terminal-view" data-testid="terminal-dock"><TerminalSession workingDirectory={terminalWorkingDirectory || project.root_path} command={terminalCommand} lastCommand={terminalLastCommand} output={terminalOutput} running={Boolean(terminalRunId)} active={workspaceOpen && tab.id === activeDockTabId} onCommandChange={setTerminalCommand} onRun={() => void runTerminal(terminalCommand, 'RIGHT')} onCancel={() => terminalRunId ? void window.fielora.workspace.cancelTerminal({ run_id: terminalRunId }) : undefined} testId="terminal"/></div>}
      {tab.kind === 'ARTIFACTS' && <ArtifactCatalog refreshToken={artifactRefreshToken} onOpen={openArtifact}/>}
      {tab.kind === 'ARTIFACT' && artifactSession && <ArtifactSurface
        session={artifactSession}
        busy={artifactCommandBusy}
        onSelectRevision={(revisionId) => void loadArtifactRevision(artifactSession.artifactId, revisionId, 'HISTORICAL')}
        onReturnCurrent={() => void loadArtifactRevision(artifactSession.artifactId, null, 'CURRENT')}
        onArchiveState={(archived) => void setArtifactArchiveState(artifactSession, archived)}
        onSelectedSlide={(selectedSlide) => { const next = { ...artifactSession, selectedSlide }; artifactSessionsRef.current = { ...artifactSessionsRef.current, [tab.id]: next }; setArtifactSessions((current) => ({ ...current, [tab.id]: next })); }}
        onSelectedSheet={(selectedSheetId) => { const next = { ...artifactSession, selectedSheetId }; artifactSessionsRef.current = { ...artifactSessionsRef.current, [tab.id]: next }; setArtifactSessions((current) => ({ ...current, [tab.id]: next })); }}
      />}
    </section>;
  }) : null;
  const currentAgentTurn = agentRun && agentTurn?.userMessageId ? <AgentTurn
    run={agentRun}
    userMessageId={agentTurn.userMessageId}
    terminalMessage={currentTerminalMessage}
    events={agentEvents}
    tools={agentTools}
    approval={approval}
    approvalSummary={approvalToolSummary}
    review={agentReview}
    streamingContent={streamingOutput}
    busy={busy}
    copied={Boolean(currentTerminalMessage && copiedMessageId === currentTerminalMessage.id)}
    onResume={() => void resumeAgent()}
    onRetry={() => void retryAgent()}
    onReview={() => openAgentReview()}
    onReviewFile={(path) => openAgentReview(path)}
    onDecision={(decision) => void decideApproval(decision)}
    onCopy={currentTerminalMessage ? () => void copyMessage(currentTerminalMessage) : undefined}
    onCopyError={(reason) => setError(`复制代码失败：${reason}`)}
    mcpRuntime={mcpRuntime}
    mcpBusyConnectionId={mcpBusyConnectionId}
    onActivateMcp={(connectionId) => void activateMcpConnection(connectionId)}
  /> : null;
  const visibleMessages = messages.filter((message) => message.role !== 'ASSISTANT' || !isLegacyTerminalMessage(message.content));

  return <div className="project-root" data-testid="project-workspace">
    <WorkspaceSurface
      surfaceRef={layoutRef}
      className={`project-layout ${workspaceOpen && project ? 'workspace-open' : ''}${agentReviewOpen ? ' agent-review-open' : ''}${dockFocused ? ' dock-focused' : ''}`}
      testId="project-workspace-surface"
      navigationWidth={navigationWidth}
      onNavigationWidthChange={updateNavigationWidth}
      navigationResizerTestId="project-navigation-resizer"
      navigationResizerClassName="project-navigation-resizer"
      style={{ '--project-workspace-width': `${workspaceWidth}px` } as CSSProperties}
      navigation={<PrimaryNav
        active="PROJECTS"
        onProjects={() => setNewConversationStart(false)}
        onNow={onNow}
        onBrowse={onBrowse}
        onFields={onFields}
        onNewConversation={() => void createConversation()}
        onSettings={onSettings}
        onAddProject={() => void addProject()}
        projectHeaderControls={<>
          <ProjectSortControl value={projectSort} onChange={updateProjectSort}/>
          <button type="button" onClick={() => void addProject()} title="添加本地 Project" aria-label="添加本地 Project" data-testid="project-add"><ShellIcon name="plus"/></button>
        </>}
        projectContent={<>
          <div className="project-list">{projects.length === 0 ? <p className="project-list-empty" data-testid="project-list-empty">还没有项目</p> : sortedProjects.map((item) => <Fragment key={item.field_id}>
            <div className={`project-item-row ${item.field_id === projectId ? 'active' : ''}`} onContextMenu={(event) => { event.preventDefault(); setProjectContextMenu({ project: item, left: Math.max(8, Math.min(window.innerWidth - 184, event.clientX)), top: Math.max(8, Math.min(window.innerHeight - 116, event.clientY)) }); }} data-testid={`project-row-${item.field_id}`}>
              <button className="project-item" title={item.root_path} onClick={() => { setNewConversationStart(false); if (item.field_id === projectId) { setCollapsedProjectIds((current) => { const next = new Set(current); if (next.has(item.field_id)) next.delete(item.field_id); else next.add(item.field_id); return next; }); return; } setProjectId(item.field_id); setCollapsedProjectIds((current) => { if (!current.has(item.field_id)) return current; const next = new Set(current); next.delete(item.field_id); return next; }); }} onKeyDown={(event) => { if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setProjectContextMenu({ project: item, left: Math.max(8, Math.min(window.innerWidth - 184, bounds.left + 28)), top: Math.max(8, Math.min(window.innerHeight - 116, bounds.bottom)) }); }} aria-haspopup="menu" aria-expanded={item.field_id === projectId && !collapsedProjectIds.has(item.field_id)} data-testid={`project-${item.field_id}`}><span className="project-expand-indicator"><ShellIcon name="chevronDown"/></span><ShellIcon name={item.field_id === projectId ? 'folderOpen' : 'folder'}/><div><strong>{item.title}</strong></div></button>
              <div className="project-item-actions">
                {!item.root_path && <button type="button" aria-label={`定位 ${item.title}`} title="原位置不可用，定位 Project" onClick={() => void rebindProject(item)} data-testid={`project-rebind-${item.field_id}`}><ShellIcon name="folderOpen"/></button>}
                <button type="button" aria-label={`在 ${item.title} 新建对话`} title="新建对话" onClick={() => void createConversationFor(item)} data-testid={`project-new-conversation-${item.field_id}`}><ShellIcon name="plus"/></button>
                <button type="button" aria-label={`编辑 ${item.title}`} title="编辑项目" onClick={() => setProjectDialog({ project: item, value: item.title })} data-testid={`project-edit-${item.field_id}`}><ShellIcon name="edit"/></button>
              </div>
            </div>
            {item.field_id === projectId && !collapsedProjectIds.has(item.field_id) && <div className="conversation-section" data-testid={`project-conversations-${item.field_id}`}>{conversations.length === 0 ? <p className="conversation-placeholder">还没有对话</p> : conversations.map((conversationItem) => <button key={conversationItem.id} className={`conversation-item ${conversationItem.id === conversationId ? 'active' : ''}`} onClick={() => activateConversation(conversationItem.id)} onContextMenu={(event) => { event.preventDefault(); activateConversation(conversationItem.id); setConversationContextMenu({ conversationId: conversationItem.id, title: conversationItem.title, left: Math.max(8, Math.min(window.innerWidth - 150, event.clientX)), top: Math.max(8, Math.min(window.innerHeight - 94, event.clientY)) }); }} onKeyDown={(event) => { if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); activateConversation(conversationItem.id); setConversationContextMenu({ conversationId: conversationItem.id, title: conversationItem.title, left: Math.max(8, Math.min(window.innerWidth - 150, bounds.left + 28)), top: Math.max(8, Math.min(window.innerHeight - 94, bounds.bottom)) }); }} aria-haspopup="menu" data-testid={`conversation-${conversationItem.id}`}><span>{conversationItem.title}</span><small>{new Date(conversationItem.updated_at).toLocaleDateString()}</small></button>)}</div>}
          </Fragment>)}</div>
        </>}
      />}
    >

      <section className="conversation-column">
        {!project ? newConversationStart ? <div className="new-conversation-start" data-testid="new-conversation-start"><div><p className="eyebrow">新对话</p><h2>开始一条新对话</h2><p>先选择一个本地文件夹建立 Project，然后即可创建第一条对话。Project 与对话各自独立，不会修改文件夹内容。</p><button className="secondary-button" onClick={() => void addProject()} data-testid="new-conversation-choose-project"><ShellIcon name="folder"/>选择 Project 文件夹</button></div></div> : <div className="project-overview" data-testid="project-overview"><header><div><p className="eyebrow">PROJECTS</p><h1>项目</h1><p>本地文件夹、持久对话、文件变更和运行结果。</p></div><button className="secondary-button" onClick={() => void addProject()}><ShellIcon name="folder"/>打开文件夹</button></header><div className="project-overview-empty"><h2>还没有项目</h2><p>使用左侧“项目”旁的 ＋ 或上方“打开文件夹”添加第一个本地 Project。</p></div></div> : !conversation ? <div className="project-empty-conversation" data-testid="project-empty-conversation">
          <div className="project-empty-copy"><h2>{project.title}</h2><p>开始新的工作</p></div>
          <form className="project-empty-composer" onSubmit={(event) => { event.preventDefault(); void createConversationFor(project); }} data-testid="project-empty-composer">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你想完成的任务…" aria-label="新对话内容"/>
            <div><span>对话会保存在当前 Project</span><button type="submit" disabled={conversationCreatingFor === project.field_id} data-testid="empty-conversation-create">{conversationCreatingFor === project.field_id ? '正在创建…' : '新建对话'}</button></div>
          </form>
        </div> : <>
          <header className="conversation-header conversation-context-header"><div className="conversation-heading"><div><div className="conversation-title-line"><h2 title={conversation.title}>{conversation.title}</h2><ConversationActionsMenu onRename={() => setConversationDialog({ kind: 'RENAME', value: conversation.title })} onDelete={() => setConversationDialog({ kind: 'DELETE' })}/></div><small title={project.root_path}><span>{project.title}</span><i>/</i><span>Fielora</span></small></div></div></header>
          <div className="message-list" ref={messageListRef}>
            {visibleMessages.length === 0 && !streamingOutput ? <div className="conversation-empty"><h3>这条对话还没有消息</h3><p>描述一个任务，Agent 会读取项目、使用工具、修改文件并运行验证。</p></div> : visibleMessages.map((message, index) => {
              const isCurrentAgentAssistant = Boolean(agentRun && agentTurn?.assistantMessageId === message.id);
              if (message.role === 'ASSISTANT' && message.invocation_id) {
                if (isCurrentAgentAssistant) return null;
                const historicalUserMessage = [...visibleMessages.slice(0, index)].reverse().find((item) => item.role === 'USER') ?? null;
                return <HistoricalAgentTurn key={message.id} terminalMessage={message} requestText={historicalUserMessage?.content ?? ''} userMessageId={historicalUserMessage?.id ?? null} copied={copiedMessageId === message.id} onReview={openHistoricalAgentReview} onCopy={() => void copyMessage(message)} onCopyError={(reason) => setError(`复制代码失败：${reason}`)}/>;
              }
              const persistedImages = message.role === 'USER' ? messageAttachments(message.id) : [];
              const queuedFollowUp = message.role === 'USER' ? queuedFollowUps.find((item) => item.messageId === message.id) ?? null : null;
              return <Fragment key={message.id}>
                <article data-message-id={message.id} className={`message ${message.role.toLowerCase()}${persistedImages.length ? ' has-image-attachments' : ''}`} data-testid={`message-${message.role.toLowerCase()}`}>{persistedImages.length > 0 && <ConversationImageGallery attachments={persistedImages} onOpen={openAttachmentInDock} onContextMenu={openImageContextMenu}/>}<div className="message-content"><MarkdownMessage content={message.content} onCopyError={(reason) => setError(`复制代码失败：${reason}`)}/></div>{queuedFollowUp && <p className="queued-follow-up-status" data-testid="queued-follow-up-status" data-after-run-id={queuedFollowUp.afterRunId}><span aria-hidden="true"/>将在当前任务完成后继续处理</p>}<footer className={`message-actions ${copiedMessageId === message.id ? 'copy-confirmed' : ''}`}><time dateTime={new Date(message.created_at).toISOString()} title={new Date(message.created_at).toLocaleString('zh-CN')}>{messageTimeLabel(message.created_at)}</time>{message.status !== 'COMPLETED' && <span className="message-status">{messageStatusLabel(message.status)}</span>}<button type="button" className={copiedMessageId === message.id ? 'copied' : ''} aria-label={copiedMessageId === message.id ? '消息已复制' : '复制消息'} title={copiedMessageId === message.id ? '已复制' : '复制'} onClick={() => void copyMessage(message)} data-testid="message-copy"><ShellIcon name={copiedMessageId === message.id ? 'check' : 'copy'}/>{copiedMessageId === message.id && <span role="status" aria-live="polite">已复制</span>}</button></footer></article>
                {agentRun && agentTurn?.userMessageId === message.id && currentAgentTurn}
              </Fragment>;
            })}
            {agentProjectionNotice && <p className="agent-projection-notice" role="status" data-testid="agent-projection-notice">{agentProjectionNotice}</p>}
          </div>
          {!atLatestAnswer && <button type="button" className={`latest-answer-button ${agentRun && !agentRunIsTerminal ? 'is-generating' : 'is-complete'}${hasUnseenActivity ? ' has-unseen' : ''}`} aria-label={agentRun && !agentRunIsTerminal ? '跳转到当前任务底部' : '跳转到最新消息'} title={agentRun && !agentRunIsTerminal ? '跳转到当前任务底部' : '跳转到最新消息'} onClick={scrollToLatestAnswer} data-testid="jump-to-latest">
            {agentRun && !agentRunIsTerminal
              ? <span className="latest-answer-ellipsis" aria-hidden="true"><i/><i/><i/></span>
              : <ShellIcon name="chevronDown"/>}
          </button>}
    <form className="conversation-composer" data-testid="conversation-composer" onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={handleComposerDrop} onSubmit={(event) => { event.preventDefault(); void send(prompt); }}>
            {composerAttachments.length > 0 && <div className="composer-attachments" data-testid="composer-attachments">
              {composerAttachments.filter((attachment) => attachment.kind === 'IMAGE').map((attachment) => <AttachmentThumbnail key={attachment.id} attachment={attachment} variant="composer" onOpen={openAttachmentInDock} onRemove={(id) => setAttachments((items) => items.filter((item) => item.id !== id))} onContextMenu={openImageContextMenu}/>)}
              {composerAttachments.filter((attachment) => attachment.kind === 'TEXT').map((attachment) => <div key={attachment.id} className={`attachment-chip ${attachment.status === 'READY' ? '' : 'unsupported'}`} title={attachment.reason ?? attachment.name}><ComposerIcon name="file"/><span><strong>{attachment.name}</strong><small>{attachment.status === 'READY' ? `${Math.max(1, Math.ceil(attachment.size / 1024))} KB · 文字 Context` : attachment.reason}</small></span><button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}><ComposerIcon name="close"/></button></div>)}
            </div>}
            <textarea
              ref={composerRef}
              name="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onPaste={handleComposerPaste}
              onKeyDown={(event) => {
                if (!shouldSubmitComposerKey({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              aria-label="描述要完成的任务"
              title="Enter 发送，Shift+Enter 换行"
              placeholder={selectedFile ? `询问或修改 ${selectedFile.relative_path}…` : composerAttachments.some((item) => item.status === 'READY') ? '询问这些附件…' : '描述要完成的任务…'}
            />
            <div className="composer-footer">
              <div className="composer-left-actions">
                <button type="button" className="composer-icon-button" onClick={() => void pickAttachments()} aria-label="添加附件" title="添加附件" data-testid="composer-add-attachment"><ComposerIcon name="plus"/></button>
                <SelectMenu className="composer-menu-picker permission-picker" value={permission} ariaLabel="权限" testId="composer-permission" placement="top" hideChevron leading={<PermissionIcon permission={permission}/>} options={[{ value: 'READ_ONLY', label: '请求批准', description: '修改文件和运行命令时始终询问', icon: <PermissionIcon permission="READ_ONLY"/> }, { value: 'REVIEW_CHANGES', label: '帮我批准', description: '仅对检测到的风险操作请求批准', icon: <PermissionIcon permission="REVIEW_CHANGES"/> }, { value: 'FULL_CONTROL', label: '完全访问权限', description: '自动访问文件、运行命令和使用网络', icon: <PermissionIcon permission="FULL_CONTROL"/>, tone: 'warning' }]} onChange={updatePermission} />
              </div>
              <div className="composer-right-actions">
                {activeProviders.length > 1 ? <SelectMenu className="composer-menu-picker configured-model-picker" value={conversation?.provider_config_id ?? ''} ariaLabel="模型" testId="conversation-model" placement="top" options={[{ value: '', label: '选择模型' }, ...activeProviders.map((provider) => ({ value: provider.id, label: provider.default_model, description: `${provider.display_name}${provider.credential_present ? '' : ' · 需要凭据'}`, disabled: !provider.credential_present }))]} onChange={(value) => void updateConversationSelection(value)} /> : effectiveConversationProvider && <span className="composer-model-label" title={effectiveConversationProvider.display_name}>{effectiveConversationProvider.default_model}</span>}
                <button type="button" className={`composer-icon-button voice-button ${listening ? 'active' : ''}`} onClick={toggleVoiceInput} aria-label={listening ? '停止语音输入' : '开始语音输入'} title={listening ? '停止语音输入' : '语音输入'} data-testid="composer-voice"><ComposerIcon name="microphone"/></button>
                {activeAgentRef.current && prompt.trim() ? <>
                  <button type="button" className="composer-icon-button composer-running-stop" aria-label="停止 Agent" title="停止当前任务" onClick={() => void cancelAgent()} data-testid="stop-agent-secondary"><ComposerIcon name="stop"/></button>
                  <button className="composer-submit" type="submit" disabled={busy} aria-label="追加到当前任务" title="当前任务完成后继续处理" data-testid="send-steering"><ComposerIcon name="send"/></button>
                </> : activeAgentRef.current
                  ? <button type="button" className="composer-submit stop" aria-label="停止 Agent" onClick={() => void cancelAgent()} data-testid="stop-agent"><ComposerIcon name="stop"/></button>
                  : <button className="composer-submit" type="submit" disabled={busy || (!prompt.trim() && !composerAttachments.some((item) => item.status === 'READY'))} aria-label="发送" data-testid="send-message"><ComposerIcon name="send"/></button>}
              </div>
            </div>
          </form>
        </>}
      </section>

      {project && <ResizableDivider label="调整文件或审阅区域宽度" value={workspaceWidth} min={360} max={900} onResize={(clientX) => {
        const rect = layoutRef.current?.getBoundingClientRect();
        if (rect) updateWorkspaceWidth(rect.right - clientX);
      }} onKeyboardResize={(delta) => updateWorkspaceWidth(workspaceWidth - delta)} testId="project-workspace-resizer" className="project-workspace-resizer" />}

      {project && showLegacyWorkspace && <section className="legacy-workspace-panel" aria-hidden="true">
        <header className="workspace-panel-header"><div><ShellIcon name={workspaceTab === 'FILES' ? 'files' : 'diff'}/><strong>{workspaceTab === 'FILES' ? '文件' : '审阅变更'}</strong></div><button onClick={() => setWorkspaceOpen(false)} title="关闭工作区" data-testid="workspace-close"><ShellIcon name="close"/></button></header>
        <div className="workspace-tabs"><button className={workspaceTab === 'FILES' ? 'active' : ''} onClick={() => setWorkspaceTab('FILES')}>文件</button><button className={workspaceTab === 'DIFF' ? 'active' : ''} onClick={() => setWorkspaceTab('DIFF')}>审阅{draft || displayedAgentReview.files.length ? ` · ${draft ? 1 : displayedAgentReview.files.length}` : ''}</button></div>
        {workspaceTab === 'FILES' && <div className="file-workspace"><div className="file-tree"><header><strong>文件</strong><button onClick={async () => setFiles(await window.fielora.workspace.listFiles({field_id:project.field_id}))}>↻</button></header>{files.map((file) => <button key={file.relative_path} className={selectedFile?.relative_path === file.relative_path || (filePreview?.kind === 'IMAGE' ? filePreview.preview.relative_path : filePreview?.relativePath) === file.relative_path ? 'active' : ''} onClick={() => void openFile(file)} data-testid="workspace-file"><span>⌑</span>{file.relative_path}</button>)}</div>{selectedFile ? <div className="file-editor"><header><span>{selectedFile.relative_path}</span>{undoChange?.relativePath === selectedFile.relative_path && <button onClick={() => void undoAcceptedChange()} data-testid="undo-change">撤销已接受变更</button>}</header><textarea value={editorContent} onChange={(event) => setEditorContent(event.target.value)} spellCheck={false} data-testid="file-editor" /><footer><span>{editorContent === selectedFile.content ? '未修改' : '有未 review 的修改'}</span><button disabled={editorContent === selectedFile.content} onClick={reviewEditor} data-testid="review-change">Review Diff</button></footer></div> : filePreview?.kind === 'IMAGE' ? <div className="file-image-preview" data-testid="file-image-preview"><header><span>{filePreview.preview.relative_path}</span></header><div><img src={filePreview.preview.data_url} alt={filePreview.preview.relative_path}/><small>{filePreview.preview.mime_type} · {Math.max(1, Math.ceil(filePreview.preview.size / 1024))} KB</small></div></div> : filePreview?.kind === 'UNSUPPORTED' ? <div className="file-unsupported-preview" data-testid="file-unsupported-preview"><ShellIcon name="files"/><h3>无法在此预览</h3><strong>{filePreview.relativePath}</strong><p>{filePreview.message}</p></div> : <div className="workspace-blank"><p>选择文件以查看和编辑。</p></div>}</div>}
        {workspaceTab === 'DIFF' && <div className="diff-workspace">{draft ? <><header><div><p className="eyebrow">REVIEW</p><h3>{draft.relativePath}</h3></div><span>写入前不会修改磁盘</span></header><pre className="diff-view" data-testid="diff-view">{draft.diff}</pre><footer><button className="secondary-button" onClick={() => {setDraft(null);setEditorContent(selectedFile?.content??'');setWorkspaceTab('FILES');}}>放弃</button><button className="primary-button" onClick={() => void acceptDraft()} data-testid="accept-change">接受变更</button></footer></> : displayedAgentReview.files.length > 0 ? <AgentHumanReview review={displayedAgentReview} task={historicalReview?.task ?? agentRun?.task ?? conversation?.title ?? ''} runId={historicalReview?.runId ?? agentRun?.id ?? ''} selectedPathHint={agentReviewPath} onOpenFile={(path) => void openAgentReviewFile(path)}/> : <div className="workspace-blank"><h3>本次任务没有文件变更</h3><p>Agent 的写入、补丁和替换会显示在这里。</p></div>}</div>}
      </section>}
      {project && <RightWorkspaceDock
        tabs={dockTabs}
        activeTabId={activeDockTabId}
        toolbar={dockToolbar}
        showLauncher={workspaceOpen && dockTabs.length === 0}
        tools={[
          { id: 'artifacts', label: '工作对象', icon: 'filePlus', onOpen: () => openDockTool('ARTIFACTS') },
          { id: 'review', label: '审阅', icon: 'diff', shortcut: 'Ctrl+Shift+G', onOpen: () => openDockTool('REVIEW') },
          { id: 'terminal', label: '终端', icon: 'terminal', shortcut: 'Ctrl+`', onOpen: () => openDockTool('TERMINAL') },
          { id: 'browser', label: '浏览器', icon: 'browse', shortcut: 'Ctrl+T', onOpen: () => openDockTool('BROWSER') },
          { id: 'files', label: '文件', icon: 'folder', shortcut: 'Ctrl+P', onOpen: () => openDockTool('FILES') },
          { id: 'chat', label: '侧边聊天', icon: 'compose', shortcut: 'Ctrl+Alt+S', onOpen: () => window.dispatchEvent(new CustomEvent('fielora:open-summon')) },
        ]}
        onActivate={activateDockTab}
        onClose={closeDockTab}
      >{dockViews}</RightWorkspaceDock>}
    </WorkspaceSurface>
    {previewAttachment && createPortal(<ImagePreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} onContextMenu={openImageContextMenu}/>, document.body)}
    {imageContextMenu && createPortal(<ImageContextMenu {...imageContextMenu} locationLabel={project ? `${project.title} / 当前对话 / ${imageContextMenu.attachment.name}` : `当前对话 / ${imageContextMenu.attachment.name}`} onShow={(attachment) => { setImageContextMenu(null); openAttachmentInDock(attachment); }} onCopy={(attachment) => void copyImageAttachment(attachment)} onSave={(attachment) => void saveImageAttachment(attachment)} onClose={() => setImageContextMenu(null)}/>, document.body)}
    {environmentControl}
    {project && terminalLayer && createPortal(<>
      <ResizableDivider orientation="horizontal" label="调整终端高度" value={bottomTerminalHeight} min={170} max={520} onResize={(clientY) => updateBottomTerminalHeight(window.innerHeight - clientY)} onKeyboardResize={(delta) => updateBottomTerminalHeight(bottomTerminalHeight - delta)} testId="bottom-terminal-resizer" className="terminal-resizer" />
      <section className="terminal-dock bottom-terminal-dock" data-testid="bottom-terminal-dock" aria-hidden={!bottomTerminalOpen}>
        <header><div><ShellIcon name="terminal"/><strong>终端</strong><span>PowerShell</span></div><button type="button" onClick={() => setBottomTerminalOpen(false)} aria-label="关闭底部终端" data-testid="bottom-terminal-close"><ShellIcon name="close"/></button></header>
        <TerminalSession workingDirectory={terminalWorkingDirectory || project.root_path} command={terminalCommand} lastCommand={terminalLastCommand} output={terminalOutput} running={Boolean(terminalRunId)} active={bottomTerminalOpen} onCommandChange={setTerminalCommand} onRun={() => void runTerminal(terminalCommand, 'BOTTOM')} onCancel={() => terminalRunId ? void window.fielora.workspace.cancelTerminal({ run_id: terminalRunId }) : undefined} testId="bottom-terminal"/>
      </section>
    </>, terminalLayer)}
    {conversationDialog?.kind === 'RENAME' && <TextActionDialog title="重命名对话" description="新名称会同步更新到当前 Project 的对话列表。" value={conversationDialog.value} confirmLabel="保存" onChange={(value) => setConversationDialog({ kind: 'RENAME', value })} onCancel={() => setConversationDialog(null)} onConfirm={() => void renameConversation(conversationDialog.value)} testId="rename-conversation-dialog" />}
    {conversationDialog?.kind === 'DELETE' && conversation && <TextActionDialog title={`删除“${conversation.title}”？`} description="这条对话和消息会从 Project 列表归档。此操作不会删除项目文件。" confirmLabel="删除对话" danger onCancel={() => setConversationDialog(null)} onConfirm={() => void archiveConversation()} testId="delete-conversation-dialog" />}
    {conversationContextMenu && <ConversationContextMenu state={conversationContextMenu} onClose={() => setConversationContextMenu(null)} onRename={() => setConversationDialog({ kind: 'RENAME', value: conversationContextMenu.title })} onDelete={() => setConversationDialog({ kind: 'DELETE' })} />}
    {projectContextMenu && <ProjectContextMenu state={projectContextMenu} onClose={() => setProjectContextMenu(null)} onNewConversation={() => void createConversationFor(projectContextMenu.project)} onManage={() => setProjectDialog({ project: projectContextMenu.project, value: projectContextMenu.project.title })} onRemove={() => setProjectRemoval(projectContextMenu.project)} />}
    {projectDialog && <TextActionDialog title="编辑项目" description={`修改项目名称；本地文件夹保持为 ${projectDialog.project.root_path}`} value={projectDialog.value} confirmLabel="保存" onChange={(value) => setProjectDialog({ ...projectDialog, value })} onCancel={() => setProjectDialog(null)} onConfirm={() => void renameProject()} testId="edit-project-dialog" />}
    {projectRemoval && <TextActionDialog title={`移除“${projectRemoval.title}”？`} description="只会从 Fielora 项目列表移除。不会删除磁盘上的文件夹、代码、Git 历史或已保存的对话数据。" confirmLabel="移除项目" danger onCancel={() => setProjectRemoval(null)} onConfirm={() => void archiveProject(projectRemoval)} testId="remove-project-dialog" />}
    {error && <div className="project-toast" role="alert"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
  </div>;
}
