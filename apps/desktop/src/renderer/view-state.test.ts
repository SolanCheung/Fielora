import test from 'node:test';
import assert from 'node:assert/strict';
import type { FieldSummary, HealthDTO } from '@fielora/contracts';
import { focusLabel, screenFor, upsertFields } from './view-state.ts';

const health: HealthDTO = {
  state: 'READY', core_version: '0.1.0', protocol: { major: 1, minor: 0 }, schema_version: 1, pid: 1, db_path: 'redacted',
};

test('startup state does not fake Now before Core readiness', () => {
  assert.equal(screenFor(undefined, undefined), 'startup');
  assert.equal(screenFor({ ...health, state: 'UNAVAILABLE' }, undefined), 'startup');
  assert.equal(screenFor(health, undefined), 'now');
  assert.equal(screenFor(health, 'field'), 'field');
});

test('event invalidation result keeps newest field first', () => {
  const older: FieldSummary = { id: 'a', title: 'A', goal: null, current_mode: null, current_focus: null, revision: 1, updated_at: 1 };
  const changed: FieldSummary = { id: 'b', title: 'B', goal: null, current_mode: null, current_focus: 'Focus', revision: 2, updated_at: 2 };
  assert.deepEqual(upsertFields([older], changed), [changed, older]);
  assert.equal(focusLabel(changed.current_focus), 'Focus');
});
