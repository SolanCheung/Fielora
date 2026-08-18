import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAppPreferences,
  defaultAppPreferences,
  readAppPreferences,
  writeAppPreferences,
} from './app-preferences.ts';

test('UI preferences use safe defaults and reject invalid persisted values', () => {
  assert.deepEqual(readAppPreferences({ getItem: () => null }), defaultAppPreferences);
  assert.deepEqual(readAppPreferences({ getItem: () => '{invalid' }), defaultAppPreferences);
  assert.deepEqual(readAppPreferences({ getItem: () => JSON.stringify({ startupDestination: 'UNKNOWN', density: 'TINY', reduceMotion: 'yes' }) }), defaultAppPreferences);
});

test('UI preferences persist and apply functional presentation state', () => {
  let stored = '';
  const preferences = { startupDestination: 'BROWSE', density: 'COMPACT', reduceMotion: true } as const;
  writeAppPreferences({ setItem: (_key, value) => { stored = value; } }, preferences);
  assert.deepEqual(readAppPreferences({ getItem: () => stored }), preferences);
  const target = { dataset: {} as DOMStringMap } as HTMLElement;
  applyAppPreferences(target, preferences);
  assert.equal(target.dataset.uiDensity, 'compact');
  assert.equal(target.dataset.reduceMotion, 'true');
});
