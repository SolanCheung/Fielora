import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererRoot = import.meta.dirname;
const read = (relativePath: string) => readFileSync(path.join(rendererRoot, relativePath), 'utf8');

test('renderer loads design layers in canonical order', () => {
  const source = read('index.tsx');
  const imports = [
    "import './styles/tokens.css';",
    "import './styles/foundation.css';",
    "import './styles.css';",
    "import './styles/controls.css';",
  ];
  let previous = -1;
  for (const statement of imports) {
    const index = source.indexOf(statement);
    assert.ok(index > previous, `${statement} is missing or out of order`);
    previous = index;
  }
});

test('semantic token contract covers color type geometry motion and elevation', () => {
  const tokens = read('styles/tokens.css');
  for (const token of [
    '--fl-color-app', '--fl-color-surface', '--fl-color-text', '--fl-color-border',
    '--fl-font-size-body', '--fl-space-4', '--fl-radius-surface', '--fl-control-md',
    '--fl-shadow-popover', '--fl-duration-surface', '--fl-ease-standard', '--fl-layer-dialog',
  ]) assert.match(tokens, new RegExp(`${token.replaceAll('-', '\\-')}\\s*:`), `missing ${token}`);
});

test('shared design-system CSS consumes tokens instead of raw colors', () => {
  for (const file of ['styles/foundation.css', 'styles/appearance.css', 'styles/controls.css']) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i, `${file} contains a raw color`);
  }
});

test('shared renderer primitives expose canonical controls', () => {
  const source = read('UiPrimitives.tsx');
  for (const primitive of ['Button', 'IconButton', 'ToolbarAction', 'SelectMenu', 'TextActionDialog']) {
    assert.match(source, new RegExp(`export function ${primitive}\\b`), `missing ${primitive}`);
  }
  for (const className of ['ui-button', 'ui-icon-button', 'ui-toolbar-action', 'ui-select', 'ui-dialog']) {
    assert.match(source, new RegExp(className), `missing canonical class ${className}`);
  }
});

test('legacy compatibility stylesheet cannot grow its raw color budget', () => {
  const legacy = read('styles.css');
  const rawColors = legacy.match(/#[0-9a-f]{3,8}\b|rgba?\s*\([^)]*\)/gi) ?? [];
  // Migration baseline after extracting foundations, shared controls and the window-right dock.
  // The budget may move downward as touched legacy Surfaces migrate, never upward.
  assert.ok(rawColors.length <= 408, `legacy raw color budget grew to ${rawColors.length}`);
});
