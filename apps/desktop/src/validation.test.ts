import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCreate, validateCreateState, validateFocus, validateSetFocusV1,
  validateSnapshot, validateSnapshotV1,
} from './validation.ts';

const fieldId = '018f84cb-7c4e-7a12-a6d4-3c441f80a227';

test('bridge payload validators do not expose arbitrary pass-through', () => {
  assert.deepEqual(validateCreate({ title: 'Phase 02', goal: null }), { title: 'Phase 02', goal: null });
  assert.throws(() => validateCreate({ title: 'Phase 02', goal: null, method: 'system.shutdown' }));
  assert.deepEqual(validateFocus({ field_id: fieldId, expected_revision: 2, focus: 'Persistence' }), {
    field_id: fieldId, expected_revision: 2, focus: 'Persistence',
  });
  assert.throws(() => validateFocus({ field_id: fieldId, expected_revision: 0, focus: 'x' }));
  assert.throws(() => validateFocus({ field_id: fieldId, expected_revision: 2, focus: { arbitrary: true } }));
  assert.deepEqual(validateSnapshot({ field_id: fieldId, layout: { primary: 'FIELD' }, open_objects: [] }), {
    field_id: fieldId, layout: { primary: 'FIELD' }, open_objects: [],
  });
});

test('Phase 02 bridge accepts only typed focus, bounded DTOs, and typed layout', () => {
  assert.deepEqual(validateSetFocusV1({ field_id: fieldId, expected_field_revision: 2, focus: { kind: 'STATE', state_id: fieldId } }), {
    field_id: fieldId, expected_field_revision: 2, focus: { kind: 'STATE', state_id: fieldId },
  });
  assert.throws(() => validateSetFocusV1({ field_id: fieldId, expected_field_revision: 2, focus: { kind: 'STATE', state_id: fieldId, html: '<b>x</b>' } }));
  assert.deepEqual(validateCreateState({ field_id: fieldId, kind: 'TASK', content: 'Ship', confidence: 0.8 }).kind, 'TASK');
  assert.throws(() => validateCreateState({ field_id: fieldId, kind: 'TASK', content: 'Ship', confidence: Number.NaN }));
  const layout = { version: 1, template: 'PRIMARY_ONLY', primary: { pane_id: 'primary_task', primitive: 'TASK_PANE', binding: { kind: 'FIELD_TASKS' }, collapsed: false }, supporting: [], focused_pane_id: 'primary_task' };
  assert.deepEqual(validateSnapshotV1({ field_id: fieldId, layout }).layout, layout);
  assert.throws(() => validateSnapshotV1({ field_id: fieldId, layout: { ...layout, ratio: 0.72 } }));
});
