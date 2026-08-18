import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  AgentChangedEvent, AgentEventView, AgentPermission, AgentRunView, AgentToolCallView, ApprovalView,
  ConversationMessageStatus, ConversationMessageView, ConversationView, ProjectView, ProviderConfigView,
} from '@fielora/contracts';
import type { AgentTextDeltaEvent } from '../types';
import type { TerminalEvent, WorkspaceAttachmentView, WorkspaceFileEntry, WorkspaceFileView } from '../workspace-types';
import { PrimaryNav, ShellIcon } from './PrimaryNav';
import { ResizableDivider } from './ResizableDivider';
import { reviewDiff } from './workspace-presentation';

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

type ComposerPermission = AgentPermission;

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

interface ComposerMenuOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function ComposerMenu({ value, options, label, testId, className = '', leading, onChange }: {
  value: string;
  options: ComposerMenuOption[];
  label: string;
  testId: string;
  className?: string;
  leading?: ReactNode;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const pointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', pointerDown);
    window.addEventListener('keydown', keyDown);
    return () => {
      window.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('keydown', keyDown);
    };
  }, [open]);

  return <div ref={rootRef} className={`composer-menu-picker ${className} ${open ? 'open' : ''}`.trim()}>
    <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)} data-testid={testId}>
      {leading}<span>{selected?.label ?? label}</span><span className="composer-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="composer-popover" role="listbox" aria-label={label} data-testid={`${testId}-menu`}>
      {options.map((option) => <button key={option.value || 'empty'} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} onClick={() => { onChange(option.value); setOpen(false); }} data-testid={`${testId}-option-${option.value || 'empty'}`}><span>{option.label}</span>{option.value === value && <span aria-hidden="true">✓</span>}</button>)}
    </div>}
  </div>;
}

function reasonMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason);
  if (raw.includes('FILE_CHANGED_SINCE_REVIEW')) return '文件在 review 后已被其他程序修改，请重新载入再确认。';
  if (raw.includes('CREDENTIAL_REJECTED')) return '模型凭据无效，请在设置中更新。';
  if (raw.includes('PROVIDER_RATE_LIMITED')) return '模型服务当前限流，请稍后重试。';
  return raw;
}

function terminalStatus(status: TerminalEvent['kind']): ConversationMessageStatus {
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'CANCELLED') return 'CANCELLED';
  return 'FAILED';
}

function runStatusLabel(status: AgentRunView['status']): string {
  return ({ QUEUED: '排队中', RUNNING: '正在工作', WAITING_APPROVAL: '等待批准', PAUSED: '已暂停', COMPLETED: '已完成', FAILED: '失败', CANCELLED: '已取消' } as const)[status];
}

function toolStatusLabel(status: AgentToolCallView['status']): string {
  return ({ PROPOSED: '已提出', WAITING_APPROVAL: '待批准', RUNNING: '执行中', COMPLETED: '完成', FAILED: '失败', DENIED: '已拒绝', CANCELLED: '已取消', UNKNOWN: '状态未知' } as const)[status];
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
  if (typeof values.path === 'string') return `${name} · ${values.path}`;
  if (typeof values.from === 'string' && typeof values.to === 'string') return `${name} · ${values.from} → ${values.to}`;
  if (typeof values.objective === 'string') return `${name} · ${values.objective}`;
  return name;
}

