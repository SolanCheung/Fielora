import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AgentEventView, AgentRunView, AgentToolCallView, ApprovalView, ConversationMessageView, McpConnectionRuntimeView, ResultReference } from '@fielora/contracts';
import type { ResultImagePreviewView } from '../workspace-types';
import { appliedAgentReview, type AgentReviewSummary } from './agent-review';
import {
  buildConversationActivityProjection,
  reconcileLiveNarrative,
  type ConversationActivityEntry,
  type ConversationActivityGroupItem,
  type ConversationActivityGroupKind,
  type ConversationActivityItem,
} from './agent-activity-projection';
import {
  agentRequestKind,
  agentCompletionTimeLabel,
  approvalActionLabel,
  buildAgentResultViewModel,
  buildAgentPresentation,
  toolDetail,
  toolTitle,
  type AgentPresentation,
  type AgentTerminalStatus,
} from './agent-presentation';
import { MarkdownMessage } from './MarkdownMessage';
import { ShellIcon, type ShellIconName } from './PrimaryNav';

interface AgentTurnProps {
  run: AgentRunView | null;
  requestText?: string;
  userMessageId: string | null;
  terminalMessage: ConversationMessageView | null;
  events?: AgentEventView[];
  tools?: AgentToolCallView[];
  approval?: ApprovalView | null;
  approvalSummary?: string;
  review?: AgentReviewSummary | null;
  streamingContent?: string;
  streamingStep?: number;
  busy?: boolean;
  copied?: boolean;
  onResume?: () => void;
  onDecision?: (decision: 'DENY' | 'ALLOW_ONCE') => void;
  onRetry?: () => void;
  onReview?: () => void;
  onReviewFile?: (path: string) => void;
  onCopy?: () => void;
  onCopyError?: (reason: string) => void;
  onOpenReference?: (reference: ResultReference) => void;
  onOpenImage?: (preview: ResultImagePreviewView) => void;
  mcpRuntime?: McpConnectionRuntimeView | null;
  mcpBusyConnectionId?: string;
  onActivateMcp?: (connectionId: string) => void;
}

function isTerminalRun(run: AgentRunView | null): boolean {
  return Boolean(run && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status));
}

function terminalStatus(run: AgentRunView | null, message: ConversationMessageView | null): AgentTerminalStatus | null {
  if (run && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) return run.status as AgentTerminalStatus;
  return message?.status ?? null;
}

function CompletionTime({ label }: { label: string }) {
  return label ? <span className="agent-completion-time" role="tooltip">{label}</span> : null;
}

function mcpActivationLabel(state: McpConnectionRuntimeView['connections'][number]['activation_state']): string {
  if (state === 'ACTIVATION_QUEUED') return '等待当前安全边界';
  if (state === 'AWAITING_APPROVAL') return '等待批准';
  if (state === 'STARTING') return '正在启动';
  if (state === 'ACTIVE_IN_CURRENT_RUN') return 'Active for this Run';
  if (state === 'PROCESS_UNAVAILABLE') return '进程不可用';
  if (state === 'ACTIVATION_DENIED') return '已拒绝';
  if (state === 'ACTIVATION_FAILED') return '激活失败';
  return 'Configured · Not active';
}

