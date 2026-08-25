import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIELORA_DARK_THEME,
  FIELORA_LIGHT_THEME,
  ThemeRegistry,
  createBuiltinThemeRegistry,
} from './theme-registry.ts';

const customTheme = {
  id: 'example-night',
  name: 'Example Night',
  version: '1.2.0',
  author: 'Example',
  baseTheme: 'DARK',
} as const;

test('theme registry registers, gets, and lists declarative themes', () => {
  const registry = createBuiltinThemeRegistry();
  const registered = registry.register(customTheme);
  assert.equal(registry.get(customTheme.id), registered);
  assert.deepEqual(registry.list().map((theme) => theme.id), [FIELORA_LIGHT_THEME.id, FIELORA_DARK_THEME.id, customTheme.id]);
  assert.ok(Object.isFrozen(registered));
});

test('theme registry activates registered themes', () => {
  const registry = createBuiltinThemeRegistry();
  registry.register(customTheme);
  assert.equal(registry.activeTheme.id, FIELORA_LIGHT_THEME.id);
  assert.equal(registry.activate(customTheme.id).id, customTheme.id);
  assert.equal(registry.activeTheme.baseTheme, 'DARK');
});

test('theme registry rejects invalid or executable schema data', () => {
  const invalidThemes = [
    { ...customTheme, id: '../theme' },
    { ...customTheme, version: 'latest' },
    { ...customTheme, baseTheme: 'SYSTEM' },
    { ...customTheme, selector: ':root' },
    { ...customTheme, tokens: { '--fl-color-canvas': '#000000' } },
    { ...customTheme, script: () => undefined },
  ];
  for (const theme of invalidThemes) assert.throws(() => new ThemeRegistry(FIELORA_LIGHT_THEME).register(theme), /Invalid theme schema/);
  const registry = createBuiltinThemeRegistry();
  assert.throws(() => registry.register(FIELORA_LIGHT_THEME), /already registered/);
});

test('theme registry falls back predictably for unknown activation', () => {
  const registry = createBuiltinThemeRegistry();
  registry.activate(FIELORA_DARK_THEME.id);
  assert.equal(registry.activate('missing-theme').id, FIELORA_LIGHT_THEME.id);
  assert.equal(registry.activeTheme.id, FIELORA_LIGHT_THEME.id);
  assert.equal(registry.fallback().id, FIELORA_LIGHT_THEME.id);
});
