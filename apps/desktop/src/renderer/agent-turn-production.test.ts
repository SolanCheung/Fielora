import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererRoot = import.meta.dirname;
const workspace = readFileSync(path.join(rendererRoot, 'ProjectWorkspace.tsx'), 'utf8');
const turn = readFileSync(path.join(rendererRoot, 'AgentTurn.tsx'), 'utf8');
const projection = readFileSync(path.join(rendererRoot, 'agent-activity-projection.ts'), 'utf8');
const review = readFileSync(path.join(rendererRoot, 'AgentHumanReview.tsx'), 'utf8');
const reviewSource = readFileSync(path.join(rendererRoot, 'agent-review.ts'), 'utf8');
const tokens = readFileSync(path.join(rendererRoot, 'styles/tokens.css'), 'utf8');
const styles = [
  readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8'),
  readFileSync(path.join(rendererRoot, 'styles/appearance.css'), 'utf8'),
].join('\n');

test('production conversation has one turn-owned agent presentation path', () => {
  assert.match(workspace, /<AgentTurn/);
  assert.match(workspace, /agentTurn\?\.userMessageId === message\.id/);
  assert.match(workspace, /agentRunIdRef\.current = started\.id; agentEventsRef\.current = \[\]; agentToolsRef\.current = \[\]/);
  assert.match(workspace, /agentRunIdRef\.current !== run\.id && activeRunId !== run\.id/);
  assert.match(turn, /data-agent-turn="true"/);
  assert.match(turn, /data-agent-kind=\{requestKind\}/);
  assert.match(turn, /data-testid="agent-answer"/);
  assert.match(turn, /!answerOnly && !terminal/);
  assert.match(turn, /data-agent-run-id=/);
  assert.match(turn, /data-user-message-id=/);
  assert.match(turn, /data-testid="agent-execution-status"/);
  assert.match(turn, /data-testid="agent-terminal-result"/);
  assert.match(turn, /data-testid="agent-execution-detail"/);
});

test('legacy production activity and standalone result paths are absent', () => {
  const production = [workspace, turn, styles].join('\n');
  for (const legacy of [
    'AgentActivity', 'AgentChangeSummary', 'runActivity', 'agent-run-card', 'agent-process-toggle',
    'agent-activity-toggle', 'agent-operation-line', 'agent-result-actions', 'agent-change-summary',
    'agent-execution-popover', 'agent-execution-dock',
  ]) assert.doesNotMatch(production, new RegExp(legacy));
  assert.doesNotMatch(turn, /已处理|已完成搜索代码/);
});

test('durable events project into one chronological conversation activity stream', () => {
  assert.match(turn, /buildConversationActivityProjection\(events, tools\)/);
  assert.match(turn, /data-testid="conversation-activity-stream"/);
  assert.match(turn, /data-activity-sequence=\{item\.sequence\}/);
  assert.match(turn, /data-activity-entry=\{entry\.kind\.toLowerCase\(\)\}/);
  assert.match(projection, /\[\.\.\.events\]\.sort\(\(left, right\) => left\.sequence - right\.sequence\)/);
  assert.match(projection, /event\.kind === 'TOOL_PROPOSED'/);
  assert.match(projection, /event\.kind === 'VERIFICATION_RECORDED'/);
  assert.match(projection, /event\.kind === 'APPROVAL_REQUESTED'/);
  assert.doesNotMatch(turn, /AgentNarrative|agentOpeningNarrative\(presentation\)/);
});

test('terminal hierarchy and human review use shared production tokens', () => {
  assert.match(tokens, /--fl-font-size-agent-title:\s*calc\(17px \* var\(--fl-ui-font-scale\)\)/);
  assert.match(tokens, /--fl-font-weight-result-title:\s*600/);
  assert.match(tokens, /--fl-font-size-agent-result-evidence:\s*calc\(13px \* var\(--fl-ui-font-scale\)\)/);
  assert.match(tokens, /--fl-font-size-agent-result-action:\s*calc\(13px \* var\(--fl-ui-font-scale\)\)/);
  assert.match(tokens, /--fl-color-icon:/);
  assert.match(tokens, /--fl-color-icon-muted:/);
  assert.match(review, /useState<'VISUAL' \| 'RAW'>/);
  assert.match(review, /reviewDisplayFor\(selected\)/);
  assert.match(review, /mode === 'VISUAL'/);
  assert.match(review, /mode === 'RAW'/);
  assert.doesNotMatch(review, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i);

  const baseStyles = readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8');
  const agentStyles = baseStyles.slice(baseStyles.indexOf('.agent-turn {'), baseStyles.indexOf('@keyframes agent-pulse'));
  const reviewStyles = baseStyles.slice(baseStyles.indexOf('.agent-review {'), baseStyles.indexOf('.terminal-workspace {'));
  assert.doesNotMatch(agentStyles, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i);
  assert.doesNotMatch(reviewStyles, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i);
});