function CurrentRunMcp({ runtime, busyConnectionId, onActivate }: {
  runtime: McpConnectionRuntimeView | null;
  busyConnectionId?: string;
  onActivate?: (connectionId: string) => void;
}) {
  if (!runtime) return null;
  return <section className="agent-run-mcp" data-testid="agent-run-mcp" data-run-status={runtime.run_status}>
    <header><span><strong>MCP for this run</strong><small>仅在此 AgentRun 中激活；Run 结束即停止。</small></span></header>
    {runtime.connections.length === 0 ? <p className="agent-run-mcp-empty">当前 Run 没有可用的 Local MCP 配置。</p> : <div>{runtime.connections.map((connection) => {
      const active = connection.activation_state === 'ACTIVE_IN_CURRENT_RUN';
      const busy = busyConnectionId === connection.connection_id || ['ACTIVATION_QUEUED', 'AWAITING_APPROVAL', 'STARTING'].includes(connection.activation_state);
      return <article key={connection.connection_id} data-testid={`agent-run-mcp-${connection.connection_id}`} data-activation-state={connection.activation_state}>
        <span><strong>{connection.connection_id}</strong><small>{connection.transport} · {mcpActivationLabel(connection.activation_state)}</small>{active && <><small>{connection.discovered_tool_count ?? 0} Tools discovered · Fielora policy: unknown Tools → DESTRUCTIVE</small><small>{connection.provider_id} · MCP {connection.protocol_version}</small></>}{connection.last_error_code && <code>{connection.last_error_code}</code>}</span>
        {connection.activation_available && onActivate ? <button type="button" disabled={Boolean(busyConnectionId)} onClick={() => onActivate(connection.connection_id)} data-testid={`mcp-activate-${connection.connection_id}`}>{busy ? '正在请求…' : 'Activate for this run'}</button> : <em>{active ? '仅此 Run' : mcpActivationLabel(connection.activation_state)}</em>}
      </article>;
    })}</div>}
    {runtime.diagnostics.length > 0 && <details><summary>配置诊断</summary>{runtime.diagnostics.map((item, index) => <p key={`${item.connection_id ?? 'config'}-${item.code}-${index}`}><code>{item.code}</code>{item.connection_id && <span>{item.connection_id}</span>}</p>)}</details>}
  </section>;
}

function LiveEditedFiles({ review, stable, onReviewFile }: {
  review: AgentReviewSummary;
  stable: boolean;
  onReviewFile?: (path: string) => void;
}) {
  const visible = review.files.slice(0, 6);
  const remaining = Math.max(0, review.files.length - visible.length);
  return <section className="agent-live-files" data-testid="agent-live-edited-files" data-file-count={review.files.length} data-additions={review.additions} data-deletions={review.deletions}>
    <header><span>本轮已更改文件</span><small><b>+{review.additions}</b><i>−{review.deletions}</i></small></header>
    <div>{visible.map((file) => {
      const canOpen = stable && Boolean(onReviewFile);
      return <button type="button" key={file.path} disabled={!canOpen} onClick={() => canOpen && onReviewFile?.(file.path)} data-live-review-path={file.path} title={canOpen ? '打开 Human Review' : '任务完成后可打开 Review'}>
        <span>{fileName(file.path)}</span><small><b>+{file.additions}</b><i>−{file.deletions}</i></small>
      </button>;
    })}</div>
    {remaining > 0 && <p>再显示 {remaining} 个文件</p>}
  </section>;
}

function activityIcon(kind: ConversationActivityGroupKind): ShellIconName {
  if (kind === 'INSPECT') return 'source';
  if (kind === 'CHANGE') return 'edit';
  if (kind === 'VERIFY') return 'check';
  if (kind === 'COMMAND') return 'terminal';
  if (kind === 'VERSION') return 'branch';
  if (kind === 'NETWORK') return 'browse';
  return 'source';
}

function activityToolPresentation(tool: AgentToolCallView): { title: string; detail: string; command: boolean; inlineDetail: boolean } {
  if (tool.name === 'delegate_readonly') return { title: '检查了项目结构', detail: '', command: false, inlineDetail: false };
  if (tool.name === 'run_command') return { title: toolDetail(tool), detail: '', command: true, inlineDetail: false };
  const knownNames = new Set([
    'list_files', 'read_file', 'search_text', 'stat_path', 'create_file', 'replace_text', 'apply_patches', 'write_file',
    'delete_file', 'move_file', 'git_read', 'git_status', 'git_stage', 'git_unstage', 'git_commit', 'git_push',
    'git_create_branch', 'git_switch_branch',
  ]);
  if (!knownNames.has(tool.name)) {
    const title = tool.effect === 'OBSERVE' ? '检查了相关信息'
      : tool.effect === 'WORKSPACE_WRITE' || tool.effect === 'DESTRUCTIVE' ? '更新了项目文件'
        : tool.effect === 'PROCESS' ? '运行了命令'
          : tool.effect === 'NETWORK' ? '访问了外部服务'
            : '执行了一项操作';
    return { title, detail: '', command: false, inlineDetail: false };
  }
  const title = toolTitle(tool.name);
  const detail = toolDetail(tool);
  const conciseAction: Partial<Record<string, string>> = {
    list_files: '查看', read_file: '读取', search_text: '搜索', stat_path: '检查',
    create_file: '创建', replace_text: '修改', apply_patches: '修改', write_file: '写入', delete_file: '删除', move_file: '移动',
    git_stage: '暂存', git_unstage: '取消暂存', git_create_branch: '创建分支', git_switch_branch: '切换分支',
  };
  if (detail !== title && conciseAction[tool.name]) {
    return { title: conciseAction[tool.name]!, detail, command: false, inlineDetail: true };
  }
  return { title, detail: detail === title ? '' : detail, command: false, inlineDetail: false };
}

