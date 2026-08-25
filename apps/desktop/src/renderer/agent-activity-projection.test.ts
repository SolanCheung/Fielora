import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentEventKind, AgentEventView, AgentToolCallView } from '@fielora/contracts';
import { buildConversationActivityProjection } from './agent-activity-projection.ts';

function event(sequence: number, kind: AgentEventKind, payload: Record<string, unknown> = {}): AgentEventView {
  return { id: `event-${sequence}`, run_id: 'run-1', sequence, schema_version: 1, kind, payload, created_at: sequence * 1_000 };
}

function tool(id: string, name: string, effect: AgentToolCallView['effect'], status: AgentToolCallView['status'], argumentsValue: Record<string, unknown>): AgentToolCallView {
  return { id, run_id: 'run-1', name, effect, status, policy_decision: 'ALLOW', arguments: argumentsValue, receipt: null, error_code: null, created_at: 1_000, updated_at: 20_000 };
}

const tools = [
  tool('read', 'read_file', 'OBSERVE', 'COMPLETED', { path: 'package.json' }),
  tool('search', 'search_text', 'OBSERVE', 'COMPLETED', { query: 'AgentTurn', path: 'src' }),
  tool('edit', 'replace_text', 'WORKSPACE_WRITE', 'COMPLETED', { path: 'src/AgentTurn.tsx' }),
  { ...tool('test', 'run_command', 'PROCESS', 'COMPLETED', { program: 'pnpm', argv: ['test', 'agent'] }), receipt: { verification_eligible: true, success: true } },
];

const events = [
  event(1, 'PHASE_CHANGED', { active_phase: 'LOCATE' }),
  event(2, 'TOOL_PROPOSED', { tool_call_id: 'read' }),
  event(3, 'TOOL_COMPLETED', { tool_call_id: 'read' }),
  event(4, 'TOOL_PROPOSED', { tool_call_id: 'search' }),
  event(5, 'TOOL_COMPLETED', { tool_call_id: 'search' }),
  event(6, 'PHASE_CHANGED', { active_phase: 'EDIT' }),
  event(7, 'TOOL_PROPOSED', { tool_call_id: 'edit' }),
  event(8, 'TOOL_COMPLETED', { tool_call_id: 'edit' }),
  event(9, 'PHASE_CHANGED', { active_phase: 'VERIFY' }),
  event(10, 'TOOL_PROPOSED', { tool_call_id: 'test' }),
  event(11, 'VERIFICATION_RECORDED', { receipt: { tool_call_id: 'test', outcome: 'PASS' } }),
  event(12, 'TOOL_COMPLETED', { tool_call_id: 'test' }),
];

test('durable events project into chronological user-visible activity without internal phase markers or invented progress', () => {
  const projection = buildConversationActivityProjection([...events].reverse(), tools);
  assert.deepEqual(projection.map((item) => [item.kind, item.sequence]), [
    ['GROUP', 2], ['GROUP', 7], ['GROUP', 10],
  ]);
  assert.equal(projection.some((item) => item.kind === 'PROGRESS'), false);
  const groups = projection.filter((item) => item.kind === 'GROUP');
  assert.deepEqual(groups.map((group) => [group.groupKind, group.title, group.entries.map((entry) => entry.kind === 'TOOL' ? entry.tool.name : entry.title)]), [
    ['INSPECT', '检查了项目', ['read_file', 'search_text']],
    ['CHANGE', '编辑了文件', ['replace_text']],
    ['VERIFY', '运行了验证', ['run_command']],
  ]);
  assert.deepEqual(groups.flatMap((group) => group.entries.map((entry) => entry.sequence)), [2, 4, 7, 10]);
});

test('activity appends as new proposed events arrive and completion uses persisted terminal event time', () => {
  const first = buildConversationActivityProjection(events.slice(0, 4), tools);
  const middle = buildConversationActivityProjection(events.slice(0, 8), tools);
  const final = buildConversationActivityProjection(events, tools);
  const count = (items: ReturnType<typeof buildConversationActivityProjection>) => items
    .filter((item) => item.kind === 'GROUP')
    .reduce((total, item) => total + item.entries.length, 0);
  assert.deepEqual([count(first), count(middle), count(final)], [2, 3, 4]);
  const read = final.flatMap((item) => item.kind === 'GROUP' ? item.entries : []).find((entry) => entry.id === 'tool-read');
  assert.equal(read?.completedAt, 3_000);
});

test('approval remains at its real sequence and carries the persisted resolution time', () => {
  const approvalEvents = [
    event(1, 'TOOL_PROPOSED', { tool_call_id: 'edit' }),
    event(2, 'APPROVAL_REQUESTED', { approval: { id: 'approval-1', tool_call_id: 'edit' } }),
    event(3, 'APPROVAL_RESOLVED', { approval_id: 'approval-1', tool_call_id: 'edit', decision: 'ALLOW_ONCE' }),
    event(4, 'TOOL_STARTED', { tool_call_id: 'edit' }),
    event(5, 'TOOL_COMPLETED', { tool_call_id: 'edit' }),
  ];
  const projection = buildConversationActivityProjection(approvalEvents, [tools[2]!]);
  assert.deepEqual(projection.map((item) => item.kind), ['GROUP', 'APPROVAL']);
  const approval = projection.find((item): item is Extract<(typeof projection)[number], { kind: 'APPROVAL' }> => item.kind === 'APPROVAL');
  assert.ok(approval);
  assert.equal(approval.decision, 'ALLOW_ONCE');
  assert.equal(approval.completedAt, 3_000);
});
