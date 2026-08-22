import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererFiles = [
  'App.tsx',
  'DesktopChrome.tsx',
  'Phase04Layer.tsx',
  'PrimaryNav.tsx',
  'ProjectWorkspace.tsx',
  'SettingsScreen.tsx',
  'QuickCapture.tsx',
];

test('renderer uses product controls instead of native prompt, confirm, alert, or select', () => {
  for (const file of rendererFiles) {
    const source = readFileSync(path.join(import.meta.dirname, file), 'utf8');
    assert.doesNotMatch(source, /window\.(?:prompt|confirm|alert)\s*\(/, `${file} still invokes a native dialog`);
    assert.doesNotMatch(source, /<select(?:\s|>)/, `${file} still renders a native select`);
  }
});

test('navigation and Composer do not render text chevrons as controls', () => {
  const navigation = readFileSync(path.join(import.meta.dirname, 'PrimaryNav.tsx'), 'utf8');
  const workspace = readFileSync(path.join(import.meta.dirname, 'ProjectWorkspace.tsx'), 'utf8');
  assert.doesNotMatch(navigation, /[⌄∨]/);
  assert.doesNotMatch(workspace, /composer-chevron|>[⌄∨]</);
});