function activityResult(kind: ConversationActivityGroupKind, entry: ConversationActivityEntry): string {
  if (kind === 'VERIFY' || entry.activityKind === 'VERIFY') {
    if (entry.status === 'COMPLETED') return 'PASS';
    if (['FAILED', 'UNKNOWN', 'DENIED', 'CANCELLED'].includes(entry.status)) return 'FAIL';
    return '';
  }
  if (entry.status === 'FAILED' || entry.status === 'UNKNOWN') return '未完成';
  if (entry.status === 'DENIED') return '已拒绝';
  if (entry.status === 'CANCELLED') return '已取消';
  return '';
}

function activityTimestamp(timestamp: number): string {
  return agentCompletionTimeLabel(timestamp).replace(/^(?:完成于|结束于)\s+/, '');
}

function ActivityGroup({ item }: { item: ConversationActivityGroupItem }) {
  const [showAll, setShowAll] = useState(false);
  const previewLimit = 5;
  const groupTime = item.completedAt ? activityTimestamp(item.completedAt) : '';
  const visibleEntries = showAll ? item.entries : item.entries.slice(0, previewLimit);
  const remaining = Math.max(0, item.entries.length - visibleEntries.length);
  return <section className={`conversation-activity-group activity-${item.groupKind.toLowerCase()}`} data-testid="conversation-activity-group" data-activity-sequence={item.sequence} data-activity-group-kind={item.groupKind} data-completed-at={item.completedAt ?? undefined} title={groupTime || undefined} tabIndex={groupTime ? 0 : undefined}>
    <header className="conversation-activity-group-summary">
      <ShellIcon name={activityIcon(item.groupKind)}/><strong>{item.title}</strong>
    </header>
    <CompletionTime label={groupTime}/>
    <ol className="conversation-activity-entries">{visibleEntries.map((entry) => {
      const completion = entry.completedAt ? activityTimestamp(entry.completedAt) : '';
      const presentation = entry.kind === 'TOOL' ? activityToolPresentation(entry.tool) : { title: entry.title, detail: entry.detail, command: false, inlineDetail: false };
      const result = activityResult(item.groupKind, entry);
      return <li key={entry.id} data-activity-entry={entry.kind.toLowerCase()} data-activity-sequence={entry.sequence} data-activity-status={entry.status} data-activity-command={presentation.command || undefined} data-completed-at={entry.completedAt ?? undefined} title={completion || undefined} tabIndex={completion ? 0 : undefined}>
        <span data-activity-layout={presentation.inlineDetail ? 'inline' : undefined}><strong title={presentation.detail || presentation.title}>{presentation.title}</strong>{presentation.detail && <small title={presentation.detail}>{presentation.detail}</small>}</span>
        {result && <em data-activity-result={result}>{result === 'PASS' ? '通过' : '未通过'}</em>}<CompletionTime label={completion}/>
      </li>;
    })}{item.entries.length > previewLimit && <li className="conversation-activity-more"><button type="button" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}><span>{showAll ? '收起其余活动' : `查看另外 ${remaining} 项`}</span><ShellIcon name="chevronDown"/></button></li>}</ol>
  </section>;
}

