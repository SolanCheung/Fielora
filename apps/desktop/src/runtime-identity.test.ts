import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { desktopFoundationUserDataPath, hasExplicitUserDataDirectory } from './runtime-identity.ts';

test('Desktop Foundation uses a stable profile distinct from the historical desktop profile', () => {
  const appData = path.join('C:', 'Users', 'tester', 'AppData', 'Roaming');
  const current = desktopFoundationUserDataPath(appData);
  const historical = path.join(appData, '@fielora', 'desktop');

  assert.equal(current, path.join(appData, '@fielora', 'desktop-foundation'));
  assert.notEqual(current, historical);
});

test('explicit user-data-dir remains available for isolated packaged tests', () => {
  assert.equal(hasExplicitUserDataDirectory(['Fielora.exe', '--user-data-dir=C:\\fixture']), true);
  assert.equal(hasExplicitUserDataDirectory(['Fielora.exe', '--user-data-dir', 'C:\\fixture']), true);
  assert.equal(hasExplicitUserDataDirectory(['Fielora.exe']), false);
});
