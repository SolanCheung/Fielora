import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ClipboardEvent, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type {
  AgentChangedEvent, AgentEventView, AgentPermission, AgentRunView, AgentToolCallView, ApprovalView,
  ConversationMessageStatus, ConversationMessageView, ConversationView, ProjectView, ProviderConfigView,
} from '@fielora/contracts';
import type { AgentTextDeltaEvent } from '../types';
import type { TerminalEvent, WorkspaceAttachmentView, WorkspaceEnvironmentView, WorkspaceFileEntry, WorkspaceFileView, WorkspaceImagePreview } from '../workspace-types';
import { PrimaryNav, ShellIcon } from './PrimaryNav';
import { AgentTurn } from './AgentTurn';
import { AgentHumanReview } from './AgentHumanReview';
import { AttachmentThumbnail, ConversationImageGallery, ImageContextMenu, ImagePreview } from './AttachmentMedia';
import { AGENT_PROJECTION_UNAVAILABLE_MESSAGE, mergeAgentEventPages } from './agent-projection';
import { buildAgentReview } from './agent-review';
import { MarkdownMessage } from './MarkdownMessage';
import { ResizableDivider } from './ResizableDivider';
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
  workspaceRequest: { id: number; tool: 'FILES' | 'DIFF' | 'TERMINAL' };
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

interface ActiveTerminal {
  runId: string;
  conversationId: string | null;
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

type ComposerPermission = AgentPermission;

type FilePreviewState =
  | { kind: 'IMAGE'; preview: WorkspaceImagePreview }
  | { kind: 'UNSUPPORTED'; relativePath: string; message: string }
  | null;

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

function ComposerIcon({ name }: { name: 'plus' | 'shield' | 'microphone' | 'send' | 'stop' | 'file' | 'close' }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14"/>,
    shield: <path d="M12 3 5.5 6v5c0 4.4 2.7 8.1 6.5 10 3.8-1.9 6.5-5.6 6.5-10V6L12 3Z"/>,
    microphone: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></>,
    send: <><path d="m7 12 5-5 5 5M12 7v10"/></>,
    stop: <rect x="7" y="7" width="10" height="10" rx="1.5"/>,
    file: <><path d="M7 3.5h7l3 3V20H7z"/><path d="M14 3.5V7h3"/></>,
    close: <path d="m8 8 8 8M16 8l-8 8"/>,
  } as const;
  return <svg className="composer-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function reasonMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason);
  if (raw.includes('FILE_CHANGED_SINCE_REVIEW')) return '文件在 review 后已被其他程序修改，请重新载入再确认。';
  if (raw.includes('CREDENTIAL_REJECTED')) return '模型凭据无效，请在设置中更新。';
  if (raw.includes('PROVIDER_RATE_LIMITED')) return '模型服务当前限流，请稍后重试。';
  return raw;
}