function ActivityApprovalRecord({ item }: { item: Extract<ConversationActivityItem, { kind: 'APPROVAL' }> }) {
  const label = item.completedAt ? agentCompletionTimeLabel(item.completedAt, item.decision === 'ALLOW_ONCE') : '';
  return <div className="conversation-activity-approval-record" data-activity-sequence={item.sequence} data-completed-at={item.completedAt ?? undefined} title={label || undefined} tabIndex={label ? 0 : undefined}>
    <span>{item.decision === 'ALLOW_ONCE' ? '已允许本次操作' : item.decision === 'DENY' ? '已拒绝本次操作' : '等待操作确认'}</span><CompletionTime label={label}/>
  </div>;
}

function NarrativeBlock({ text, streaming = false, sequence }: { text: string; streaming?: boolean; sequence?: number }) {
  return <div className={`conversation-narrative${streaming ? ' is-streaming' : ''}`} data-testid="conversation-narrative" data-activity-sequence={sequence}>
    <MarkdownMessage content={text} streaming={streaming}/>
  </div>;
}

function ConversationActivityStream({ items, tools, approval, approvalSummary, busy, onDecision, onOpenDetails, liveNarrative }: {
  items: ConversationActivityItem[];
  tools: AgentToolCallView[];
  approval: ApprovalView | null;
  approvalSummary: string;
  busy: boolean;
  onDecision?: (decision: 'DENY' | 'ALLOW_ONCE') => void;
  onOpenDetails: () => void;
  liveNarrative?: string;
}) {
  return <div className="conversation-activity-stream" data-testid="conversation-activity-stream" data-activity-count={items.length}>
    {items.length === 0 && !liveNarrative && <div className="conversation-activity-thinking" data-testid="conversation-activity-thinking"><ShellIcon name="source"/><small>正在准备任务上下文</small></div>}
    {items.map((item) => {
      if (item.kind === 'GROUP') return <ActivityGroup item={item} key={item.id}/>;
      if (item.kind === 'NARRATIVE') return <NarrativeBlock text={item.text} sequence={item.sequence} key={item.id}/>;
      if (item.kind === 'PHASE') return <p className="conversation-activity-phase" key={item.id} data-activity-sequence={item.sequence}>{item.title}</p>;
      if (approval?.id === item.approvalId && onDecision && !item.completedAt) {
        const tool = tools.find((candidate) => candidate.id === item.toolCallId) ?? null;
        return <AgentApproval key={item.id} tool={tool} summary={approvalSummary} busy={busy} onDecision={onDecision} onToggleSteps={onOpenDetails}/>;
      }
      return <ActivityApprovalRecord item={item} key={item.id}/>;
    })}
    {liveNarrative && <NarrativeBlock text={liveNarrative} streaming/>}
  </div>;
}

function durableRunPhase(events: readonly AgentEventView[]): string {
  for (const event of [...events].reverse()) {
    if (!['PHASE_CHANGED', 'STEP_STARTED'].includes(event.kind) || !event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) continue;
    const payload = event.payload as Record<string, unknown>;
    const phase = typeof payload.active_phase === 'string' ? payload.active_phase : typeof payload.phase === 'string' ? payload.phase : '';
    if (phase) return phase;
  }
  return '';
}

function currentRunStateLabel(run: AgentRunView, events: readonly AgentEventView[], tools: readonly AgentToolCallView[], thinking: boolean): string {
  if (run.status === 'WAITING_APPROVAL') return '等待批准';
  if (run.status === 'PAUSED') return '已暂停';
  if (thinking) return '正在思考';
  const phase = durableRunPhase(events);
  if (phase === 'VERIFY') return '正在验证';
  if (phase === 'LOCATE') return '正在定位';
  if (phase === 'EDIT') return '正在编辑';
  if (phase === 'FINALIZE') return '正在整理结果';
  const activeTool = [...tools].reverse().find((tool) => ['PROPOSED', 'WAITING_APPROVAL', 'RUNNING'].includes(tool.status));
  if (activeTool?.effect === 'PROCESS' && activeTool.name === 'run_command') return '正在执行命令';
  return '正在执行';
}

