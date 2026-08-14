import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreate, validateFocus, validateSnapshot } from './validation.ts';

const fieldId = '018f84cb-7c4e-7a12-a6d4-3c441f80a227';

test('bridge payload validators do not expose arbitrary pass-through', () => {
  assert.deepEqual(validateCreate({ title: 'Phase 01', goal: null, method: 'system.shutdown' }), { title: 'Phase 01', goal: null });
  assert.deepEqual(validateFocus({ field_id: fieldId, expected_revision: 2, focus: 'Persistence' }), {
    field_id: fieldId, expected_revision: 2, focus: 'Persistence',
  });
  assert.throws(() => validateFocus({ field_id: fieldId, expected_revision: 0, focus: 'x' }));
  assert.deepEqual(validateSnapshot({ field_id: fieldId, layout: { primary: 'FIELD' }, open_objects: [] }), {
    field_id: fieldId, layout: { primary: 'FIELD' }, open_objects: [],
  });
});
