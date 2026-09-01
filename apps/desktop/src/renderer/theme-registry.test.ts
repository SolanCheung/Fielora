import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CUSTOM_THEME_PACKAGE_SEAM,
  FIELORA_THEME,
  OFFICIAL_DESIGN_LANGUAGE,
  OFFICIAL_THEME_ID,
  createBuiltinThemeRegistry,
} from './theme-registry.ts';

test('the official registry contains exactly one Fielora Glass identity', () => {
  const registry = createBuiltinThemeRegistry();
  assert.equal(registry.listOfficial().length, 1);
  assert.deepEqual(registry.listOfficial().map((theme) => theme.id), [OFFICIAL_THEME_ID]);
  assert.equal(registry.officialTheme, FIELORA_THEME);
  assert.equal(registry.officialTheme.designLanguage, OFFICIAL_DESIGN_LANGUAGE);
  assert.equal(registry.get('fielora'), FIELORA_THEME);
  assert.equal(registry.get('fielora-light'), undefined);
  assert.equal(registry.get('fielora-dark'), undefined);
});

test('the future custom-theme seam is declarative and disabled', () => {
  assert.equal(CUSTOM_THEME_PACKAGE_SEAM.status, 'SEAM_ONLY');
  assert.equal(CUSTOM_THEME_PACKAGE_SEAM.localImportEnabled, false);
  assert.deepEqual(CUSTOM_THEME_PACKAGE_SEAM.allowedTokenGroups, ['colors', 'surfaces', 'effects', 'radius', 'shadow', 'blur', 'opacity', 'icons', 'motion']);
  assert.deepEqual(CUSTOM_THEME_PACKAGE_SEAM.forbiddenCapabilities, ['javascript', 'typescript', 'renderer-code', 'css-selectors', 'dom-mutation', 'network', 'filesystem', 'credentials', 'tools', 'runtime']);
  assert.ok(Object.isFrozen(CUSTOM_THEME_PACKAGE_SEAM));
});