function receiptExitCode(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== 'object' || !("exit_code" in receipt)) return null;
  const value = (receipt as { exit_code?: unknown }).exit_code;
  return typeof value === 'number' || value === null ? String(value) : null;
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
  const [editorContent, setEditorContent] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<'FILES' | 'DIFF' | 'TERMINAL'>('FILES');
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [undoChange, setUndoChange] = useState<UndoChange | null>(null);
  const [streamingOutput, setStreamingOutput] = useState('');
  const [agentRun, setAgentRun] = useState<AgentRunView | null>(null);
  const [agentEvents, setAgentEvents] = useState<AgentEventView[]>([]);
  const [agentTools, setAgentTools] = useState<AgentToolCallView[]>([]);
  const [terminalCommand, setTerminalCommand] = useState('git status --short');
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalRunId, setTerminalRunId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<WorkspaceAttachmentView[]>([]);
  const [permission, setPermission] = useState<ComposerPermission>('REVIEW_CHANGES');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [conversationsLoadedFor, setConversationsLoadedFor] = useState('');
  const [newConversationStart, setNewConversationStart] = useState(false);
  const [navigationWidth, setNavigationWidth] = useState(() => {
    const stored = Number.parseFloat(window.localStorage.getItem('fielora:project-navigation-width') ?? '270');
    return Number.isFinite(stored) ? Math.min(Math.max(stored, 190), 360) : 270;
  });
  const [workspaceWidth, setWorkspaceWidth] = useState(() => {
    const stored = Number.parseFloat(window.localStorage.getItem('fielora:project-workspace-width') ?? '520');
    return Number.isFinite(stored) ? Math.min(Math.max(stored, 360), 900) : 520;
  });
  const activeAgentRef = useRef<ActiveAgent | null>(null);
  const terminalRef = useRef<ActiveTerminal | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const selectedConversationRef = useRef('');
  const handledNewConversationRequest = useRef(0);
  const handledAddProjectRequest = useRef(0);
  const handledWorkspaceRequest = useRef(0);
  const layoutRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.body.dataset.projectWorkspace = 'true';
    return () => { delete document.body.dataset.projectWorkspace; };
  }, []);

  const project = projects.find((item) => item.field_id === projectId) ?? null;
  const conversation = conversations.find((item) => item.id === conversationId) ?? null;
  const activeProviders = useMemo(() => providers.filter((item) => item.lifecycle_status !== 'REMOVED'), [providers]);
  const approval = useMemo(() => pendingApproval(agentEvents, agentRun), [agentEvents, agentRun]);
  const approvalToolSummary = useMemo(() => pendingToolSummary(agentEvents, agentRun), [agentEvents, agentRun]);

  function layoutWidth(): number {
    return layoutRef.current?.getBoundingClientRect().width ?? window.innerWidth;
  }

  function updateNavigationWidth(next: number) {
    const reserved = workspaceOpen && project ? workspaceWidth + 380 : 420;
    const maximum = Math.min(360, Math.max(190, layoutWidth() - reserved));
    const width = Math.min(Math.max(next, 190), maximum);
    setNavigationWidth(width);
    window.localStorage.setItem('fielora:project-navigation-width', String(Math.round(width)));
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
    const next = await window.fielora.conversation.list({ field_id: fieldId });
    setConversations(next);
    setConversationId((current) => preferred ?? (next.some((item) => item.id === current) ? current : next[0]?.id ?? ''));
    setConversationsLoadedFor(fieldId);
  }, []);
  const refreshMessages = useCallback(async (id: string) => {
    const next = await window.fielora.conversation.listMessages({ conversation_id: id });
    if (selectedConversationRef.current === id) setMessages(next);
  }, []);
  const loadAgentRun = useCallback(async (run: AgentRunView) => {
    const [events, tools] = await Promise.all([
      window.fielora.agent.events({ run_id: run.id, after_sequence: null, limit: 500 }),
      window.fielora.agent.toolCalls({ run_id: run.id }),
    ]);
    if (selectedConversationRef.current !== run.conversation_id) return;
    setAgentRun(run); setAgentEvents(events); setAgentTools(tools);
    if (['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(run.status)) {
      if (activeAgentRef.current?.runId !== run.id) activeAgentRef.current = { runId: run.id, conversationId: run.conversation_id, output: '' };
    } else if (activeAgentRef.current?.runId === run.id) activeAgentRef.current = null;
  }, []);
  const refreshConversationAgent = useCallback(async (id: string) => {
    const runs = (await window.fielora.agent.list({ conversation_id: id })).filter((run) => !run.task.startsWith('[SUBAGENT '));
    if (selectedConversationRef.current !== id) return;
    if (!runs[0]) { setAgentRun(null); setAgentEvents([]); setAgentTools([]); activeAgentRef.current = null; return; }
    await loadAgentRun(runs[0]);
  }, [loadAgentRun]);

  useEffect(() => {
    void Promise.all([refreshProjects(), refreshProviders()]).catch((reason) => setError(reasonMessage(reason)));
  }, [refreshProjects, refreshProviders]);

  useEffect(() => {
    if (!projectId) { setConversations([]); setConversationId(''); setConversationsLoadedFor(''); setFiles([]); return; }
    setConversationsLoadedFor('');
    setSelectedFile(null); setEditorContent(''); setDraft(null); setUndoChange(null);
    setWorkspaceOpen(false);
    void Promise.all([
      refreshConversations(projectId),
      window.fielora.workspace.listFiles({ field_id: projectId }).then(setFiles),
    ]).catch((reason) => setError(reasonMessage(reason)));
  }, [projectId, refreshConversations]);

  useEffect(() => {
    selectedConversationRef.current = conversationId;
    setStreamingOutput('');
    setPrompt(''); setAttachments([]);
    const storedPermission = conversationId ? localStorage.getItem(`fielora:conversation-permission:${conversationId}`) : null;
    setPermission(storedPermission === 'READ_ONLY' || storedPermission === 'FULL_CONTROL' ? storedPermission : 'REVIEW_CHANGES');
    if (!conversationId) { setMessages([]); setAgentRun(null); setAgentEvents([]); setAgentTools([]); activeAgentRef.current = null; return; }
    void Promise.all([refreshMessages(conversationId), refreshConversationAgent(conversationId)]).catch((reason) => setError(reasonMessage(reason)));
  }, [conversationId, refreshConversationAgent, refreshMessages]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

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
    void window.fielora.agent.get({ run_id: runId }).then(async (run) => {
      if (run.task.startsWith('[SUBAGENT ')) return;
      if (selectedConversationRef.current !== run.conversation_id) return;
      await loadAgentRun(run);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) {
        if (activeAgentRef.current?.runId === run.id) activeAgentRef.current = null;
        setStreamingOutput('');
        await Promise.all([
          refreshMessages(run.conversation_id),
          refreshConversations(run.field_id, run.conversation_id),
          window.fielora.workspace.listFiles({ field_id: run.field_id }).then(setFiles),
        ]);
      }
    }).catch((reason) => setError(reasonMessage(reason)));
  }), [loadAgentRun, refreshConversations, refreshMessages]);

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

  async function addProject(startConversation = false) {
    setError('');
    try {
      const created = await window.fielora.project.pick({ title: '', goal: null });
      if (created) {
        await refreshProjects(created.field_id);
        if (startConversation) await createConversationFor(created);
      }
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function createConversationFor(targetProject: ProjectView) {
    const ready = activeProviders.find((item) => item.credential_present) ?? activeProviders[0] ?? null;
    const created = await window.fielora.conversation.create({
      field_id: targetProject.field_id, title: '新对话', provider_config_id: ready?.id ?? null, model_id: ready?.default_model ?? null,
    });
    setNewConversationStart(false);
    await refreshConversations(targetProject.field_id, created.id);
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

  async function renameConversation() {
    if (!conversation) return;
    const title = window.prompt('重命名对话', conversation.title)?.trim();
    if (!title || title === conversation.title) return;
    try {
      const updated = await window.fielora.conversation.update({
        conversation_id: conversation.id, expected_revision: conversation.revision, title,
        provider_config_id: conversation.provider_config_id, model_id: conversation.model_id,
      });
      await refreshConversations(updated.field_id, updated.id);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  async function archiveConversation() {
    if (!conversation || !window.confirm(`删除对话“${conversation.title}”？消息会从 Project 列表中归档。`)) return;
    try {
      await window.fielora.conversation.archive({ conversation_id: conversation.id, expected_revision: conversation.revision });
      await refreshConversations(conversation.field_id);
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

  async function pickAttachments() {
    setError('');
    try {
      const selection = await window.fielora.workspace.pickAttachments();
      setAttachments(selection.attachments);
      const rejected = selection.attachments.filter((item) => item.status !== 'READY');
      if (selection.truncated_count > 0) setError(`一次最多添加 4 个附件，已忽略 ${selection.truncated_count} 个。`);
      else if (rejected.length > 0) setError(rejected.map((item) => `${item.name}：${item.reason}`).join('；'));
    } catch (reason) { setError(reasonMessage(reason)); }
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
    const provider = activeProviders.find((item) => item.id === conversation.provider_config_id);
    if (!provider || !provider.credential_present) { setError('请先选择已配置凭据的模型服务。'); return; }
    const readyAttachments = attachments.filter((item) => item.status === 'READY' && item.content !== null && item.sha256 !== null);
    const userText = content.trim() || (readyAttachments.length > 0 ? '请阅读并分析这些附件。' : '');
    if (!userText) return;
    setBusy(true); setError('');
    try {
      const visibleMessage = readyAttachments.length > 0 ? `${userText}\n\n附件：${readyAttachments.map((item) => item.name).join('、')}` : userText;
      await window.fielora.conversation.createMessage({
        conversation_id: conversation.id, role: 'USER', content: visibleMessage, status: 'COMPLETED',
        provider_config_id: null, model_id: null, invocation_id: null,
      });
      await refreshMessages(conversation.id);
      const selectedHint = selectedFile ? `\n\nThe currently selected project file is: ${selectedFile.relative_path}` : '';
      const attachmentContext = readyAttachments.map((item) => `\n<attachment name=${JSON.stringify(item.name)} sha256=${JSON.stringify(item.sha256)}>\n${item.content!.slice(0, 32_000)}\n</attachment>`).join('');
      const task = `${userText}${selectedHint}${attachmentContext}`.slice(0, 32_000);
      const started = await window.fielora.agent.start({
        field_id: project.field_id, conversation_id: conversation.id,
        provider_config_id: provider.id, model_id: conversation.model_id ?? provider.default_model,
        task, permission, max_steps: 24,
      });
      activeAgentRef.current = { runId: started.id, conversationId: conversation.id, output: '' };
      setAgentRun(started); setAgentEvents([]); setAgentTools([]);
      setStreamingOutput(''); setPrompt(''); setAttachments([]);
    } catch (reason) { setError(reasonMessage(reason)); }
    finally { setBusy(false); }
  }

  async function openFile(entry: WorkspaceFileEntry) {
    if (!project) return;
    try {
      const file = await window.fielora.workspace.readFile({ field_id: project.field_id, relative_path: entry.relative_path });
      setSelectedFile(file); setEditorContent(file.content); setDraft(null); setWorkspaceTab('FILES'); setError('');
    } catch (reason) { setError(reasonMessage(reason)); }
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
    setTerminalOutput(''); setWorkspaceTab('TERMINAL'); setWorkspaceOpen(true);
    try {
      const started = await window.fielora.workspace.runTerminal({ field_id: project.field_id, command });
      terminalRef.current = { runId: started.run_id, conversationId: conversation?.id ?? null, command, output: '' };
      setTerminalRunId(started.run_id);
    } catch (reason) { setError(reasonMessage(reason)); }
  }

  const testCommand = files.some((file) => file.relative_path === 'package.json') ? 'pnpm test' : files.some((file) => file.relative_path === 'Cargo.toml') ? 'cargo test' : 'git status --short';

  function openWorkspace(tab: 'FILES' | 'DIFF' | 'TERMINAL') {
    setWorkspaceWidth((current) => {
      const maximum = Math.max(360, layoutWidth() - navigationWidth - 380);
      return Math.min(Math.max(current, 360), Math.min(900, maximum));
    });
    setWorkspaceTab(tab); setWorkspaceOpen(true);
  }

  return <div className="project-root" data-testid="project-workspace">
    <main ref={layoutRef} className={`project-layout ${workspaceOpen && project ? 'workspace-open' : ''}`} style={{ '--project-navigation-width': `${navigationWidth}px`, '--project-workspace-width': `${workspaceWidth}px` } as CSSProperties}>
      <PrimaryNav
        active="PROJECTS"
        onProjects={() => { setNewConversationStart(false); setWorkspaceOpen(false); }}
        onNow={onNow}
        onBrowse={onBrowse}
        onFields={onFields}
        onNewConversation={() => void createConversation()}
        onSettings={onSettings}
        onAddProject={() => void addProject()}
        projectContent={<>
          <div className="project-list">{projects.length === 0 ? <p className="project-list-empty" data-testid="project-list-empty">还没有项目</p> : projects.map((item) => <button key={item.field_id} className={`project-item ${item.field_id === projectId ? 'active' : ''}`} onClick={() => { setProjectId(item.field_id); setNewConversationStart(false); }} data-testid={`project-${item.field_id}`}><ShellIcon name="folder"/><div><strong>{item.title}</strong><small>{item.root_path}</small></div></button>)}</div>
          {project && <div className="conversation-section"><div className="section-title conversation-title"><span>对话</span><button onClick={() => void createConversation()} title="在此 Project 新建对话">＋</button></div>{conversations.length === 0 ? <p className="conversation-placeholder">还没有对话</p> : conversations.map((item) => <button key={item.id} className={`conversation-item ${item.id === conversationId ? 'active' : ''}`} onClick={() => setConversationId(item.id)} data-testid={`conversation-${item.id}`}><span>{item.title}</span><small>{new Date(item.updated_at).toLocaleDateString()}</small></button>)}</div>}
        </>}
      />

      <ResizableDivider label="调整 Project 导航宽度" value={navigationWidth} min={190} max={360} onResize={(clientX) => {
        const rect = layoutRef.current?.getBoundingClientRect();
        if (rect) updateNavigationWidth(clientX - rect.left);
      }} onKeyboardResize={(delta) => updateNavigationWidth(navigationWidth + delta)} testId="project-navigation-resizer" className="project-navigation-resizer" />

      <section className="conversation-column">
        {!project ? newConversationStart ? <div className="new-conversation-start" data-testid="new-conversation-start"><div><p className="eyebrow">新对话</p><h2>开始一条新对话</h2><p>对话会保存在本地 Project 中。选择文件夹后将立即创建 Project 和这条对话，不会丢失后续历史。</p><button className="secondary-button" onClick={() => void addProject(true)} data-testid="new-conversation-choose-project"><ShellIcon name="folder"/>选择 Project 文件夹</button></div></div> : <div className="project-overview" data-testid="project-overview"><header><div><p className="eyebrow">PROJECTS</p><h1>项目</h1><p>本地文件夹、持久对话、文件变更和运行结果。</p></div><button className="secondary-button" onClick={() => void addProject()}><ShellIcon name="folder"/>打开文件夹</button></header><div className="project-overview-empty"><h2>还没有项目</h2><p>使用左侧“项目”旁的 ＋ 或上方“打开文件夹”添加第一个本地 Project。</p></div></div> : !conversation ? <div className="workspace-welcome"><h2>{project.title}</h2><p>新建一条对话，开始理解或修改这个 Project。</p><button className="secondary-button" onClick={() => void createConversation()}>新建对话</button></div> : <>
          <header className="conversation-header"><div className="conversation-heading"><ShellIcon name="folder"/><div><h2>{conversation.title}</h2><small>{project.title} · {project.root_path}</small></div></div><div className="conversation-toolbar"><button className={workspaceOpen && workspaceTab === 'FILES' ? 'active' : ''} onClick={() => openWorkspace('FILES')} aria-pressed={workspaceOpen && workspaceTab === 'FILES'} data-testid="workspace-files-toggle"><ShellIcon name="files"/><span>文件</span></button><button className={workspaceOpen && workspaceTab === 'DIFF' ? 'active' : ''} onClick={() => openWorkspace('DIFF')} aria-pressed={workspaceOpen && workspaceTab === 'DIFF'} data-testid="workspace-diff-toggle"><ShellIcon name="diff"/><span>审阅{draft ? ' · 1' : ''}</span></button><button className={workspaceOpen && workspaceTab === 'TERMINAL' ? 'active' : ''} onClick={() => openWorkspace('TERMINAL')} aria-pressed={workspaceOpen && workspaceTab === 'TERMINAL'} data-testid="workspace-terminal-toggle"><ShellIcon name="terminal"/><span>终端</span></button><details className="conversation-menu"><summary aria-label="对话菜单">•••</summary><div><button onClick={() => void renameConversation()}>重命名</button><button className="quiet" onClick={() => void archiveConversation()}>删除对话</button></div></details></div></header>
          <div className="message-list">{messages.length === 0 && !streamingOutput ? <div className="conversation-empty"><h3>这条对话还没有消息</h3><p>描述一个任务，Agent 会读取项目、使用工具、修改文件并运行验证。</p></div> : messages.map((message) => <article key={message.id} className={`message ${message.role.toLowerCase()}`} data-testid={`message-${message.role.toLowerCase()}`}><div className="message-meta"><strong>{message.role === 'USER' ? '你' : message.provider_config_id ? 'Agent' : '本地运行'}</strong><span>{message.status !== 'COMPLETED' ? message.status : ''}</span></div><div className="message-content">{message.content}</div></article>)}{streamingOutput && <article className="message assistant streaming" data-testid="streaming-message"><div className="message-meta"><strong>Agent</strong><span>正在思考…</span></div><div className="message-content">{streamingOutput}</div></article>}
            {agentRun && <section className={`agent-run-card status-${agentRun.status.toLowerCase()}`} data-testid="agent-run-card">
              <header><div><span className="agent-status-dot"/><strong>{runStatusLabel(agentRun.status)}</strong><small>第 {agentRun.current_step}/{agentRun.max_steps} 步 · {agentRun.model_id}</small></div><div>{agentRun.status === 'PAUSED' && <button type="button" onClick={() => void resumeAgent()} data-testid="agent-resume">继续</button>}{['QUEUED','RUNNING','WAITING_APPROVAL'].includes(agentRun.status) && <button type="button" className="quiet" onClick={() => void cancelAgent()} data-testid="agent-cancel">停止</button>}</div></header>
              {agentTools.length > 0 && <div className="agent-tool-list">{agentTools.map((tool) => <div className={`agent-tool status-${tool.status.toLowerCase()}`} key={tool.id} data-testid={`agent-tool-${tool.name}`}><ShellIcon name={tool.effect === 'PROCESS' ? 'terminal' : tool.effect === 'OBSERVE' ? 'files' : 'diff'}/><div><strong>{tool.name}</strong><small>{toolStatusLabel(tool.status)} · {tool.effect === 'OBSERVE' ? '读取' : tool.effect === 'PROCESS' ? '命令' : '文件修改'}</small></div>{receiptExitCode(tool.receipt) !== null && <code>exit {receiptExitCode(tool.receipt)}</code>}</div>)}</div>}
              {approval && <div className="agent-approval" data-testid="agent-approval"><div><strong>Agent 请求执行受控操作</strong><p>{approvalToolSummary || agentTools.find((tool) => tool.id === approval.tool_call_id)?.name || '工具调用'}</p><small>批准只对这一次、这组精确参数有效。</small></div><div><button type="button" className="secondary-button" onClick={() => void decideApproval('DENY')} disabled={busy}>拒绝</button><button type="button" className="primary-button" onClick={() => void decideApproval('ALLOW_ONCE')} disabled={busy} data-testid="agent-allow-once">批准一次</button></div></div>}
              {agentRun.error_code && <p className="agent-error">{agentRun.error_code}</p>}
              <details className="agent-event-details"><summary>运行记录 · {agentEvents.length} 个事件</summary><ol>{agentEvents.slice(-12).map((event) => <li key={event.id}><span>{event.sequence}</span>{event.kind.replaceAll('_',' ').toLowerCase()}</li>)}</ol></details>
            </section>}
          </div>
          <form className="conversation-composer" data-testid="conversation-composer" onSubmit={(event) => { event.preventDefault(); void send(prompt); }}>
            {attachments.length > 0 && <div className="composer-attachments" data-testid="composer-attachments">{attachments.map((attachment) => <div key={attachment.id} className={`attachment-chip ${attachment.status === 'READY' ? '' : 'unsupported'}`} title={attachment.reason ?? attachment.name}><ComposerIcon name="file"/><span><strong>{attachment.name}</strong><small>{attachment.status === 'READY' ? `${Math.max(1, Math.ceil(attachment.size / 1024))} KB · 将作为文字 Context` : attachment.reason}</small></span><button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}><ComposerIcon name="close"/></button></div>)}</div>}
            <textarea name="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={selectedFile ? `询问或修改 ${selectedFile.relative_path}…` : attachments.some((item) => item.status === 'READY') ? '询问这些附件…' : '描述要完成的任务…'} />
            <div className="composer-footer">
              <div className="composer-left-actions">
                <button type="button" className="composer-icon-button" onClick={() => void pickAttachments()} aria-label="添加附件" title="添加附件" data-testid="composer-add-attachment"><ComposerIcon name="plus"/></button>
                <ComposerMenu className="permission-picker" value={permission} label="权限" testId="composer-permission" leading={<ComposerIcon name="shield"/>} options={[{ value: 'READ_ONLY', label: '只读' }, { value: 'REVIEW_CHANGES', label: '审阅后修改' }, { value: 'FULL_CONTROL', label: '完全访问' }]} onChange={(value) => updatePermission(value as ComposerPermission)} />
              </div>
              <div className="composer-right-actions">
                <ComposerMenu className="configured-model-picker" value={conversation.provider_config_id ?? ''} label="模型" testId="conversation-model" options={[{ value: '', label: '选择模型' }, ...activeProviders.map((provider) => ({ value: provider.id, label: `${provider.default_model} · ${provider.display_name}${provider.credential_present ? '' : ' · 需要凭据'}`, disabled: !provider.credential_present }))]} onChange={(value) => void updateConversationSelection(value)} />
                <button type="button" className={`composer-icon-button voice-button ${listening ? 'active' : ''}`} onClick={toggleVoiceInput} aria-label={listening ? '停止语音输入' : '开始语音输入'} title={listening ? '停止语音输入' : '语音输入'} data-testid="composer-voice"><ComposerIcon name="microphone"/></button>
                {activeAgentRef.current ? <button type="button" className="composer-submit stop" aria-label="停止 Agent" onClick={() => void cancelAgent()}><ComposerIcon name="stop"/></button> : <button className="composer-submit" type="submit" disabled={busy || (!prompt.trim() && !attachments.some((item) => item.status === 'READY'))} aria-label="发送" data-testid="send-message"><ComposerIcon name="send"/></button>}
              </div>
            </div>
            <small>{permission === 'READ_ONLY' ? '只读：Agent 只能观察。' : permission === 'REVIEW_CHANGES' ? '审阅后修改：写文件和命令逐次批准。' : '完全访问：常规文件与命令自动执行，高风险操作仍需批准。'} 运行、工具与验证记录保存在本机。</small>
          </form>
        </>}
      </section>

      {project && workspaceOpen && <ResizableDivider label="调整文件、审阅或终端区域宽度" value={workspaceWidth} min={360} max={900} onResize={(clientX) => {
        const rect = layoutRef.current?.getBoundingClientRect();
        if (rect) updateWorkspaceWidth(rect.right - clientX);
      }} onKeyboardResize={(delta) => updateWorkspaceWidth(workspaceWidth - delta)} testId="project-workspace-resizer" className="project-workspace-resizer" />}

      {project && workspaceOpen && <section className="workspace-panel" data-testid="workspace-panel">
        <header className="workspace-panel-header"><div><ShellIcon name={workspaceTab === 'FILES' ? 'files' : workspaceTab === 'DIFF' ? 'diff' : 'terminal'}/><strong>{workspaceTab === 'FILES' ? '文件' : workspaceTab === 'DIFF' ? '审阅变更' : '终端'}</strong></div><button onClick={() => setWorkspaceOpen(false)} title="关闭工作区" data-testid="workspace-close"><ShellIcon name="close"/></button></header>
        <div className="workspace-tabs"><button className={workspaceTab === 'FILES' ? 'active' : ''} onClick={() => setWorkspaceTab('FILES')}>文件</button><button className={workspaceTab === 'DIFF' ? 'active' : ''} onClick={() => setWorkspaceTab('DIFF')}>审阅{draft ? ' · 1' : ''}</button><button className={workspaceTab === 'TERMINAL' ? 'active' : ''} onClick={() => setWorkspaceTab('TERMINAL')}>终端</button></div>
        {workspaceTab === 'FILES' && <div className="file-workspace"><div className="file-tree"><header><strong>文件</strong><button onClick={async () => setFiles(await window.fielora.workspace.listFiles({field_id:project.field_id}))}>↻</button></header>{files.map((file) => <button key={file.relative_path} className={selectedFile?.relative_path === file.relative_path ? 'active' : ''} onClick={() => void openFile(file)} data-testid="workspace-file"><span>⌑</span>{file.relative_path}</button>)}</div>{selectedFile ? <div className="file-editor"><header><span>{selectedFile.relative_path}</span>{undoChange?.relativePath === selectedFile.relative_path && <button onClick={() => void undoAcceptedChange()} data-testid="undo-change">撤销已接受变更</button>}</header><textarea value={editorContent} onChange={(event) => setEditorContent(event.target.value)} spellCheck={false} data-testid="file-editor" /><footer><span>{editorContent === selectedFile.content ? '未修改' : '有未 review 的修改'}</span><button disabled={editorContent === selectedFile.content} onClick={reviewEditor} data-testid="review-change">Review Diff</button></footer></div> : <div className="workspace-blank"><p>选择文件以查看和编辑。</p></div>}</div>}
        {workspaceTab === 'DIFF' && <div className="diff-workspace">{draft ? <><header><div><p className="eyebrow">REVIEW</p><h3>{draft.relativePath}</h3></div><span>写入前不会修改磁盘</span></header><pre className="diff-view" data-testid="diff-view">{draft.diff}</pre><footer><button className="secondary-button" onClick={() => {setDraft(null);setEditorContent(selectedFile?.content??'');setWorkspaceTab('FILES');}}>放弃</button><button className="primary-button" onClick={() => void acceptDraft()} data-testid="accept-change">接受变更</button></footer></> : <div className="workspace-blank"><h3>没有待 review 的变更</h3><p>编辑文件或让模型输出 `fielora-file` replacement 后，会先来到这里。</p></div>}</div>}
        {workspaceTab === 'TERMINAL' && <div className="terminal-workspace"><div className="terminal-toolbar"><input value={terminalCommand} onChange={(event) => setTerminalCommand(event.target.value)} aria-label="Terminal command" data-testid="terminal-command" /><button disabled={Boolean(terminalRunId)} onClick={() => void runTerminal()} data-testid="terminal-run">运行</button><button disabled={Boolean(terminalRunId)} onClick={() => {setTerminalCommand(testCommand);void runTerminal(testCommand);}} data-testid="run-tests">运行测试</button>{terminalRunId && <button className="stop-button" onClick={() => void window.fielora.workspace.cancelTerminal({run_id:terminalRunId})}>取消</button>}</div><pre className="terminal-output" data-testid="terminal-output">{terminalOutput || 'Terminal 输出会显示在这里，并在结束后回到当前对话。'}</pre></div>}
      </section>}
    </main>
    {error && <div className="project-toast" role="alert"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
  </div>;
}
