import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererRoot = import.meta.dirname;
const workspace = readFileSync(path.join(rendererRoot, 'ProjectWorkspace.tsx'), 'utf8');
const turn = readFileSync(path.join(rendererRoot, 'AgentTurn.tsx'), 'utf8');
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
  ]) assert.doesNotMatch(production, new RegExp(legacy));
  assert.doesNotMatch(turn, /已处理|已完成搜索代码/);
});

test('narrative and live activity have distinct production responsibilities', () => {
  assert.match(turn, /agentOpeningNarrative\(presentation\)/);
  assert.match(turn, /activityEvidence\(tools\)/);
  assert.doesNotMatch(turn, /evidence\.push\(presentation\.narrative\)/);
  assert.match(turn, /evidence\.map/);
  assert.match(turn, /\.slice\(-2\)/);
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

test('polished steps collapse on completion and omit pending explanations', () => {
  assert.match(turn, /if \(terminal\) setExpanded\(false\)/);
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

test('action execution starts with thinking and only reveals a plan after real evidence', () => {
  assert.match(turn, /executionHasEvidence\(events, tools\)/);
  assert.match(turn, /now - run\.created_at < 2_200/);
  assert.match(turn, /data-execution-stage=\{thinking \? 'THINKING' : 'ACTIVE'\}/);
  assert.match(turn, /tools\.length > 0 \|\| events\.some/);
  assert.doesNotMatch(turn, /!answerOnly.*streamingContent.*agent-discovery-narrative/s);
});

test('execution status starts at the top-left of its AgentTurn and expands public rationale operations and steps', () => {
  assert.doesNotMatch(workspace, /agent-execution-layer|setExecutionHost|executionHost=\{/);
  assert.doesNotMatch(turn, /createPortal\(<AgentExecutionDock/);
  assert.match(turn, /!answerOnly && !terminal && run && presentation && <AgentExecutionDock/);
  assert.match(turn, /data-testid="agent-execution-status"/);
  assert.match(turn, /const statusLabel = thinking \? '正在思考'/);
  assert.doesNotMatch(turn, /className="agent-step-count"/);
  assert.match(turn, />工作说明</);
  assert.match(turn, />操作记录</);
  assert.match(turn, />步骤</);
  assert.match(turn, /toolTitle\(tool\.name\)/);
  assert.match(turn, /toolDetail\(tool\)/);
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

test('execution dock stays transparent and running composer actions use the active accent', () => {
  assert.match(styles, /\.agent-execution-dock-trigger \{[^}]*border: 1px solid transparent;[^}]*background: transparent;[^}]*box-shadow: none;/s);
  assert.match(styles, /\.agent-progress-orbit \{[^}]*width: 14px;[^}]*height: 14px;/s);
  assert.match(styles, /\.agent-step-marker \{[^}]*width: 15px;[^}]*height: 15px;/s);
  assert.match(tokens, /--fl-font-size-agent-execution:\s*calc\(14px \* var\(--fl-ui-font-scale\)\)/);
  const appearance = readFileSync(path.join(rendererRoot, 'styles', 'appearance.css'), 'utf8');
  assert.match(appearance, /\.conversation-composer \.composer-submit\.stop,\s*\.stop-button \{[^}]*background: var\(--fl-color-accent\)/s);
  assert.doesNotMatch(appearance, /\.composer-submit\.stop,[^}]*background: var\(--fl-color-danger\)/s);
  assert.match(workspace, /stop: <rect[^>]*fill="currentColor" stroke="none"/);
});

test('terminal duration leads the result and expands details before the result title', () => {
  assert.match(turn, /<button type="button" className="agent-terminal-runtime"[^>]*data-testid="agent-execution-detail-toggle"/);
  assert.match(turn, />耗时 \{result\.duration\}</);
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
  assert.match(turn, /\['PROPOSED', 'RUNNING', 'WAITING_APPROVAL'\]\.includes\(tool\.status\)/);
  assert.match(turn, /再显示 \{remaining\} 个文件/);
  assert.match(styles, /\.agent-live-files small b[^}]*var\(--fl-color-text-success\)/);
  assert.match(styles, /\.agent-live-files small i[^}]*var\(--fl-color-text-danger\)/);
});