test('completed steps use the shared quiet marker instead of checkmark glyphs and review adapts below desktop-wide width', () => {
  assert.doesNotMatch(turn, /[✓✔✅]/u);
  assert.match(turn, /className="agent-step-marker"/);
  assert.match(styles, /\.status-completed \.agent-step-marker > span/);
  assert.match(styles, /@media \(max-width: 1439px\)/);
  assert.match(styles, /\.project-layout\.agent-review-open \.workspace-panel \{ position: absolute;[^}]*grid-column: 3 \/ -1/);
  assert.doesNotMatch([workspace, styles].join('\n'), /message-navigator/);
});

test('full plan is details-only and completed work remains collapsed', () => {
  assert.match(turn, /const \[detailsOpen, setDetailsOpen\] = useState\(false\)/);
  assert.match(turn, /if \(terminal\) setDetailsOpen\(false\)/);
  assert.match(turn, /detailsOpen && <div className="agent-run-details"/);
  assert.match(turn, /data-testid="agent-progress-summary"/);
  assert.match(turn, /\['active', 'completed', 'failed', 'blocked'\]\.includes\(phase\.state\)/);
  assert.match(turn, /\{completedSteps\}\/\{presentation\.totalSteps\} 步/);
  assert.doesNotMatch(turn, /phase\.state === 'pending'.*<small/s);
});

test('single create review removes the duplicate file row and small modify uses inline diff', () => {
  assert.match(review, /review\.files\.length > 1 && <div className="human-review-files"/);
  assert.match(review, /selected\.changeType !== 'CREATE' && <h3>/);
  assert.match(review, /data-human-diff-layout="inline"/);
  assert.match(styles, /\.human-inline-diff/);
});

test('action execution starts with a factual preparation state and never invents model progress', () => {
  assert.match(turn, /activityItems\.length === 0/);
  assert.match(turn, /data-execution-stage=\{thinking \? 'THINKING' : 'ACTIVE'\}/);
  assert.match(turn, /正在准备任务上下文/);
  assert.match(projection, /event\.kind !== 'MODEL_TEXT_DELTA'/);
  assert.match(projection, /text_delta/);
  assert.doesNotMatch(turn, /!answerOnly.*streamingContent.*agent-discovery-narrative/s);
});

