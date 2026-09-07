import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentRunView, AgentToolCallView } from '@fielora/contracts';
import { activityFailureReason, activityNarrativePreview, activityToolDescription, resolveActivityFileLink } from './agent-activity-detail.ts';

const read = { name: 'read_file', status: 'COMPLETED', arguments: { path: 'src/login.js', line_start: 180, line_end: 280 }, receipt: { sha256: 'a'.repeat(64) } } as AgentToolCallView;

test('adjacent reads and searches remain distinguishable in collapsed operation rows', () => {
  assert.match(activityToolDescription(read), /180–280/);
  assert.match(activityToolDescription({ ...read, arguments: { path: 'src/login.js', line_start: 280, line_end: 450 } }), /280–450/);
  assert.match(activityToolDescription({ ...read, name: 'search_text', arguments: { path: 'src', query: 'initData' } }), /src.*initData/);
});

test('long analysis has a bounded original-text preview while concise progress stays visible', () => {
  assert.equal(activityNarrativePreview('正在检查登录后的初始化流程。'), null);
  const text = '正在检查初始化。\n\n```js\n' + 'const value = 1;\n'.repeat(50) + '```';
  assert.equal(activityNarrativePreview(text), '正在检查初始化。');
  assert.ok(activityNarrativePreview('分析'.repeat(500))!.length <= 181);
});

test('budget failure is explained from the persisted status without inventing a pause', () => {
  const run = { status: 'FAILED', current_step: 24, max_steps: 24, error_code: 'AGENT_MAX_STEPS_REACHED' } as AgentRunView;
  assert.match(activityFailureReason(run)!, /步数已用尽.*24\/24/);
  assert.equal(activityFailureReason({ ...run, status: 'RUNNING' }), null);
});

test('historical file links require same-run successful read evidence and preserve the SHA guard', () => {
  assert.deepEqual(resolveActivityFileLink('fielora-project-file:src/login.js#L180-L200', [read]), { path: 'src/login.js', expectedSha256: 'a'.repeat(64), lineStart: 180, lineEnd: 200 });
  for (const target of ['fielora-project-file:../secret', 'fielora-project-file:C:/secret', 'fielora-project-file:/secret', 'fielora-project-file:src/other.js', 'fielora-project-file:src/login.js#L200-L180', 'file:///src/login.js']) {
    assert.equal(resolveActivityFileLink(target, [read]), null);
  }
  assert.equal(resolveActivityFileLink('fielora-project-file:src/login.js', [{ ...read, status: 'FAILED' }]), null);
  assert.equal(resolveActivityFileLink('fielora-project-file:src/login.js', [{ ...read, receipt: null }]), null);
});