function messageTimeLabel(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function messageStatusLabel(status: ConversationMessageStatus): string {
  return status === 'FAILED' ? '失败' : status === 'CANCELLED' ? '已取消' : '';
}

function terminalStatus(status: TerminalEvent['kind']): ConversationMessageStatus {
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'CANCELLED') return 'CANCELLED';
  return 'FAILED';
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
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(() => {
    const stored = Number.parseFloat(window.localStorage.getItem('fielora:terminal-dock-height') ?? '250');
    return Number.isFinite(stored) ? Math.min(Math.max(stored, 170), 520) : 250;
  });
  const [environment, setEnvironment] = useState<WorkspaceEnvironmentView | null>(null);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
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
  const [agentProjectionNotice, setAgentProjectionNotice] = useState('');
  const [terminalCommand, setTerminalCommand] = useState('git status --short');
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalRunId, setTerminalRunId] = useState('');
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
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [conversationsLoadedFor, setConversationsLoadedFor] = useState('');
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
  const copiedMessageResetRef = useRef<number | null>(null);
  const creatingConversationForRef = useRef(new Set<string>());
  const conversationRefreshGenerationRef = useRef(0);
  const [projectActionsLayer, setProjectActionsLayer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    document.body.dataset.projectWorkspace = 'true';
    return () => { delete document.body.dataset.projectWorkspace; };
  }, []);

  useEffect(() => {
    setProjectActionsLayer(document.getElementById('desktop-project-actions-layer'));
  }, []);

  useEffect(() => {
    document.body.style.setProperty('--desktop-navigation-width', `${navigationWidth + 4}px`);
    return () => { document.body.style.removeProperty('--desktop-navigation-width'); };
  }, [navigationWidth]);

  useEffect(() => {
    const utilityState = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (detail?.open) setWorkspaceOpen(false);
    };
    window.addEventListener('fielora:utility-state', utilityState);
    return () => window.removeEventListener('fielora:utility-state', utilityState);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('fielora:terminal-state', { detail: { open: terminalOpen, height: terminalHeight } }));
  }, [terminalHeight, terminalOpen]);

  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('fielora:terminal-state', { detail: { open: false, height: 250 } }));
  }, []);

  useEffect(() => {
    atLatestAnswerRef.current = atLatestAnswer;
  }, [atLatestAnswer]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return undefined;
    atLatestAnswerRef.current = true;
    setAtLatestAnswer(true);
    const update = () => {
      const next = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      atLatestAnswerRef.current = next;
      setAtLatestAnswer(next);
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
      } else {
        setAtLatestAnswer(list.scrollHeight - list.scrollTop - list.clientHeight < 80);
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
  const agentRunIsTerminal = agentRun ? ['COMPLETED', 'FAILED', 'CANCELLED'].includes(agentRun.status) : false;
  const sortedProjects = useMemo(() => {
    const next = [...projects];
    if (projectSort === 'NAME') return next.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN', { sensitivity: 'base' }));
    if (projectSort === 'CREATED') return next.sort((left, right) => right.created_at - left.created_at || right.field_id.localeCompare(left.field_id));
    return next.sort((left, right) => right.updated_at - left.updated_at || right.field_id.localeCompare(left.field_id));
  }, [projectSort, projects]);

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
    setConversationsLoadedFor(fieldId);
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
    const tools = needsTools ? await window.fielora.agent.toolCalls({ run_id: run.id }) : agentToolsRef.current;
    if (selectedConversationRef.current !== run.conversation_id) return;
    const activeRunId = activeAgentRef.current?.runId;
    if (agentRunIdRef.current && agentRunIdRef.current !== run.id && activeRunId !== run.id) return;
    const events = mergeAgentEventPages(existing, incremental);
    agentEventsRef.current = events;
    agentToolsRef.current = tools;
    agentRunIdRef.current = run.id;
    setAgentRun(run); setAgentEvents(events); setAgentTools(tools); setAgentProjectionNotice('');
    performance.clearMeasures('fielora.agent.projection');
    performance.measure('fielora.agent.projection', { start: projectionStarted });
    if (['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(run.status)) {
      if (activeAgentRef.current?.runId !== run.id) activeAgentRef.current = { runId: run.id, conversationId: run.conversation_id, output: '' };
    } else if (activeAgentRef.current?.runId === run.id) activeAgentRef.current = null;
  }, []);
  const refreshConversationAgent = useCallback(async (id: string) => {
    const runs = (await window.fielora.agent.list({ conversation_id: id })).filter((run) => !run.task.startsWith('[SUBAGENT '));
    if (selectedConversationRef.current !== id) return;
    if (!runs[0]) { agentRunIdRef.current = ''; agentEventsRef.current = []; agentToolsRef.current = []; setAgentRun(null); setAgentEvents([]); setAgentTools([]); activeAgentRef.current = null; return; }
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
    if (!projectId) { setConversations([]); setConversationId(''); setConversationsLoadedFor(''); setFiles([]); setEnvironment(null); return; }
    setConversationsLoadedFor('');
    setSelectedFile(null); setFilePreview(null); setEditorContent(''); setDraft(null); setUndoChange(null);
    setWorkspaceOpen(false); setTerminalOpen(false); setEnvironmentOpen(false);
    void Promise.all([
      refreshConversations(projectId),
      window.fielora.workspace.listFiles({ field_id: projectId }).then(setFiles),
      window.fielora.workspace.getEnvironment({ field_id: projectId }).then(setEnvironment),
    ]).catch((reason) => setError(reasonMessage(reason)));
  }, [projectId, refreshConversations]);

  useEffect(() => {
    selectedConversationRef.current = conversationId;
    setStreamingOutput('');
    setPrompt(''); setAttachments([]);
    const conversationOverride = conversationId ? localStorage.getItem(`fielora:conversation-permission:${conversationId}`) : null;
    const projectDefault = projectId ? localStorage.getItem(`fielora:project-permission:${projectId}`) : null;
    const globalDefault = localStorage.getItem('fielora:permission:default');
    setPermission(resolveComposerPermission(conversationOverride, projectDefault, globalDefault));
    agentEventsRef.current = [];
    agentToolsRef.current = [];
    agentRunIdRef.current = '';
    setAgentProjectionNotice('');
    if (!conversationId) { setMessages([]); setAgentRun(null); setAgentEvents([]); setAgentTools([]); activeAgentRef.current = null; return; }
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
    if (!environmentOpen) return;
    const close = (event: PointerEvent) => {
      if (!environmentMenuRef.current?.contains(event.target as Node)) setEnvironmentOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [environmentOpen]);

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
    const transcript = `Terminal · ${active.command}\n\n${active.output || '(no output)'}\n\nExit: ${event.exit_code ?? event.kind}`;
    if (active.conversationId) {
      void window.fielora.conversation.createMessage({
        conversation_id: active.conversationId, role: 'ASSISTANT', content: transcript,
        status: terminalStatus(event.kind), provider_config_id: null, model_id: null, invocation_id: null,
      }).then(() => selectedConversationRef.current === active.conversationId ? refreshMessages(active.conversationId!) : undefined)
        .catch((reason) => setError(reasonMessage(reason)));
    }
  }), [refreshMessages]);

  async function addProject() {
    setError('');
    try {
      const created = await window.fielora.project.pick({ title: '', goal: null });
      if (created) {
        await createConversationFor(created);
        await refreshProjects(created.field_id);
      }
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function createConversationFor(targetProject: ProjectView) {
    const fieldId = targetProject.field_id;
    setProjectId(fieldId);
    setNewConversationStart(false);
    if (creatingConversationForRef.current.has(fieldId)) return;
    creatingConversationForRef.current.add(fieldId);
    try {
      const existing = await window.fielora.conversation.list({ field_id: fieldId });
      for (const candidate of existing.filter((item) => isDefaultConversationTitle(item.title))) {
        const history = await window.fielora.conversation.listMessages({ conversation_id: candidate.id });
        if (!hasUserMessage(history)) {
          await refreshConversations(fieldId, candidate.id);
          return;
        }
      }
      const ready = singleActiveProvider?.credential_present ? singleActiveProvider : (activeProviders.find((item) => item.credential_present) ?? singleActiveProvider ?? activeProviders[0] ?? null);
      const created = await window.fielora.conversation.create({
        field_id: fieldId, title: '新对话', provider_config_id: ready?.id ?? null, model_id: ready?.default_model ?? null,
      });
      await refreshConversations(fieldId, created.id);
    } finally {
      creatingConversationForRef.current.delete(fieldId);
    }
  }

  async function createConversation() {
    if (!project) { setNewConversationStart(true); return; }
    try { await createConversationFor(project); }
    catch (reason) { setError(reasonMessage(reason)); }
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
    if (!project || conversationsLoadedFor !== project.field_id) return;
    handledWorkspaceRequest.current = workspaceRequest.id;
    if (!conversation) {
      setError('请先在当前 Project 新建一条对话，再打开工作区工具。');
      return;
    }
    openWorkspace(workspaceRequest.tool);
  }, [conversation, conversationsLoadedFor, project, projects, projectsLoaded, workspaceRequest]);

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
      });
      activeAgentRef.current = { runId: started.id, conversationId: conversation.id, output: '' };
      agentRunIdRef.current = started.id; agentEventsRef.current = []; agentToolsRef.current = [];
      setAgentRun(started); setAgentEvents([]); setAgentTools([]); setStreamingOutput('');
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

  async function send(content: string) {
    if (!project || !conversation || activeAgentRef.current) return;
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
      });
      activeAgentRef.current = { runId: started.id, conversationId: conversation.id, output: '' };
      agentRunIdRef.current = started.id; agentEventsRef.current = []; agentToolsRef.current = [];
      setAgentRun(started); setAgentEvents([]); setAgentTools([]);
      setStreamingOutput(''); setPrompt(''); setAttachments([]);
    } catch (reason) { setError(reasonMessage(reason)); }
    finally { setBusy(false); }
  }

  async function openFile(entry: WorkspaceFileEntry) {
    if (!project) return;
    try {
      const kind = workspacePreviewKind(entry.relative_path);
      if (kind === 'IMAGE') {
        const preview = await window.fielora.workspace.previewFile({ field_id: project.field_id, relative_path: entry.relative_path });
        setSelectedFile(null); setFilePreview({ kind: 'IMAGE', preview }); setEditorContent(''); setDraft(null); setWorkspaceTab('FILES'); setError('');
        return;
      }
      if (kind === 'UNSUPPORTED') {
        setSelectedFile(null); setFilePreview({ kind: 'UNSUPPORTED', relativePath: entry.relative_path, message: friendlyFilePreviewFailure('unsupported') }); setEditorContent(''); setDraft(null); setWorkspaceTab('FILES'); setError('');
        return;
      }
      const file = await window.fielora.workspace.readFile({ field_id: project.field_id, relative_path: entry.relative_path });
      setSelectedFile(file); setFilePreview(null); setEditorContent(file.content); setDraft(null); setWorkspaceTab('FILES'); setError('');
    } catch (reason) {
      setSelectedFile(null); setFilePreview({ kind: 'UNSUPPORTED', relativePath: entry.relative_path, message: friendlyFilePreviewFailure(reason) }); setEditorContent(''); setDraft(null); setWorkspaceTab('FILES'); setError('');
    }
  }

  function reviewEditor() {
    if (!selectedFile || editorContent === selectedFile.content) return;
    setDraft({ relativePath: selectedFile.relative_path, before: selectedFile.content, after: editorContent, beforeHash: selectedFile.sha256, diff: reviewDiff(selectedFile.relative_path, selectedFile.content, editorContent) });
    setWorkspaceTab('DIFF'); setWorkspaceOpen(true);
  }

  async function acceptDraft() {
    if (!project || !draft) return;
    try {
      const applied = await window.fielora.workspace.applyFile({ field_id: project.field_id, relative_path: draft.relativePath, expected_sha256: draft.beforeHash, content: draft.after });
      setUndoChange({ relativePath: draft.relativePath, content: draft.before, expectedHash: applied.sha256 });
      setSelectedFile(applied); setEditorContent(applied.content); setDraft(null); setWorkspaceTab('FILES');
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function undoAcceptedChange() {
    if (!project || !undoChange) return;
    try {
      const restored = await window.fielora.workspace.applyFile({ field_id: project.field_id, relative_path: undoChange.relativePath, expected_sha256: undoChange.expectedHash, content: undoChange.content });
      setSelectedFile(restored); setEditorContent(restored.content); setUndoChange(null);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function runTerminal(command = terminalCommand) {
    if (!project || terminalRef.current) return;
    setTerminalOutput(''); setTerminalOpen(true);
    try {
      const started = await window.fielora.workspace.runTerminal({ field_id: project.field_id, command });
      terminalRef.current = { runId: started.run_id, conversationId: conversation?.id ?? null, command, output: '' };
      setTerminalRunId(started.run_id);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  const testCommand = files.some((file) => file.relative_path === 'package.json') ? 'pnpm test' : files.some((file) => file.relative_path === 'Cargo.toml') ? 'cargo test' : 'git status --short';

  function openWorkspace(tab: 'FILES' | 'DIFF' | 'TERMINAL') {
    if (tab === 'TERMINAL') {
      if (!project) { setError('请先打开一个 Project，再使用终端。'); return; }
      setTerminalOpen((current) => !current);
      return;
    }
    window.dispatchEvent(new CustomEvent('fielora:close-utility'));
    setWorkspaceWidth((current) => {
      const maximum = Math.max(360, layoutWidth() - navigationWidth - 380);
      return Math.min(Math.max(current, 360), Math.min(900, maximum));
    });
    setWorkspaceTab(tab); setWorkspaceOpen(true);
  }

  async function openAgentReviewFile(relativePath: string) {
    const entry = files.find((file) => file.relative_path === relativePath) ?? { relative_path: relativePath, size: 0 };
    setWorkspaceOpen(true);
    await openFile(entry);
  }

  function updateTerminalHeight(next: number) {
    const available = Math.max(170, window.innerHeight - 280);
    const height = Math.min(Math.max(next, 170), Math.min(520, available));
    setTerminalHeight(height);
    window.localStorage.setItem('fielora:terminal-dock-height', String(Math.round(height)));
  }

  function runEnvironmentCommand(command: string) {
    setEnvironmentOpen(false);
    setTerminalCommand(command);
    setTerminalOpen(true);
    void runTerminal(command);
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
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }

  const environmentControl = project && conversation && projectActionsLayer ? createPortal(
    <div className="environment-menu" ref={environmentMenuRef}>
      <ToolbarAction label="环境" text="环境" icon={<ShellIcon name="environment"/>} active={environmentOpen} onClick={() => { const next = !environmentOpen; setEnvironmentOpen(next); if (next) void window.fielora.workspace.getEnvironment({ field_id: project.field_id }).then(setEnvironment).catch((reason) => setError(reasonMessage(reason))); }} aria-expanded={environmentOpen} testId="environment-menu-toggle" />
      {environmentOpen && <div className="environment-popover" data-testid="environment-popover">
        <header><strong>环境信息</strong><small>{project.title}</small></header>
        <button onClick={() => { setEnvironmentOpen(false); openWorkspace('DIFF'); }}><ShellIcon name="diff"/><span><strong>变更</strong><small>{environment?.changed_files ?? 0} 个文件</small></span></button>
        <button onClick={() => runEnvironmentCommand('git status --short')}><ShellIcon name="terminal"/><span><strong>本地</strong><small>查看工作区状态</small></span></button>
        <button onClick={() => runEnvironmentCommand('git branch --show-current')} disabled={!environment?.is_git_repository}><ShellIcon name="branch"/><span><strong>{environment?.branch || (environment?.is_git_repository ? '默认分支尚未建立' : '不是 Git 仓库')}</strong><small>{environment?.upstream || '没有上游分支'}</small></span></button>
        <button onClick={prepareVersionControl} disabled={!environment?.is_git_repository}><ShellIcon name="cloud"/><span><strong>准备提交</strong><small>{environment?.ahead ? `领先 ${environment.ahead} · Agent 将先测试和审阅` : '测试 → Diff → 权限策略 → 提交'}</small></span></button>
        <button onClick={() => runEnvironmentCommand('git diff --stat HEAD')} disabled={!environment?.is_git_repository}><ShellIcon name="branch"/><span><strong>比较分支</strong><small>{environment?.behind ? `落后 ${environment.behind}` : '与 HEAD 比较'}</small></span></button>
        <div className="environment-sources"><span>来源</span>{selectedFile ? <button onClick={() => { setEnvironmentOpen(false); openWorkspace('FILES'); }}><ShellIcon name="source"/>{selectedFile.relative_path}</button> : <small>选择文件或附件后会显示在这里。</small>}</div>
      </div>}
    </div>,
    projectActionsLayer,
  ) : null;

  const currentTerminalMessage = agentTurn?.assistantMessageId
    ? messages.find((message) => message.id === agentTurn.assistantMessageId) ?? null
    : null;
  const agentReviewOpen = Boolean(project && workspaceOpen && workspaceTab === 'DIFF' && !draft && agentReview.files.length > 0);
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
    onCancel={() => void cancelAgent()}
    onRetry={() => void retryAgent()}
    onReview={() => openWorkspace('DIFF')}
    onDecision={(decision) => void decideApproval(decision)}
    onCopy={currentTerminalMessage ? () => void copyMessage(currentTerminalMessage) : undefined}
    onCopyError={(reason) => setError(`复制代码失败：${reason}`)}
  /> : null;

  return <div className="project-root" data-testid="project-workspace">
    <WorkspaceSurface
      surfaceRef={layoutRef}
      className={`project-layout ${workspaceOpen && project ? 'workspace-open' : ''}${agentReviewOpen ? ' agent-review-open' : ''}`}
      testId="project-workspace-surface"
      navigationWidth={navigationWidth}
      onNavigationWidthChange={updateNavigationWidth}
      navigationResizerTestId="project-navigation-resizer"
      navigationResizerClassName="project-navigation-resizer"
      style={{ '--project-workspace-width': `${workspaceWidth}px` } as CSSProperties}
      navigation={<PrimaryNav
        active="PROJECTS"
        onProjects={() => { setNewConversationStart(false); setWorkspaceOpen(false); }}
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
              <button className="project-item" onClick={() => { setProjectId(item.field_id); setNewConversationStart(false); }} onKeyDown={(event) => { if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setProjectContextMenu({ project: item, left: Math.max(8, Math.min(window.innerWidth - 184, bounds.left + 28)), top: Math.max(8, Math.min(window.innerHeight - 116, bounds.bottom)) }); }} aria-haspopup="menu" data-testid={`project-${item.field_id}`}><ShellIcon name={item.field_id === projectId ? 'folderOpen' : 'folder'}/><div><strong>{item.title}</strong><small>{item.root_path}</small></div></button>
              <div className="project-item-actions">
                <button type="button" aria-label={`在 ${item.title} 新建对话`} title="新建对话" onClick={() => void createConversationFor(item)} data-testid={`project-new-conversation-${item.field_id}`}><ShellIcon name="plus"/></button>
                <button type="button" aria-label={`编辑 ${item.title}`} title="编辑项目" onClick={() => setProjectDialog({ project: item, value: item.title })} data-testid={`project-edit-${item.field_id}`}><ShellIcon name="edit"/></button>
              </div>
            </div>
            {item.field_id === projectId && <div className="conversation-section">{conversations.length === 0 ? <p className="conversation-placeholder">还没有对话</p> : conversations.map((conversationItem) => <button key={conversationItem.id} className={`conversation-item ${conversationItem.id === conversationId ? 'active' : ''}`} onClick={() => setConversationId(conversationItem.id)} onContextMenu={(event) => { event.preventDefault(); setConversationId(conversationItem.id); setConversationContextMenu({ conversationId: conversationItem.id, title: conversationItem.title, left: Math.max(8, Math.min(window.innerWidth - 150, event.clientX)), top: Math.max(8, Math.min(window.innerHeight - 94, event.clientY)) }); }} onKeyDown={(event) => { if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setConversationId(conversationItem.id); setConversationContextMenu({ conversationId: conversationItem.id, title: conversationItem.title, left: Math.max(8, Math.min(window.innerWidth - 150, bounds.left + 28)), top: Math.max(8, Math.min(window.innerHeight - 94, bounds.bottom)) }); }} aria-haspopup="menu" data-testid={`conversation-${conversationItem.id}`}><span>{conversationItem.title}</span><small>{new Date(conversationItem.updated_at).toLocaleDateString()}</small></button>)}</div>}
          </Fragment>)}</div>
        </>}
      />}
    >

      <section className="conversation-column">
        {!project ? newConversationStart ? <div className="new-conversation-start" data-testid="new-conversation-start"><div><p className="eyebrow">新对话</p><h2>开始一条新对话</h2><p>对话会保存在本地 Project 中。选择文件夹后将立即创建 Project 和这条对话，不会丢失后续历史。</p><button className="secondary-button" onClick={() => void addProject()} data-testid="new-conversation-choose-project"><ShellIcon name="folder"/>选择 Project 文件夹</button></div></div> : <div className="project-overview" data-testid="project-overview"><header><div><p className="eyebrow">PROJECTS</p><h1>项目</h1><p>本地文件夹、持久对话、文件变更和运行结果。</p></div><button className="secondary-button" onClick={() => void addProject()}><ShellIcon name="folder"/>打开文件夹</button></header><div className="project-overview-empty"><h2>还没有项目</h2><p>使用左侧“项目”旁的 ＋ 或上方“打开文件夹”添加第一个本地 Project。</p></div></div> : !conversation ? <div className="workspace-welcome"><h2>{project.title}</h2><p>正在准备新对话…</p></div> : <>
          <header className="conversation-header"><div className="conversation-heading"><ShellIcon name="conversation"/><div><div className="conversation-title-line"><h2>{conversation.title}</h2><ConversationActionsMenu onRename={() => setConversationDialog({ kind: 'RENAME', value: conversation.title })} onDelete={() => setConversationDialog({ kind: 'DELETE' })}/></div><small title={project.root_path}><span>{project.title}</span><i>/</i><span>Fielora</span></small></div></div></header>
          <div className="message-list" ref={messageListRef}>
            {messages.length === 0 && !streamingOutput ? <div className="conversation-empty"><h3>这条对话还没有消息</h3><p>描述一个任务，Agent 会读取项目、使用工具、修改文件并运行验证。</p></div> : messages.map((message, index) => {
              const isCurrentAgentAssistant = Boolean(agentRun && agentTurn?.assistantMessageId === message.id);
              if (message.role === 'ASSISTANT' && message.invocation_id) {
                if (isCurrentAgentAssistant) return null;
                const historicalUserMessage = [...messages.slice(0, index)].reverse().find((item) => item.role === 'USER') ?? null;
                return <AgentTurn key={message.id} run={null} requestText={historicalUserMessage?.content ?? ''} userMessageId={historicalUserMessage?.id ?? null} terminalMessage={message} copied={copiedMessageId === message.id} onCopy={() => void copyMessage(message)} onCopyError={(reason) => setError(`复制代码失败：${reason}`)}/>;
              }
              const persistedImages = message.role === 'USER' ? messageAttachments(message.id) : [];
              return <Fragment key={message.id}>
                <article data-message-id={message.id} className={`message ${message.role.toLowerCase()}${persistedImages.length ? ' has-image-attachments' : ''}`} data-testid={`message-${message.role.toLowerCase()}`}>{persistedImages.length > 0 && <ConversationImageGallery attachments={persistedImages} onOpen={setPreviewAttachment} onContextMenu={openImageContextMenu}/>}<div className="message-content"><MarkdownMessage content={message.content} onCopyError={(reason) => setError(`复制代码失败：${reason}`)}/></div><footer className={`message-actions ${copiedMessageId === message.id ? 'copy-confirmed' : ''}`}><time dateTime={new Date(message.created_at).toISOString()} title={new Date(message.created_at).toLocaleString('zh-CN')}>{messageTimeLabel(message.created_at)}</time>{message.status !== 'COMPLETED' && <span className="message-status">{messageStatusLabel(message.status)}</span>}<button type="button" className={copiedMessageId === message.id ? 'copied' : ''} aria-label={copiedMessageId === message.id ? '消息已复制' : '复制消息'} title={copiedMessageId === message.id ? '已复制' : '复制'} onClick={() => void copyMessage(message)} data-testid="message-copy"><ShellIcon name={copiedMessageId === message.id ? 'check' : 'copy'}/>{copiedMessageId === message.id && <span role="status" aria-live="polite">已复制</span>}</button></footer></article>
                {agentRun && agentTurn?.userMessageId === message.id && currentAgentTurn}
              </Fragment>;
            })}
            {agentProjectionNotice && <p className="agent-projection-notice" role="status" data-testid="agent-projection-notice">{agentProjectionNotice}</p>}
          </div>
          {!atLatestAnswer && <button type="button" className={`latest-answer-button ${agentRun && !agentRunIsTerminal ? 'is-generating' : ''}`} aria-label="跳转到最新回答" title="跳转到最新回答" onClick={scrollToLatestAnswer} data-testid="jump-to-latest">
            {agentRun && !agentRunIsTerminal && <span className="latest-generation-dots" aria-hidden="true"><i/><i/><i/></span>}
            <ShellIcon name="chevronDown"/>
          </button>}
    <form className="conversation-composer" data-testid="conversation-composer" onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={handleComposerDrop} onSubmit={(event) => { event.preventDefault(); void send(prompt); }}>
            {composerAttachments.length > 0 && <div className="composer-attachments" data-testid="composer-attachments">
              {composerAttachments.filter((attachment) => attachment.kind === 'IMAGE').map((attachment) => <AttachmentThumbnail key={attachment.id} attachment={attachment} variant="composer" onOpen={setPreviewAttachment} onRemove={(id) => setAttachments((items) => items.filter((item) => item.id !== id))} onContextMenu={openImageContextMenu}/>)}
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
                <SelectMenu className="composer-menu-picker permission-picker" value={permission} ariaLabel="权限" testId="composer-permission" placement="top" leading={<ComposerIcon name="shield"/>} options={[{ value: 'READ_ONLY', label: '请求批准', description: '修改文件和运行命令时始终询问' }, { value: 'REVIEW_CHANGES', label: '帮我批准', description: '仅对检测到的风险操作请求批准' }, { value: 'FULL_CONTROL', label: '完全访问权限', description: '自动访问文件、运行命令和使用网络' }]} onChange={updatePermission} />
              </div>
              <div className="composer-right-actions">
                {activeProviders.length > 1 ? <SelectMenu className="composer-menu-picker configured-model-picker" value={conversation?.provider_config_id ?? ''} ariaLabel="模型" testId="conversation-model" placement="top" options={[{ value: '', label: '选择模型' }, ...activeProviders.map((provider) => ({ value: provider.id, label: provider.default_model, description: `${provider.display_name}${provider.credential_present ? '' : ' · 需要凭据'}`, disabled: !provider.credential_present }))]} onChange={(value) => void updateConversationSelection(value)} /> : effectiveConversationProvider && <span className="composer-model-label" title={effectiveConversationProvider.display_name}>{effectiveConversationProvider.default_model}</span>}
                <button type="button" className={`composer-icon-button voice-button ${listening ? 'active' : ''}`} onClick={toggleVoiceInput} aria-label={listening ? '停止语音输入' : '开始语音输入'} title={listening ? '停止语音输入' : '语音输入'} data-testid="composer-voice"><ComposerIcon name="microphone"/></button>
                {activeAgentRef.current ? <button type="button" className="composer-submit stop" aria-label="停止 Agent" onClick={() => void cancelAgent()}><ComposerIcon name="stop"/></button> : <button className="composer-submit" type="submit" disabled={busy || (!prompt.trim() && !composerAttachments.some((item) => item.status === 'READY'))} aria-label="发送" data-testid="send-message"><ComposerIcon name="send"/></button>}
              </div>
            </div>
          </form>
        </>}
      </section>

      {project && <ResizableDivider label="调整文件或审阅区域宽度" value={workspaceWidth} min={360} max={900} onResize={(clientX) => {
        const rect = layoutRef.current?.getBoundingClientRect();
        if (rect) updateWorkspaceWidth(rect.right - clientX);
      }} onKeyboardResize={(delta) => updateWorkspaceWidth(workspaceWidth - delta)} testId="project-workspace-resizer" className="project-workspace-resizer" />}

      {project && <section className="workspace-panel" data-testid="workspace-panel" aria-hidden={!workspaceOpen}>
        <header className="workspace-panel-header"><div><ShellIcon name={workspaceTab === 'FILES' ? 'files' : 'diff'}/><strong>{workspaceTab === 'FILES' ? '文件' : '审阅变更'}</strong></div><button onClick={() => setWorkspaceOpen(false)} title="关闭工作区" data-testid="workspace-close"><ShellIcon name="close"/></button></header>
        <div className="workspace-tabs"><button className={workspaceTab === 'FILES' ? 'active' : ''} onClick={() => setWorkspaceTab('FILES')}>文件</button><button className={workspaceTab === 'DIFF' ? 'active' : ''} onClick={() => setWorkspaceTab('DIFF')}>审阅{draft || agentReview.files.length ? ` · ${draft ? 1 : agentReview.files.length}` : ''}</button></div>
        {workspaceTab === 'FILES' && <div className="file-workspace"><div className="file-tree"><header><strong>文件</strong><button onClick={async () => setFiles(await window.fielora.workspace.listFiles({field_id:project.field_id}))}>↻</button></header>{files.map((file) => <button key={file.relative_path} className={selectedFile?.relative_path === file.relative_path || (filePreview?.kind === 'IMAGE' ? filePreview.preview.relative_path : filePreview?.relativePath) === file.relative_path ? 'active' : ''} onClick={() => void openFile(file)} data-testid="workspace-file"><span>⌑</span>{file.relative_path}</button>)}</div>{selectedFile ? <div className="file-editor"><header><span>{selectedFile.relative_path}</span>{undoChange?.relativePath === selectedFile.relative_path && <button onClick={() => void undoAcceptedChange()} data-testid="undo-change">撤销已接受变更</button>}</header><textarea value={editorContent} onChange={(event) => setEditorContent(event.target.value)} spellCheck={false} data-testid="file-editor" /><footer><span>{editorContent === selectedFile.content ? '未修改' : '有未 review 的修改'}</span><button disabled={editorContent === selectedFile.content} onClick={reviewEditor} data-testid="review-change">Review Diff</button></footer></div> : filePreview?.kind === 'IMAGE' ? <div className="file-image-preview" data-testid="file-image-preview"><header><span>{filePreview.preview.relative_path}</span></header><div><img src={filePreview.preview.data_url} alt={filePreview.preview.relative_path}/><small>{filePreview.preview.mime_type} · {Math.max(1, Math.ceil(filePreview.preview.size / 1024))} KB</small></div></div> : filePreview?.kind === 'UNSUPPORTED' ? <div className="file-unsupported-preview" data-testid="file-unsupported-preview"><ShellIcon name="files"/><h3>无法在此预览</h3><strong>{filePreview.relativePath}</strong><p>{filePreview.message}</p></div> : <div className="workspace-blank"><p>选择文件以查看和编辑。</p></div>}</div>}
        {workspaceTab === 'DIFF' && <div className="diff-workspace">{draft ? <><header><div><p className="eyebrow">REVIEW</p><h3>{draft.relativePath}</h3></div><span>写入前不会修改磁盘</span></header><pre className="diff-view" data-testid="diff-view">{draft.diff}</pre><footer><button className="secondary-button" onClick={() => {setDraft(null);setEditorContent(selectedFile?.content??'');setWorkspaceTab('FILES');}}>放弃</button><button className="primary-button" onClick={() => void acceptDraft()} data-testid="accept-change">接受变更</button></footer></> : agentReview.files.length > 0 ? <AgentHumanReview review={agentReview} task={agentRun?.task ?? conversation?.title ?? ''} runId={agentRun?.id ?? ''} onOpenFile={(path) => void openAgentReviewFile(path)}/> : <div className="workspace-blank"><h3>本次任务没有文件变更</h3><p>Agent 的写入、补丁和替换会显示在这里。</p></div>}</div>}
      </section>}
    </WorkspaceSurface>
    {previewAttachment && createPortal(<ImagePreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} onContextMenu={openImageContextMenu}/>, document.body)}
    {imageContextMenu && createPortal(<ImageContextMenu {...imageContextMenu} onCopy={(attachment) => void copyImageAttachment(attachment)} onSave={(attachment) => void saveImageAttachment(attachment)} onClose={() => setImageContextMenu(null)}/>, document.body)}
    {environmentControl}
    {project && document.getElementById('desktop-terminal-layer') && createPortal(<>
      <ResizableDivider orientation="horizontal" label="调整终端高度" value={terminalHeight} min={170} max={520} onResize={(clientY) => updateTerminalHeight(window.innerHeight - clientY)} onKeyboardResize={(delta) => updateTerminalHeight(terminalHeight - delta)} testId="terminal-resizer" className="terminal-resizer" />
      <section className="terminal-dock" data-testid="terminal-dock" aria-hidden={!terminalOpen}>
        <header><div><ShellIcon name="terminal"/><strong>终端</strong><span>PowerShell</span></div><button type="button" onClick={() => setTerminalOpen(false)} aria-label="关闭终端"><ShellIcon name="close"/></button></header>
        <div className="terminal-toolbar"><input value={terminalCommand} onChange={(event) => setTerminalCommand(event.target.value)} aria-label="Terminal command" data-testid="terminal-command" /><button disabled={Boolean(terminalRunId)} onClick={() => void runTerminal()} data-testid="terminal-run">运行</button><button disabled={Boolean(terminalRunId)} onClick={() => {setTerminalCommand(testCommand);void runTerminal(testCommand);}} data-testid="run-tests">运行测试</button>{terminalRunId && <button className="stop-button" onClick={() => void window.fielora.workspace.cancelTerminal({run_id:terminalRunId})}>取消</button>}</div>
        <pre className="terminal-output" data-testid="terminal-output">{terminalOutput || '终端输出会显示在这里，并在结束后回到当前对话。'}</pre>
      </section>
    </>, document.getElementById('desktop-terminal-layer')!)}
    {conversationDialog?.kind === 'RENAME' && <TextActionDialog title="重命名对话" description="新名称会同步更新到当前 Project 的对话列表。" value={conversationDialog.value} confirmLabel="保存" onChange={(value) => setConversationDialog({ kind: 'RENAME', value })} onCancel={() => setConversationDialog(null)} onConfirm={() => void renameConversation(conversationDialog.value)} testId="rename-conversation-dialog" />}
    {conversationDialog?.kind === 'DELETE' && conversation && <TextActionDialog title={`删除“${conversation.title}”？`} description="这条对话和消息会从 Project 列表归档。此操作不会删除项目文件。" confirmLabel="删除对话" danger onCancel={() => setConversationDialog(null)} onConfirm={() => void archiveConversation()} testId="delete-conversation-dialog" />}
    {conversationContextMenu && <ConversationContextMenu state={conversationContextMenu} onClose={() => setConversationContextMenu(null)} onRename={() => setConversationDialog({ kind: 'RENAME', value: conversationContextMenu.title })} onDelete={() => setConversationDialog({ kind: 'DELETE' })} />}
    {projectContextMenu && <ProjectContextMenu state={projectContextMenu} onClose={() => setProjectContextMenu(null)} onNewConversation={() => void createConversationFor(projectContextMenu.project)} onManage={() => setProjectDialog({ project: projectContextMenu.project, value: projectContextMenu.project.title })} onRemove={() => setProjectRemoval(projectContextMenu.project)} />}
    {projectDialog && <TextActionDialog title="编辑项目" description={`修改项目名称；本地文件夹保持为 ${projectDialog.project.root_path}`} value={projectDialog.value} confirmLabel="保存" onChange={(value) => setProjectDialog({ ...projectDialog, value })} onCancel={() => setProjectDialog(null)} onConfirm={() => void renameProject()} testId="edit-project-dialog" />}
    {projectRemoval && <TextActionDialog title={`移除“${projectRemoval.title}”？`} description="只会从 Fielora 项目列表移除。不会删除磁盘上的文件夹、代码、Git 历史或已保存的对话数据。" confirmLabel="移除项目" danger onCancel={() => setProjectRemoval(null)} onConfirm={() => void archiveProject(projectRemoval)} testId="remove-project-dialog" />}
    {error && <div className="project-toast" role="alert"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
  </div>;
}
