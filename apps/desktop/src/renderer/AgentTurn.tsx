import { useEffect, useMemo, useState } from 'react';
import type { AgentEventView, AgentRunView, AgentToolCallView, ApprovalView, ConversationMessageView } from '@fielora/contracts';
import type { AgentReviewSummary } from './agent-review';
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
  onCancel?: () => void;
  onDecision?: (decision: 'DENY' | 'ALLOW_ONCE') => void;
  onRetry?: () => void;
  onReview?: () => void;
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

function AgentLiveActivity({ presentation, tools, review, paused, onCancel, onResume, onToggleSteps, expanded }: {
  presentation: AgentPresentation;
  tools: AgentToolCallView[];
  review: AgentReviewSummary | null;
  paused: boolean;
  onCancel?: () => void;
  onResume?: () => void;
  onToggleSteps: () => void;
  expanded: boolean;
}) {
  const evidence = activityEvidence(tools);
  const currentPhase = presentation.phases[presentation.activeStep - 1] ?? presentation.phases.find((phase) => phase.state === 'active');
  const changeSummary = review && review.files.length > 0
    ? `${review.files.length} 个文件 +${review.additions} −${review.deletions}`
    : presentation.changedFiles > 0 ? `${presentation.changedFiles} 个文件` : '';
  return <div className={`agent-live-activity${paused ? ' is-paused' : ''}`} data-testid="agent-live-activity">
    <div className="agent-live-status">
      <button type="button" onClick={onToggleSteps} aria-expanded={expanded} data-testid="agent-steps-toggle" data-step-current={presentation.activeStep} data-step-total={presentation.totalSteps}>
        <span className="agent-progress-orbit" aria-hidden="true"/>
        <span className="agent-step-count">第 {presentation.activeStep} / {presentation.totalSteps} 步</span>
        <strong>· {currentPhase?.label ?? presentation.headline}</strong>
        {changeSummary && <span>· {changeSummary}</span>}
        <span>· {presentation.elapsed}</span>
      </button>
      <div>{paused && onResume && <button type="button" onClick={onResume}>继续工作</button>}{!paused && onCancel && <button type="button" onClick={onCancel}>停止</button>}</div>
    </div>
    {evidence.length > 0 && <div className="agent-live-evidence">{evidence.map((item) => <span key={item}>{item}</span>)}</div>}
  </div>;
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

function InlineSteps({ run, presentation, events, tools }: {
  run: AgentRunView;
  presentation: AgentPresentation;
  events: AgentEventView[];
  tools: AgentToolCallView[];
}) {
  const stateLabel = { completed: '已完成', active: '正在进行', pending: '待处理', failed: '失败', blocked: '已阻止', skipped: '未执行' } as const;
  return <div className="agent-inline-steps" role="region" aria-label="Agent 工作步骤" data-testid="agent-inline-steps">
    {presentation.phases.length > 0 && <ol>{presentation.phases.map((phase, index) => <li className={`status-${phase.state}`} key={phase.id} data-step-state={phase.state} aria-current={phase.state === 'active' ? 'step' : undefined}>
      <i className="agent-step-marker" aria-label={stateLabel[phase.state]}><span aria-hidden="true"/></i>
      <span className="agent-step-label"><b>{index + 1}</b>{phase.label}</span>
      {['active', 'completed', 'failed', 'blocked'].includes(phase.state) && phase.detail && <small data-step-detail>{phase.detail}</small>}
    </li>)}</ol>}
    <details className="agent-turn-technical"><summary>技术信息</summary>
      {tools.length > 0 && <div>{tools.map((tool) => <p key={tool.id}><code>{toolTitle(tool.name)}</code><span>{toolDetail(tool)}</span></p>)}</div>}
      {events.length > 0 && <ol>{events.slice(-12).map((event) => <li key={event.id}><span>{event.sequence}</span>{technicalEventLabel(event.kind)}</li>)}</ol>}
      {run.error_code && <code>{run.error_code}</code>}
    </details>
  </div>;
}

function ResultText({ content }: { content: string }) {
  const paragraphs = content.split(/\r?\n\s*\r?\n/).map((value) => value.trim()).filter(Boolean);
  return <div className="agent-result-text">{paragraphs.map((paragraph, paragraphIndex) => <p key={`${paragraphIndex}-${paragraph.slice(0, 24)}`}>
    {paragraph.split(/(`[^`\r\n]+`)/g).filter(Boolean).map((segment, segmentIndex) => segment.startsWith('`') && segment.endsWith('`')
      ? <code key={segmentIndex}>{segment.slice(1, -1)}</code>
      : <span key={segmentIndex}>{segment}</span>)}
  </p>)}</div>;
}

function AgentTerminalResult({ status, message, presentation, tools, canExpand, expanded, partial, review, onToggleSteps, onRetry, onReview }: {
  status: AgentTerminalStatus;
  message: ConversationMessageView | null;
  presentation: AgentPresentation | null;
  tools: AgentToolCallView[];
  canExpand: boolean;
  expanded: boolean;
  partial: boolean;
  review: AgentReviewSummary | null;
  onToggleSteps: () => void;
  onRetry?: () => void;
  onReview?: () => void;
}) {
  const result = buildAgentResultViewModel(status, message?.content ?? '', presentation, tools);
  const completedSteps = presentation?.phases.filter((phase) => phase.state === 'completed').length ?? 0;
  return <div className="agent-terminal-result" data-testid="agent-terminal-result" data-result-outcome={presentation?.outcome ?? status}>
    <h2>{result.title}</h2>
    <div className="agent-terminal-body"><ResultText content={result.detail}/></div>
    <div className="agent-terminal-actions">
      {result.duration && <span className="agent-result-duration">{result.duration}</span>}
      {presentation && <span className="agent-result-step-summary">{completedSteps}/{presentation.totalSteps} 步</span>}
      {result.evidence.map((item) => <span className="agent-terminal-meta" key={item}>{item}</span>)}
      {canExpand && <button type="button" className="agent-text-action agent-step-action" onClick={onToggleSteps} aria-expanded={expanded} data-testid="agent-steps-toggle">{expanded ? '收起步骤' : '查看步骤'}</button>}
      {status === 'FAILED' && onRetry && <button type="button" className="agent-primary-action" onClick={onRetry} data-testid="agent-retry">{partial ? '继续完成' : '重新尝试'}</button>}
      {review && review.files.length > 0 && onReview && <button type="button" className="agent-text-action agent-review-action" onClick={onReview} data-testid="agent-change-review">查看修改</button>}
    </div>
  </div>;
}

export function AgentTurn({
  run, requestText = '', userMessageId, terminalMessage, events = [], tools = [], approval = null, approvalSummary = '', review = null,
  streamingContent = '', busy = false, copied = false, onResume, onCancel, onDecision, onRetry, onReview, onCopy, onCopyError,
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
    {!answerOnly && !terminal && presentation && <>
      <AgentNarrative presentation={presentation}/>
      {streamingContent && <div className="agent-discovery-narrative"><MarkdownMessage content={streamingContent} streaming onCopyError={onCopyError}/></div>}
      {approval && onDecision
        ? <AgentApproval tool={approvalTool} summary={approvalSummary} busy={busy} onDecision={onDecision} onToggleSteps={() => setExpanded((value) => !value)}/>
        : <AgentLiveActivity presentation={presentation} tools={tools} review={review} paused={run?.status === 'PAUSED'} onCancel={['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(run?.status ?? '') ? onCancel : undefined} onResume={onResume} onToggleSteps={() => canExpand && setExpanded((value) => !value)} expanded={expanded}/>
      }
    </>}
    {!answerOnly && terminal && status && (
      <AgentTerminalResult status={status} message={terminalMessage} presentation={presentation} tools={tools} canExpand={canExpand} expanded={expanded} partial={partial} review={review} onToggleSteps={() => setExpanded((value) => !value)} onRetry={onRetry} onReview={onReview}/>
    )}
    {!answerOnly && expanded && run && presentation && (
      <InlineSteps run={run} presentation={presentation} events={events} tools={tools}/>
    )}
    {terminalMessage && onCopy && <footer className={`message-actions agent-turn-message-actions ${copied ? 'copy-confirmed' : ''}`}><button type="button" className={copied ? 'copied' : ''} aria-label={copied ? '消息已复制' : '复制消息'} title={copied ? '已复制' : '复制'} onClick={onCopy} data-testid="message-copy"><ShellIcon name={copied ? 'check' : 'copy'}/>{copied && <span role="status" aria-live="polite">已复制</span>}</button></footer>}
  </section>;
}

function stripAnswerHeading(content: string): string {
  return content.replace(/^\s{0,3}#{1,6}\s+(?:回答|答案|Answer)\s*\r?\n(?:\s*\r?\n)?/iu, '').trim();
}
