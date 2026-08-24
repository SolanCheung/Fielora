import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AgentEventView, AgentRunView, AgentToolCallView, ApprovalView, ConversationMessageView } from '@fielora/contracts';
import { appliedAgentReview, type AgentReviewSummary } from './agent-review';
import {
  agentOpeningNarrative,
  agentRequestKind,
  approvalActionLabel,
  buildAgentResultViewModel,
  buildAgentPresentation,
  toolDetail,
  toolTitle,
  type AgentPresentation,
  type AgentTerminalStatus,
} from './agent-presentation';
import { MarkdownMessage } from './MarkdownMessage';
import { ShellIcon } from './PrimaryNav';

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
  busy?: boolean;
  copied?: boolean;
  onResume?: () => void;
  onDecision?: (decision: 'DENY' | 'ALLOW_ONCE') => void;
  onRetry?: () => void;
  onReview?: () => void;
  onReviewFile?: (path: string) => void;
  onCopy?: () => void;
  onCopyError?: (reason: string) => void;
}

function isTerminalRun(run: AgentRunView | null): boolean {
  return Boolean(run && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status));
}

function terminalStatus(run: AgentRunView | null, message: ConversationMessageView | null): AgentTerminalStatus | null {
  if (run && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) return run.status as AgentTerminalStatus;
  return message?.status ?? null;
}

function technicalEventLabel(kind: string): string {
  const labels: Record<string, string> = {
    RUN_CREATED: '创建任务', RUN_STARTED: '开始任务', RUN_PAUSED: '暂停任务', RUN_RESUMED: '继续任务',
    PHASE_CHANGED: '更新工作阶段', CONTEXT_COMPILED: '准备项目上下文', STEP_STARTED: '开始下一步',
    MODEL_STARTED: '分析任务', MODEL_COMPLETED: '完成分析', MODEL_FAILED: '模型服务未完成本次请求',
    TOOL_PROPOSED: '提出工具操作', APPROVAL_REQUESTED: '请求操作批准', APPROVAL_RESOLVED: '记录批准结果',
    TOOL_STARTED: '开始执行工具', TOOL_COMPLETED: '完成工具操作', TOOL_FAILED: '工具执行失败',
    RUN_COMPLETED: '完成任务', RUN_FAILED: '任务失败', RUN_CANCELLED: '停止任务',
    VERIFICATION_RECORDED: '记录验证结果', CHECKPOINT_CREATED: '保存工作检查点', RECOVERY_RECONCILED: '恢复工作状态',
  };
  return labels[kind] ?? kind.replaceAll('_', ' ').toLowerCase();
}

function toolEvidence(tool: AgentToolCallView): string {
  return toolDetail(tool);
}

function activityEvidence(tools: AgentToolCallView[]): string[] {
  const active = tools.filter((tool) => ['RUNNING', 'WAITING_APPROVAL'].includes(tool.status));
  const candidates = active.length > 0 ? active : tools.slice(-2);
  return [...candidates].reverse().map(toolEvidence).filter((value, index, values) => value && values.indexOf(value) === index).slice(0, 2).reverse();
}

function AgentNarrative({ presentation }: { presentation: AgentPresentation }) {
  return <p className="agent-narrative" data-testid="agent-narrative">{agentOpeningNarrative(presentation)}</p>;
}

function executionHasEvidence(events: AgentEventView[], tools: AgentToolCallView[]): boolean {
  return tools.length > 0 || events.some((event) => [
    'TOOL_PROPOSED', 'APPROVAL_REQUESTED', 'TOOL_STARTED', 'TOOL_COMPLETED', 'TOOL_FAILED', 'VERIFICATION_RECORDED',
  ].includes(event.kind));
}

function isMeaningfulExecutionText(value: string): boolean {
  return Boolean(value.trim()) && !/^[\s.,，。·…:：;；—–-]+$/.test(value);
}

function operationStatus(tool: AgentToolCallView): string {
  if (tool.status === 'COMPLETED') return '已完成';
  if (tool.status === 'FAILED') return '未完成';
  if (tool.status === 'WAITING_APPROVAL') return '等待批准';
  if (tool.status === 'RUNNING') return '正在执行';
  return '准备执行';
}