function AgentProgressSummary({ run, presentation, events, tools, review, thinking, detailsOpen, onToggleDetails, onResume, onReviewFile, mcpRuntime, mcpBusyConnectionId, onActivateMcp }: {
  run: AgentRunView;
  presentation: AgentPresentation;
  events: AgentEventView[];
  tools: AgentToolCallView[];
  review: AgentReviewSummary | null;
  thinking: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onResume?: () => void;
  onReviewFile?: (path: string) => void;
  mcpRuntime?: McpConnectionRuntimeView | null;
  mcpBusyConnectionId?: string;
  onActivateMcp?: (connectionId: string) => void;
}) {
  const editedReview = appliedAgentReview(review);
  const filesStable = !tools.some((tool) => ['WORKSPACE_WRITE', 'DESTRUCTIVE'].includes(tool.effect) && ['PROPOSED', 'RUNNING', 'WAITING_APPROVAL'].includes(tool.status));
  const changeSummary = editedReview && editedReview.files.length > 0
    ? `${editedReview.files.length} 个文件已修改`
    : presentation.changedFiles > 0 ? `${presentation.changedFiles} 个文件已修改` : '';
  const statusLabel = currentRunStateLabel(run, events, tools, thinking);
  const detailId = `agent-run-details-${run.id}`;
  return <div className={`agent-progress-summary${detailsOpen ? ' is-expanded' : ''}${thinking ? ' is-thinking' : ''}`} data-testid="agent-execution-status" data-execution-stage={thinking ? 'THINKING' : 'ACTIVE'} data-layout="conversation-stream">
    {detailsOpen && <div className="agent-run-details" id={detailId} data-testid="agent-run-details">
      <CurrentRunMcp runtime={mcpRuntime ?? null} busyConnectionId={mcpBusyConnectionId} onActivate={onActivateMcp}/>
      {editedReview && editedReview.files.length > 0 && <LiveEditedFiles review={editedReview} stable={filesStable} onReviewFile={onReviewFile}/>}
      {run.status === 'PAUSED' && onResume && <button type="button" className="agent-resume-action" onClick={onResume}>继续工作</button>}
    </div>}
    <button type="button" className="agent-progress-summary-trigger" onClick={onToggleDetails} aria-expanded={detailsOpen} aria-controls={detailId} data-testid="agent-progress-summary">
      <span className="agent-progress-symbol" aria-hidden="true"><ShellIcon name="source"/></span><strong>{statusLabel}</strong>
      <span>· {presentation.elapsed}</span>{changeSummary && <span>· {changeSummary}</span>}<ShellIcon name="chevronDown"/>
    </button>
  </div>;
}

function AgentApproval({ tool, summary, busy, onDecision, onToggleSteps }: {
  tool: AgentToolCallView | null;
  summary: string;
  busy: boolean;
  onDecision: (decision: 'DENY' | 'ALLOW_ONCE') => void;
  onToggleSteps: () => void;
}) {
  const mcpActivation = tool?.name === 'mcp.activate_connection';
  const connectionId = mcpActivation && tool?.arguments && typeof tool.arguments === 'object' && 'connection_id' in tool.arguments
    ? String((tool.arguments as { connection_id?: unknown }).connection_id ?? '') : '';
  return <section className="agent-turn-approval" data-testid="agent-approval">
    <p>{mcpActivation ? `Start local MCP Server “${connectionId}” for this Run` : '我已经定位到需要执行的下一步。'}</p>
    <p>{mcpActivation ? '这会启动已配置的本地进程并发现有界 Tools；不会授予后续 Tool 权限。' : summary || (tool ? `${toolTitle(tool.name)} · ${toolDetail(tool)}` : '只会执行当前列出的操作，不会扩大范围。')}</p>
    <div><button type="button" onClick={onToggleSteps}>查看修改范围</button><button type="button" onClick={() => onDecision('DENY')} disabled={busy}>拒绝</button><button type="button" className="agent-primary-action" onClick={() => onDecision('ALLOW_ONCE')} disabled={busy} data-testid="agent-allow-once">{approvalActionLabel(tool)}</button></div>
  </section>;
}

function fileName(path: string): string {
  return path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path;
}

