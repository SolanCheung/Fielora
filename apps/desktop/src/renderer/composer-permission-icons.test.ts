import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rendererRoot = import.meta.dirname;
const workspace = readFileSync(path.join(rendererRoot, 'ProjectWorkspace.tsx'), 'utf8');
const primitives = readFileSync(path.join(rendererRoot, 'UiPrimitives.tsx'), 'utf8');
const styles = readFileSync(path.join(rendererRoot, 'styles.css'), 'utf8');
const controls = readFileSync(path.join(rendererRoot, 'styles/controls.css'), 'utf8');
const tokens = readFileSync(path.join(rendererRoot, 'styles/tokens.css'), 'utf8');

test('composer permission uses three semantic icons without a trigger chevron', () => {
  for (const permission of ['READ_ONLY', 'REVIEW_CHANGES', 'FULL_CONTROL']) {
    assert.match(workspace, new RegExp(`PermissionIcon permission=["{]${permission}`));
  }
  assert.match(workspace, /data-permission-icon=\{permission\}/);
  assert.match(workspace, /testId="composer-permission"[^>]*hideChevron/);
  assert.match(primitives, /!hideChevron && <ChevronIcon/);
  assert.match(primitives, /option\.icon/);
  assert.match(primitives, /option\.tone/);
  assert.match(workspace, /viewBox="0 0 20 20"/);
  assert.match(styles, /permission-icon\[data-permission-icon="READ_ONLY"\]/);
  assert.match(styles, /permission-icon\[data-permission-icon="REVIEW_CHANGES"\]/);
  assert.match(styles, /permission-icon\[data-permission-icon="FULL_CONTROL"\]/);
});

test('narrow permission trigger is icon-only and every persistent mode stays neutral', () => {
  assert.match(styles, /@container \(max-width: 560px\)[\s\S]*?\.permission-picker \{ width: 34px; flex: 0 0 34px; \}/);
  assert.match(styles, /\.permission-picker \.ui-select-value \{ display: none; \}/);
  assert.match(controls, /permission-picker\[data-value="FULL_CONTROL"\][\s\S]*?var\(--fl-color-text\)/);
  assert.match(controls, /permission-icon\[data-permission-icon="FULL_CONTROL"\][\s\S]*?currentColor/);
  assert.doesNotMatch(workspace, /value: 'FULL_CONTROL'[\s\S]{0,220}tone: 'warning'/);
});

test('permission typography follows the shared system type hierarchy', () => {
  assert.match(controls, /\.permission-picker button \{ font-family: var\(--fl-font-sans\); \}/);
  assert.match(controls, /\.select-menu\.permission-picker > button \{[\s\S]*?font-size: 14px;[\s\S]*?font-weight: 500;/);
  assert.match(controls, /\.permission-picker \.ui-select-popover strong \{[\s\S]*?font-size: 15px;[\s\S]*?font-weight: 500;/);
  assert.match(controls, /\.permission-picker \.ui-select-popover small \{[\s\S]*?font-size: 13\.5px;[\s\S]*?font-weight: 400;/);
  assert.match(tokens, /--fl-color-permission-warning: #e95016;/);
});