test('running presentation is activity-first while dashboard sections stay behind Run Details', () => {
  assert.doesNotMatch(workspace, /agent-execution-layer|setExecutionHost|executionHost=\{/);
  assert.match(turn, /<ConversationActivityStream items=\{activityItems\}/);
  assert.match(turn, /<AgentProgressSummary run=\{run\}/);
  assert.match(turn, /data-testid="agent-execution-status"/);
  assert.match(turn, /data-testid="agent-run-details"/);
  assert.match(turn, /const statusLabel = thinking \? '正在思考'/);
  assert.match(turn, /第 \{presentation\.activeStep\} \/ \{presentation\.totalSteps\} 步/);
  const activityStart = turn.indexOf('function ConversationActivityStream');
  const activityEnd = turn.indexOf('function AgentProgressSummary', activityStart);
  const activitySource = turn.slice(activityStart, activityEnd);
  assert.doesNotMatch(activitySource, />操作记录|>步骤|技术信息|本轮已更改文件/);
  assert.match(turn, />操作记录</);
  assert.match(turn, />步骤</);
  assert.match(turn, /toolTitle\(tool\.name\)/);
  assert.match(turn, /toolDetail\(tool\)/);
  assert.match(turn, /activityTimestamp\(entry\.completedAt/);
  assert.match(turn, /className="agent-completion-time" role="tooltip"/);
  assert.match(turn, /<summary>技术信息<\/summary>/);
  assert.equal(turn.match(/<MarkdownMessage/g)?.length, 1);
});

test('composer queues steering without parallel runs and keeps an explicit user turn status', () => {
  assert.match(workspace, /if \(activeAgentRef\.current\) \{ await queueFollowUp\(content\); return; \}/);
  assert.match(workspace, /data-testid="queued-follow-up-status"/);
  assert.match(workspace, /data-after-run-id=\{queuedFollowUp\.afterRunId\}/);
  assert.match(workspace, /if \(!project \|\| !conversation \|\| activeAgentRef\.current \|\| !agentRunIsTerminal\) return/);
  assert.match(workspace, /data-testid="send-steering"/);
  assert.match(workspace, /data-testid="stop-agent-secondary"/);
  assert.match(workspace, /data-testid="stop-agent"/);
});

test('auto follow can be paused by scrolling and restored to the active task', () => {
  assert.match(workspace, /atLatestAnswerRef\.current = next/);
  assert.match(workspace, /if \(atLatestAnswerRef\.current\)/);
  assert.match(workspace, /setHasUnseenActivity\(true\)/);
  assert.match(workspace, /className="latest-answer-ellipsis"/);
  assert.match(workspace, /'跳转到当前任务底部'/);
  assert.doesNotMatch(workspace, />返回当前任务</);
  assert.match(workspace, /scrollToLatestAnswer\(\);/);
  assert.match(workspace, /data-testid="jump-to-latest"/);
});

test('terminal result expands changed files and routes an exact file into Human Review', () => {
  assert.match(turn, /data-testid="agent-result-changed-files"/);
  assert.match(turn, /data-testid="agent-inline-files-expanded"/);
  assert.match(turn, /已编辑 \{review\.files\.length\} 个文件/);
  assert.match(turn, /review\.files\.slice\(0, previewLimit\)/);
  assert.match(turn, /再显示 \$\{remainingFiles\} 个文件/);
  assert.match(turn, /data-review-path=\{file\.path\}/);
  assert.match(turn, /onReviewFile\?\.\(file\.path\)/);
  assert.match(workspace, /onReviewFile=\{\(path\) => openAgentReview\(path\)\}/);
  assert.match(workspace, /selectedPathHint=\{agentReviewPath\}/);
  assert.match(review, /selectedPathHint/);
  assert.match(workspace, /function HistoricalAgentTurn/);
  assert.match(workspace, /window\.fielora\.agent\.toolCalls\(\{ run_id: runId \}\)/);
  assert.match(workspace, /historicalReview\?\.review \?\? agentReview/);
});

test('activity visual language has no normal status dots, counts, completion badges or warning background', () => {
  const activityStart = turn.indexOf('function ActivityGroup');
  const activityEnd = turn.indexOf('function ActivityApprovalRecord', activityStart);
  const activitySource = turn.slice(activityStart, activityEnd);
  const activityStylesStart = styles.indexOf('.conversation-activity-stream {');
  const activityStylesEnd = styles.indexOf('.agent-live-files {', activityStylesStart);
  const activityStyles = styles.slice(activityStylesStart, activityStylesEnd);
  assert.match(activitySource, /<ShellIcon name=\{activityIcon\(item\.groupKind\)\}/);
  assert.doesNotMatch(activitySource, /<i aria-hidden|item\.entries\.length\} 项|>已完成</);
  assert.doesNotMatch(activityStyles, /conversation-activity-entries > li > i|conversation-activity-group \{[^}]*border-left|surface-warning|color-warning/s);
  assert.match(activityStyles, /\.conversation-activity-stream \{[^}]*background: transparent;/s);
  assert.match(activityStyles, /\.conversation-activity-group \{[^}]*background: transparent;/s);
  assert.match(activityStyles, /\.agent-progress-summary \{[^}]*background: transparent;/s);
  assert.match(activityStyles, /\.agent-progress-summary-trigger \{[^}]*border-top: 1px solid var\(--fl-color-border-soft\);[^}]*background: transparent;[^}]*box-shadow: none;/s);
  assert.doesNotMatch(turn, /agent-progress-orbit/);
  assert.match(turn, /agent-progress-symbol/);
});

