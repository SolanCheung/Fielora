import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { windowSurfaceColors } from './window-surface.ts';

test('native titlebar surface stays identical to renderer app tokens in both themes', () => {
  const tokens = readFileSync(path.join(import.meta.dirname, 'renderer', 'styles', 'tokens.css'), 'utf8').toLowerCase();
  for (const theme of ['LIGHT', 'DARK'] as const) {
    const surface = windowSurfaceColors(theme);
    assert.match(tokens, new RegExp(`--fl-color-app:\\s*${surface.background}`));
    assert.equal(surface.height, 40);
  }
  assert.notEqual(windowSurfaceColors('LIGHT').symbols, windowSurfaceColors('DARK').symbols);
});