function ExecutionSteps({ presentation }: { presentation: AgentPresentation }) {
  const stateLabel = { completed: '已完成', active: '正在进行', pending: '待处理', failed: '失败', blocked: '已阻止', skipped: '未执行' } as const;
  return <ol className="agent-execution-steps" data-testid="agent-execution-steps">{presentation.phases.map((phase, index) => <li className={`status-${phase.state}`} key={phase.id} data-step-state={phase.state} aria-current={phase.state === 'active' ? 'step' : undefined}>
    <i className="agent-step-marker" aria-label={stateLabel[phase.state]}><span aria-hidden="true"/></i>
    <span className="agent-step-label"><b>{index + 1}</b>{phase.label}</span>
    {['active', 'completed', 'failed', 'blocked'].includes(phase.state) && phase.detail && isMeaningfulExecutionText(phase.detail) && <small data-step-detail>{phase.detail}</small>}
  </li>)}</ol>;
}

function ExecutionDetail({ run, presentation, events, tools, variant }: {
  run: AgentRunView;
  presentation: AgentPresentation;
  events: AgentEventView[];
  tools: AgentToolCallView[];
  variant: 'dock' | 'inline';
}) {
  return <section className={`agent-execution-detail is-${variant}`} data-testid="agent-execution-detail" aria-label="公开执行详情">
    <div className="agent-execution-section">
      <h3>工作说明</h3>
      <p>{presentation.narrative}</p>
      {presentation.summary.slice(0, 2).map((item) => <p className="agent-execution-evidence" key={item}>{item}</p>)}
    </div>
    {tools.length > 0 && <div className="agent-execution-section">
      <h3>操作记录</h3>
      <ol className="agent-operation-timeline">{tools.map((tool) => <li key={tool.id} data-tool-status={tool.status}>
        <i aria-hidden="true"/><span><strong>{toolTitle(tool.name)}</strong><small>{toolDetail(tool)}</small></span><em>{operationStatus(tool)}</em>
      </li>)}</ol>
    </div>}
    <div className="agent-execution-section">
      <h3>步骤</h3>
      <ExecutionSteps presentation={presentation}/>
    </div>
    <details className="agent-turn-technical"><summary>技术信息</summary>
      {tools.length > 0 && <div>{tools.map((tool) => <p key={tool.id}><code>{toolTitle(tool.name)}</code><span>{toolDetail(tool)}</span></p>)}</div>}
      {events.length > 0 && <ol>{events.slice(-12).map((event) => <li key={event.id}><span>{event.sequence}</span>{technicalEventLabel(event.kind)}</li>)}</ol>}
      {run.error_code && <code>{run.error_code}</code>}
    </details>
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

function AgentExecutionDock({ run, presentation, events, tools, review, thinking, expanded, onToggle, onResume, onReviewFile }: {
  run: AgentRunView;
  presentation: AgentPresentation;
  events: AgentEventView[];
  tools: AgentToolCallView[];
  review: AgentReviewSummary | null;
  thinking: boolean;
  expanded: boolean;
  onToggle: () => void;
  onResume?: () => void;
  onReviewFile?: (path: string) => void;
}) {
  const evidence = activityEvidence(tools).filter(isMeaningfulExecutionText);
  const editedReview = appliedAgentReview(review);
  const filesStable = !tools.some((tool) => ['WORKSPACE_WRITE', 'DESTRUCTIVE'].includes(tool.effect) && ['PROPOSED', 'RUNNING', 'WAITING_APPROVAL'].includes(tool.status));
  const changeSummary = editedReview && editedReview.files.length > 0
    ? `${editedReview.files.length} 个文件已更改 +${editedReview.additions} −${editedReview.deletions}`
    : presentation.changedFiles > 0 ? `${presentation.changedFiles} 个文件` : '';
  const statusLabel = thinking ? '正在思考' : run.status === 'WAITING_APPROVAL' ? '等待确认' : run.status === 'PAUSED' ? '已暂停' : '正在执行';
  return <aside className={`agent-execution-dock${expanded ? ' is-expanded' : ''}${thinking ? ' is-thinking' : ''}`} data-testid="agent-execution-status" data-execution-stage={thinking ? 'THINKING' : 'ACTIVE'}>
    <button type="button" className="agent-execution-dock-trigger" onClick={onToggle} aria-expanded={expanded} data-testid="agent-execution-dock-trigger" data-step-current={presentation.activeStep} data-step-total={presentation.totalSteps}>
        <span className="agent-progress-orbit" aria-hidden="true"/>
        <strong>{statusLabel}</strong>
        <span>· {presentation.elapsed}</span>
        {changeSummary && <span>· {changeSummary}</span>}
        <ShellIcon name="chevronDown"/>
    </button>
    <div className="agent-execution-popover" data-testid="agent-execution-popover">
      {thinking
        ? <div className="agent-thinking-detail"><span className="agent-thinking-dots" aria-hidden="true"><i/><i/><i/></span><small>正在准备任务上下文</small></div>
        : <ExecutionDetail run={run} presentation={presentation} events={events} tools={tools} variant="dock"/>}
      {!thinking && editedReview && editedReview.files.length > 0 && <LiveEditedFiles review={editedReview} stable={filesStable} onReviewFile={onReviewFile}/>}
      {!thinking && evidence.length > 0 && <div className="agent-live-evidence">{evidence.map((item) => <span key={item}>{item}</span>)}</div>}
      {!thinking && run.status === 'PAUSED' && onResume && <button type="button" className="agent-resume-action" onClick={onResume}>继续工作</button>}
    </div>
  </aside>;
}

function AgentApproval({ tool, summary, busy, onDecision, onToggleSteps }: {
  tool: AgentToolCallView | null;
  summary: string;
  busy: boolean;
  onDecision: (decision: 'DENY' | 'ALLOW_ONCE') => void;
  onToggleSteps: () => void;
}) {
  return <section className="agent-turn-approval" data-testid="agent-approval">
    <p>我已经定位到需要执行的下一步。</p>
    <p>{summary || (tool ? `${toolTitle(tool.name)} · ${toolDetail(tool)}` : '只会执行当前列出的操作，不会扩大范围。')}</p>
    <div><button type="button" onClick={onToggleSteps}>查看修改范围</button><button type="button" onClick={() => onDecision('DENY')} disabled={busy}>拒绝</button><button type="button" className="agent-primary-action" onClick={() => onDecision('ALLOW_ONCE')} disabled={busy} data-testid="agent-allow-once">{approvalActionLabel(tool)}</button></div>
  </section>;
}

function ResultText({ content }: { content: string }) {
  const paragraphs = content.split(/\r?\n\s*\r?\n/).map((value) => value.trim()).filter(Boolean);
  return <div className="agent-result-text">{paragraphs.map((paragraph, paragraphIndex) => <p key={`${paragraphIndex}-${paragraph.slice(0, 24)}`}>
    {paragraph.split(/(`[^`\r\n]+`)/g).filter(Boolean).map((segment, segmentIndex) => segment.startsWith('`') && segment.endsWith('`')
      ? <code key={segmentIndex}>{segment.slice(1, -1)}</code>
      : <span key={segmentIndex}>{segment}</span>)}
  </p>)}</div>;
}

function fileName(path: string): string {
  return path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path;
}

function ChangedFiles({ review, onReview, onReviewFile }: {
  review: AgentReviewSummary;
  onReview?: () => void;
  onReviewFile?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
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

function AgentTerminalResult({ status, message, presentation, tools, canExpand, partial, review, executionDetail, onRetry, onReview, onReviewFile }: {
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
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const result = buildAgentResultViewModel(status, message?.content ?? '', presentation, tools);
  const completedSteps = status === 'COMPLETED'
    ? presentation?.totalSteps ?? 0
    : presentation?.phases.filter((phase) => phase.state === 'completed').length ?? 0;
  const editedReview = appliedAgentReview(review);
  return <div className="agent-terminal-result" data-testid="agent-terminal-result" data-result-outcome={presentation?.outcome ?? status}>
    {result.duration && (canExpand
      ? <button type="button" className="agent-terminal-runtime" aria-expanded={detailOpen} data-testid="agent-execution-detail-toggle" onClick={() => setDetailOpen((value) => !value)}><span>耗时 {result.duration}</span><ShellIcon name="chevronDown"/></button>
      : <div className="agent-terminal-runtime"><span>耗时 {result.duration}</span></div>)}
    {detailOpen && executionDetail}
    <h2>{result.title}</h2>
    <div className="agent-terminal-body"><ResultText content={result.detail}/></div>
    {editedReview && editedReview.files.length > 0 && <ChangedFiles review={editedReview} onReview={onReview} onReviewFile={onReviewFile}/>}
    <div className="agent-terminal-actions">
      {presentation && <span className="agent-result-step-summary">{completedSteps}/{presentation.totalSteps} 步</span>}
      {result.evidence.map((item) => <span className="agent-terminal-meta" key={item}>{item}</span>)}
      {status === 'FAILED' && onRetry && <button type="button" className="agent-primary-action" onClick={onRetry} data-testid="agent-retry">{partial ? '继续完成' : '重新尝试'}</button>}
    </div>
  </div>;
}

export function AgentTurn({
  run, requestText = '', userMessageId, terminalMessage, events = [], tools = [], approval = null, approvalSummary = '', review = null,
  streamingContent = '', busy = false, copied = false, onResume, onDecision, onRetry, onReview, onReviewFile, onCopy, onCopyError,
}: AgentTurnProps) {
  const terminal = Boolean(terminalMessage) || isTerminalRun(run);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!run || terminal) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [run, terminal]);
  useEffect(() => {
    if (terminal) setExpanded(false);
  }, [terminal]);
  const presentation = useMemo(() => run ? buildAgentPresentation(run, events, tools, now) : null, [events, now, run, tools]);
  const status = terminalStatus(run, terminalMessage);
  const canExpand = Boolean(run && (presentation?.phases.length || events.length || tools.length));
  const approvalTool = approval ? tools.find((tool) => tool.id === approval.tool_call_id) ?? null : null;
  const partial = Boolean(status === 'FAILED' && presentation && presentation.changedFiles > 0);
  const messageId = terminalMessage?.id ?? `agent-turn-${run?.id ?? 'historical'}`;
  const requestKind = agentRequestKind(run?.task ?? requestText);
  const answerOnly = requestKind === 'ANSWER';
  const thinking = Boolean(run && !terminal && (!executionHasEvidence(events, tools) || now - run.created_at < 2_200));

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
        <MarkdownMessage content={stripAnswerHeading(terminalMessage?.content || streamingContent)} streaming={!terminal} onCopyError={onCopyError}/>
      )}
    </div>}
    {!answerOnly && !terminal && run && presentation && <AgentExecutionDock run={run} presentation={presentation} events={events} tools={tools} review={review} thinking={thinking} expanded={expanded} onToggle={() => setExpanded((value) => !value)} onResume={onResume} onReviewFile={onReviewFile}/>}
    {!answerOnly && !terminal && presentation && !thinking && <>
      <AgentNarrative presentation={presentation}/>
      {approval && onDecision && <AgentApproval tool={approvalTool} summary={approvalSummary} busy={busy} onDecision={onDecision} onToggleSteps={() => setExpanded((value) => !value)}/>}
    </>}
    {!answerOnly && terminal && status && (
      <AgentTerminalResult status={status} message={terminalMessage} presentation={presentation} tools={tools} canExpand={canExpand} partial={partial} review={review} executionDetail={run && presentation ? <ExecutionDetail run={run} presentation={presentation} events={events} tools={tools} variant="inline"/> : null} onRetry={onRetry} onReview={onReview} onReviewFile={onReviewFile}/>
    )}
    {terminalMessage && onCopy && <footer className={`message-actions agent-turn-message-actions ${copied ? 'copy-confirmed' : ''}`}><button type="button" className={copied ? 'copied' : ''} aria-label={copied ? '消息已复制' : '复制消息'} title={copied ? '已复制' : '复制'} onClick={onCopy} data-testid="message-copy"><ShellIcon name={copied ? 'check' : 'copy'}/>{copied && <span role="status" aria-live="polite">已复制</span>}</button></footer>}
  </section>;
}

function stripAnswerHeading(content: string): string {
  return content.replace(/^\s{0,3}#{1,6}\s+(?:回答|答案|Answer)\s*\r?\n(?:\s*\r?\n)?/iu, '').trim();
}