function ChangedFiles({ review, onReview, onReviewFile }: {
  review: AgentReviewSummary;
  onReview?: () => void;
  onReviewFile?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const previewLimit = 3;
  const visibleFiles = expanded ? review.files : review.files.slice(0, previewLimit);
  const remainingFiles = Math.max(0, review.files.length - visibleFiles.length);
  return <section className={`agent-result-changes${expanded ? ' is-expanded' : ''}`} data-testid="agent-result-changed-files" data-file-count={review.files.length} data-additions={review.additions} data-deletions={review.deletions}>
    <header className="agent-result-changes-header">
      <span className="agent-result-changes-icon"><ShellIcon name="filePlus"/></span>
      <span className="agent-result-changes-title"><strong>已编辑 {review.files.length} 个文件</strong><small><b>+{review.additions}</b><i>−{review.deletions}</i></small></span>
      {onReview && <button type="button" className="agent-full-review-action" onClick={onReview}>审核</button>}
    </header>
    <div className="agent-result-file-list" data-testid="agent-inline-files-expanded">
      {visibleFiles.map((file) => <button type="button" key={file.path} onClick={() => onReviewFile?.(file.path)} disabled={!onReviewFile} data-review-path={file.path}>
        <span><strong>{fileName(file.path)}</strong>{file.path !== fileName(file.path) && <small>{file.path}</small>}</span><em><b>+{file.additions}</b><i>−{file.deletions}</i></em>
      </button>)}
    </div>
    {review.files.length > previewLimit && <button type="button" className="agent-result-changes-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} data-testid="agent-changed-files-toggle">
      <span>{expanded ? '收起文件' : `再显示 ${remainingFiles} 个文件`}</span><ShellIcon name="chevronDown"/>
    </button>}
  </section>;
}

function AgentTerminalResult({ status, message, presentation, tools, canExpand, partial, review, executionDetail, onRetry, onReview, onReviewFile, onOpenReference, onOpenImage }: {
  status: AgentTerminalStatus;
  message: ConversationMessageView | null;
  presentation: AgentPresentation | null;
  tools: AgentToolCallView[];
  canExpand: boolean;
  partial: boolean;
  review: AgentReviewSummary | null;
  executionDetail?: ReactNode;
  onRetry?: () => void;
  onReview?: () => void;
  onReviewFile?: (path: string) => void;
  onOpenReference?: (reference: ResultReference) => void;
  onOpenImage?: (preview: ResultImagePreviewView) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const result = buildAgentResultViewModel(status, message?.content ?? '', presentation, tools);
  const editedReview = appliedAgentReview(review);
  const markdown = message?.content || result.detail;
  return <div className="agent-terminal-result" data-testid="agent-terminal-result" data-result-outcome={presentation?.outcome ?? status}>
    {result.duration && (canExpand
      ? <button type="button" className="agent-terminal-runtime" aria-expanded={detailOpen} data-testid="agent-execution-detail-toggle" onClick={() => setDetailOpen((value) => !value)}><span>耗时 {result.duration}</span><ShellIcon name="chevronDown"/></button>
      : <div className="agent-terminal-runtime"><span>耗时 {result.duration}</span></div>)}
    {detailOpen && executionDetail}
    <div className="agent-terminal-body"><MarkdownMessage content={markdown} references={message?.references ?? []} onOpenReference={onOpenReference} onOpenImage={onOpenImage}/></div>
    {editedReview && editedReview.files.length > 0 && <ChangedFiles review={editedReview} onReview={onReview} onReviewFile={onReviewFile}/>}
    <div className="agent-terminal-actions">
      {result.evidence.map((item) => <span className="agent-terminal-meta" key={item}>{item}</span>)}
      {status === 'FAILED' && onRetry && <button type="button" className="agent-primary-action" onClick={onRetry} data-testid="agent-retry">{partial ? '继续完成' : '重新尝试'}</button>}
    </div>
  </div>;
}

function CompletedActivityHistory({ items, tools }: { items: ConversationActivityItem[]; tools: AgentToolCallView[] }) {
  return <div className="agent-execution-detail is-history" data-testid="agent-execution-detail">
    <ConversationActivityStream items={items} tools={tools} approval={null} approvalSummary="" busy={false} onOpenDetails={() => undefined}/>
  </div>;
}

export function AgentTurn({
  run, requestText = '', userMessageId, terminalMessage, events = [], tools = [], approval = null, approvalSummary = '', review = null,
  streamingContent = '', streamingStep = 0, busy = false, copied = false, onResume, onDecision, onRetry, onReview, onReviewFile, onCopy, onCopyError, onOpenReference, onOpenImage,
  mcpRuntime = null, mcpBusyConnectionId = '', onActivateMcp,
}: AgentTurnProps) {
  const terminal = Boolean(terminalMessage) || isTerminalRun(run);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run || terminal) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [run, terminal]);
  useEffect(() => {
    if (terminal) setDetailsOpen(false);
  }, [terminal]);
  useEffect(() => {
    if (run && !terminal) setDetailsOpen(false);
  }, [run?.id]);
  const requestKind = agentRequestKind(run?.task ?? requestText);
  const answerOnly = requestKind === 'ANSWER';
  const presentation = useMemo(() => run ? buildAgentPresentation(run, events, tools, now) : null, [events, now, run, tools]);
  const activityItems = useMemo(() => buildConversationActivityProjection(events, tools), [events, tools]);
  const liveNarrative = useMemo(() => {
    if (terminal || answerOnly) return '';
    return reconcileLiveNarrative(activityItems, streamingContent, streamingStep);
  }, [activityItems, answerOnly, streamingContent, streamingStep, terminal]);
  const status = terminalStatus(run, terminalMessage);
  const canExpand = Boolean(run && (activityItems.length || events.length || tools.length));
  const partial = Boolean(status === 'FAILED' && presentation && presentation.changedFiles > 0);
  const messageId = terminalMessage?.id ?? `agent-turn-${run?.id ?? 'historical'}`;
  const thinking = Boolean(run && !terminal && activityItems.length === 0 && !liveNarrative);

  return <section
    className={`message assistant agent-turn${answerOnly ? ' agent-answer' : ''}${terminal ? ' is-terminal' : ' is-running'}`}
    data-message-id={messageId}
    data-testid="message-assistant"
    data-agent-turn="true"
    data-agent-run-id={run?.id ?? terminalMessage?.invocation_id ?? ''}
    data-user-message-id={userMessageId ?? ''}
    data-agent-state={status ?? run?.status ?? 'RUNNING'}
    data-agent-kind={requestKind}
  >
    {answerOnly && <div className="agent-answer-body" data-testid="agent-answer">
      {(terminalMessage?.content || streamingContent) && (
        <MarkdownMessage content={terminalMessage?.content || streamingContent} streaming={!terminal} onCopyError={onCopyError} references={terminalMessage?.references ?? []} onOpenReference={onOpenReference} onOpenImage={onOpenImage}/>
      )}
    </div>}
    {!answerOnly && !terminal && run && presentation && <>
      <ConversationActivityStream items={activityItems} tools={tools} approval={approval} approvalSummary={approvalSummary} busy={busy} onDecision={onDecision} onOpenDetails={() => setDetailsOpen(true)} liveNarrative={liveNarrative}/>
      <AgentProgressSummary run={run} presentation={presentation} events={events} tools={tools} review={review} thinking={thinking} detailsOpen={detailsOpen} onToggleDetails={() => setDetailsOpen((value) => !value)} onResume={onResume} onReviewFile={onReviewFile} mcpRuntime={mcpRuntime} mcpBusyConnectionId={mcpBusyConnectionId} onActivateMcp={onActivateMcp}/>
    </>}
    {!answerOnly && terminal && status && (
      <AgentTerminalResult status={status} message={terminalMessage} presentation={presentation} tools={tools} canExpand={canExpand} partial={partial} review={review} executionDetail={run && presentation ? <CompletedActivityHistory items={activityItems} tools={tools}/> : null} onRetry={onRetry} onReview={onReview} onReviewFile={onReviewFile} onOpenReference={onOpenReference} onOpenImage={onOpenImage}/>
    )}
    {terminalMessage && onCopy && <footer className={`message-actions agent-turn-message-actions ${copied ? 'copy-confirmed' : ''}`}><button type="button" className={copied ? 'copied' : ''} aria-label={copied ? '消息已复制' : '复制消息'} title={copied ? '已复制' : '复制'} onClick={onCopy} data-testid="message-copy"><ShellIcon name={copied ? 'check' : 'copy'}/>{copied && <span role="status" aria-live="polite">已复制</span>}</button></footer>}
  </section>;
}
