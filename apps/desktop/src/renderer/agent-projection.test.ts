import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentEventView } from '@fielora/contracts';
import { AGENT_PROJECTION_UNAVAILABLE_MESSAGE, mergeAgentEventPages } from './agent-projection.ts';

function event(id: string, sequence: number): AgentEventView {
  return {
    id,
    run_id: 'run-1',
    sequence,
    schema_version: 1,
    kind: 'STEP_STARTED',
    payload: {},
    created_at: sequence,
  };
}

test('incremental event pages are ordered and de-duplicated', () => {
  const current = [event('event-1', 1), event('event-2', 2)];
  const merged = mergeAgentEventPages(current, [event('event-2', 2), event('event-3', 3)]);
  assert.deepEqual(merged.map((item) => item.id), ['event-1', 'event-2', 'event-3']);
});

test('projection failure copy does not expose transport errors or claim the run failed', () => {
  assert.equal(AGENT_PROJECTION_UNAVAILABLE_MESSAGE, '运行记录暂时无法更新，Agent 仍会继续工作。');
  assert.doesNotMatch(AGENT_PROJECTION_UNAVAILABLE_MESSAGE, /FIPC|timed out|失败|停止/);
});
