import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererRoot = import.meta.dirname;
const workspace = readFileSync(path.join(rendererRoot, 'ProjectWorkspace.tsx'), 'utf8');
const turn = readFileSync(path.join(rendererRoot, 'AgentTurn.tsx'), 'utf8');
const review = readFileSync(path.join(rendererRoot, 'AgentHumanReview.tsx'), 'utf8');
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
  assert.match(turn, /data-testid="agent-live-activity"/);
  assert.match(turn, /data-testid="agent-terminal-result"/);
  assert.match(turn, /data-testid="agent-inline-steps"/);
});

test('legacy production activity and standalone result paths are absent', () => {
  const production = [workspace, turn, styles].join('\n');
  for (const legacy of [
    'AgentActivity', 'AgentChangeSummary', 'runActivity', 'agent-run-card', 'agent-process-toggle',
    'agent-activity-toggle', 'agent-operation-line', 'agent-result-actions', 'agent-change-summary',
  ]) assert.doesNotMatch(production, new RegExp(legacy));
  assert.doesNotMatch(turn, /已处理|已完成搜索代码|耗时/);
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