test('activity presentation filters runtime terminology and progressively reveals long groups', () => {
  assert.match(turn, /tool\.name === 'delegate_readonly'[^\n]*title: '检查了项目结构'[^\n]*detail: ''/);
  assert.match(turn, /if \(!knownNames\.has\(tool\.name\)\)/);
  assert.match(turn, /const previewLimit = 5/);
  assert.match(turn, /item\.entries\.slice\(0, previewLimit\)/);
  assert.match(turn, /`查看另外 \$\{remaining\} 项`/);
  assert.match(projection, /if \(event\.kind === 'PHASE_CHANGED'\) \{\s*currentGroup = null;\s*continue;/s);
  assert.match(projection, /if \(receiptToolId && projectedToolIds\.has\(receiptToolId\)\) continue/);
});

test('activity uses the conversation scroll only and running composer actions keep the active accent', () => {
  assert.match(styles, /\.conversation-activity-stream \{[^}]*overflow: visible;/s);
  assert.match(styles, /\.agent-run-details \{[^}]*overflow: visible;/s);
  assert.doesNotMatch(styles, /\.(?:conversation-activity-stream|agent-run-details) \{[^}]*(?:max-height|height:\s*\d|overflow(?:-y)?:\s*(?:auto|scroll))/s);
  assert.match(styles, /\.message-list \{[^}]*overflow: auto;/s);
  assert.doesNotMatch(styles, /\.agent-execution-(?:popover|dock)\b/);
  assert.match(styles, /\.agent-step-marker \{[^}]*width: 15px;[^}]*height: 15px;/s);
  assert.match(styles, /li:hover > \.agent-completion-time/);
  assert.match(tokens, /--fl-font-size-agent-execution:\s*calc\(14px \* var\(--fl-ui-font-scale\)\)/);
  const appearance = readFileSync(path.join(rendererRoot, 'styles', 'appearance.css'), 'utf8');
  assert.match(appearance, /\.conversation-composer \.composer-submit\.stop,\s*\.stop-button \{[^}]*background: var\(--fl-color-accent\)/s);
  assert.doesNotMatch(appearance, /\.composer-submit\.stop,[^}]*background: var\(--fl-color-danger\)/s);
  assert.match(workspace, /stop: <rect[^>]*fill="currentColor" stroke="none"/);
});

test('terminal duration leads the result and expands the same lightweight activity history before the result title', () => {
  assert.match(turn, /<button type="button" className="agent-terminal-runtime"[^>]*data-testid="agent-execution-detail-toggle"/);
  assert.match(turn, />耗时 \{result\.duration\}</);
  assert.match(turn, /function CompletedActivityHistory/);
  assert.match(turn, /className="agent-execution-detail is-history"/);
  assert.match(turn, /<CompletedActivityHistory items=\{activityItems\} tools=\{tools\}\/>/);
  const terminalRuntime = turn.indexOf('<button type="button" className="agent-terminal-runtime"');
  const terminalDetail = turn.indexOf('{detailOpen && executionDetail}', terminalRuntime);
  const terminalTitle = turn.indexOf('<h2>', terminalDetail);
  assert.ok(terminalRuntime >= 0 && terminalRuntime < terminalDetail && terminalDetail < terminalTitle);
  assert.doesNotMatch(turn, /agent-execution-detail-action/);
  assert.match(styles, /\.agent-terminal-runtime \{[^}]*border-bottom: 1px solid var\(--fl-color-divider\)/s);
});

test('live edited files reuse applied Agent Review data and remain identical in the terminal result', () => {
  assert.match(turn, /appliedAgentReview\(review\)/);
  assert.match(reviewSource, /review\.files\.filter\(\(file\) => file\.state === 'APPLIED'\)/);
  assert.match(turn, /data-testid="agent-live-edited-files"/);
  assert.match(turn, /data-live-review-path=\{file\.path\}/);
  assert.match(turn, /editedReview && editedReview\.files\.length > 0 && <LiveEditedFiles/);
  assert.match(turn, /editedReview && editedReview\.files\.length > 0 && <ChangedFiles/);
  assert.match(turn, /detailsOpen && <div className="agent-run-details"/);
  assert.match(turn, /\['PROPOSED', 'RUNNING', 'WAITING_APPROVAL'\]\.includes\(tool\.status\)/);
  assert.match(turn, /再显示 \{remaining\} 个文件/);
  assert.match(styles, /\.agent-live-files small b, \.agent-live-files small i[^}]*var\(--fl-color-text-muted\)/);
  assert.match(styles, /\.agent-live-files small i[^}]*font-style: normal/);
});
