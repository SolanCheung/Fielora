import test from 'node:test';
import assert from 'node:assert/strict';
import type { FieldResumeV1View, FieldSummary, HealthDTO, StateView } from '@fielora/contracts';
import {
  activityLabel,
  continuationPresentation,
  fieldModeLabels,
  focusLabel,
  referenceLifecycleLabels,
  screenFor,
  stateKindLabels,
  stateStatusLabels,
  upsertFields,
} from './view-state.ts';

const health: HealthDTO = {
  state: 'READY', core_version: '0.1.0', protocol: { major: 1, minor: 0 }, schema_version: 1, pid: 1, db_path: 'redacted',
};

test('startup state does not fake Now before Core readiness', () => {
  assert.equal(screenFor(undefined, undefined), 'startup');
  assert.equal(screenFor({ ...health, state: 'UNAVAILABLE' }, undefined), 'startup');
  assert.equal(screenFor(health, undefined), 'now');
  assert.equal(screenFor(health, undefined, 'BROWSE'), 'browse');
  assert.equal(screenFor(health, 'field', 'BROWSE'), 'browse');
  assert.equal(screenFor(health, undefined, 'FIELDS'), 'fields');
  assert.equal(screenFor(health, undefined, 'SETTINGS'), 'settings');
  assert.equal(screenFor(health, 'field', 'FIELDS'), 'field');
  assert.equal(screenFor(health, 'field'), 'field');
  assert.throws(() => screenFor(health, undefined, 'UNKNOWN' as never), /Unknown app view/);
});

test('event invalidation result keeps newest field first', () => {
  const older: FieldSummary = { id: 'a', title: 'A', goal: null, current_mode: null, current_focus: null, revision: 1, updated_at: 1 };
  const changed: FieldSummary = { id: 'b', title: 'B', goal: null, current_mode: null, current_focus: 'Focus', revision: 2, updated_at: 2 };
  assert.deepEqual(upsertFields([older], changed), [changed, older]);
  assert.equal(focusLabel(changed.current_focus), 'Focus');
});

test('wire values are presented as product language', () => {
  assert.equal(fieldModeLabels.VERIFY, '验证');
  assert.equal(stateKindLabels.TASK, '任务');
  assert.equal(stateStatusLabels.ACTIVE, '进行中');
  assert.equal(referenceLifecycleLabels.ARCHIVED, '已归档');
  assert.equal(activityLabel('STATE_SUPERSEDED'), '替代了旧内容');
  assert.equal(focusLabel({ kind: 'STATE', state_id: 'state_1' }), '继续当前工作');
  assert.equal(focusLabel({ unexpected: true }), '回到当前 Field');
});

const field = {
  id: 'field_1', owner_principal_id: 'principal_1', title: 'Human Acceptance Test', goal: null,
  lifecycle_status: 'ACTIVE', current_mode: null, current_focus: 'PHASE_01_HUMAN_PASS_TEST',
  revision: 4, created_at: 1, updated_at: 4,
} as const;

const baseResume: FieldResumeV1View = {
  field,
  field_revision: 4,
  focus_source: 'LEGACY_TEXT',
  typed_focus: null,
  legacy_text_focus: 'PHASE_01_HUMAN_PASS_TEST',
  snapshot_freshness: 'STALE',
  layout_source: 'LEGACY_PHASE01_FALLBACK',
  layout: {
    version: 1,
    template: 'PRIMARY_ONLY',
    primary: { pane_id: 'primary_task', primitive: 'TASK_PANE', binding: { kind: 'FIELD_TASKS' }, collapsed: false },
    supporting: [],
    focused_pane_id: 'primary_task',
  },
  open_reference_ids: [],
  unavailable_reference_ids: [],
  active_blockers: [],
  active_questions: [],
  active_tasks: [],
  last_activity: null,
  continuation: { reason: 'LEGACY_TEXT_FOCUS', target: { kind: 'LEGACY_TEXT', label: 'PHASE_01_HUMAN_PASS_TEST' } },
  external_changes: 'NOT_EVALUATED_PHASE02',
};

test('legacy focus is framed as previous attention without exposing snapshot diagnostics', () => {
  assert.deepEqual(continuationPresentation(baseResume, [], []), {
    cue: '上次关注',
    label: 'PHASE_01_HUMAN_PASS_TEST',
  });
});

test('current task continuation uses its content and a natural cue', () => {
  const task = {
    id: 'state_1', field_id: field.id, kind: 'TASK', content: '完成当前工作', status: 'ACTIVE',
    confidence: null, created_by: 'principal_1', source_activity_id: 'activity_1', revision: 1,
    created_at: 2, updated_at: 3,
  } satisfies StateView;
  const resume: FieldResumeV1View = {
    ...baseResume,
    focus_source: 'TYPED_V1',
    typed_focus: { kind: 'STATE', state_id: task.id },
    legacy_text_focus: null,
    continuation: { reason: 'TYPED_FOCUS', target: { kind: 'STATE', state_id: task.id } },
  };
  assert.deepEqual(continuationPresentation(resume, [task], []), {
    cue: '当前关注',
    label: '完成当前工作',
  });
});
