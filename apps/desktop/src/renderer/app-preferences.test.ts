import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAppPreferences,
  colorContrast,
  defaultAppearancePreferences,
  defaultAppPreferences,
  exportThemeConfig,
  importThemeConfig,
  readAppPreferences,
  resolveReducedMotion,
  resolveTheme,
  selectedAccent,
  writeAppPreferences,
  type AppPreferences,
} from './app-preferences.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    entries,
  };
}

function freshPreferences(): AppPreferences {
  return { version: 2, startupDestination: 'PROJECTS', appearance: { ...defaultAppearancePreferences, advancedColorOverrides: {} } };
}

test('appearance preferences use fresh safe defaults and tolerate corrupt storage', () => {
  assert.deepEqual(readAppPreferences(memoryStorage()), freshPreferences());
  assert.deepEqual(readAppPreferences(memoryStorage({ 'fielora.ui.preferences.v2': '{invalid' })), freshPreferences());
  const invalid = JSON.stringify({ version: 2, startupDestination: 'UNKNOWN', appearance: { themePreference: 'NEON', density: 'TINY', customAccent: 'purple' } });
  assert.deepEqual(readAppPreferences(memoryStorage({ 'fielora.ui.preferences.v2': invalid })), freshPreferences());
  assert.notEqual(readAppPreferences(memoryStorage()).appearance.advancedColorOverrides, defaultAppPreferences.appearance.advancedColorOverrides);
});

test('legacy v1 preferences migrate into the unified appearance model', () => {
  const legacy = JSON.stringify({ startupDestination: 'BROWSE', density: 'COMPACT', reduceMotion: true });
  const preferences = readAppPreferences(memoryStorage({ 'fielora.ui.preferences.v1': legacy }));
  assert.equal(preferences.version, 2);
  assert.equal(preferences.startupDestination, 'BROWSE');
  assert.equal(preferences.appearance.density, 'COMPACT');
  assert.equal(preferences.appearance.reducedMotionPreference, 'REDUCE');
  assert.equal(preferences.appearance.themePreference, 'SYSTEM');
});

test('v2 appearance preferences round-trip through the canonical storage key', () => {
  const storage = memoryStorage();
  const preferences: AppPreferences = {
    version: 2,
    startupDestination: 'NOW',
    appearance: {
      ...defaultAppearancePreferences,
      themePreference: 'DARK', accentPreset: 'CUSTOM', customAccent: '#137F88', density: 'COMPACT', radius: 'LARGE', uiFontScale: 110,
      advancedColorOverrides: { sidebar: '#20242A' },
    },
  };
  writeAppPreferences(storage, preferences);
  assert.ok(storage.entries.has('fielora.ui.preferences.v2'));
  assert.deepEqual(readAppPreferences(storage), preferences);
});

test('System theme and motion resolve from the environment without mutating preferences', () => {
  assert.equal(resolveTheme('SYSTEM', false), 'LIGHT');
  assert.equal(resolveTheme('SYSTEM', true), 'DARK');
  assert.equal(resolveTheme('LIGHT', true), 'LIGHT');
  assert.equal(resolveReducedMotion('SYSTEM', true), true);
  assert.equal(resolveReducedMotion('FULL', true), false);
  assert.equal(resolveReducedMotion('REDUCE', false), true);
});

test('applying appearance sets semantic datasets, fonts, accent, and safe advanced overrides', () => {
  const properties = new Map<string, string>();
  const target = {
    dataset: {} as DOMStringMap,
    style: {
      colorScheme: '',
      setProperty: (name: string, value: string) => { properties.set(name, value); },
      removeProperty: (name: string) => { properties.delete(name); return ''; },
    },
  } as unknown as HTMLElement;
  const preferences: AppPreferences = {
    ...freshPreferences(),
    appearance: {
      ...defaultAppearancePreferences,
      themePreference: 'SYSTEM', accentPreset: 'BLUE', density: 'COMPACT', contrast: 'HIGH', radius: 'LARGE',
      uiFont: 'MICROSOFT_YAHEI', codeFont: 'CASCADIA_CODE', uiFontScale: 115, translucentSidebar: true,
      reducedMotionPreference: 'SYSTEM', pointerCursor: false, advancedColorOverrides: { canvas: '#101214', accent: '#A15AC7' },
    },
  };
  applyAppPreferences(target, preferences, { prefersDark: true, prefersReducedMotion: true });
  assert.deepEqual({
    theme: target.dataset.themePreference, resolved: target.dataset.resolvedTheme, density: target.dataset.uiDensity,
    contrast: target.dataset.uiContrast, radius: target.dataset.uiRadius, translucent: target.dataset.translucentSidebar,
    motion: target.dataset.reduceMotion, pointer: target.dataset.pointerCursor,
  }, { theme: 'system', resolved: 'dark', density: 'compact', contrast: 'high', radius: 'large', translucent: 'true', motion: 'true', pointer: 'false' });
  assert.equal(target.style.colorScheme, 'dark');
  assert.equal(properties.get('--fl-color-accent'), '#A15AC7');
  assert.equal(properties.get('--fl-color-canvas'), '#101214');
  assert.match(properties.get('--fl-font-sans') ?? '', /Microsoft YaHei/);
  assert.match(properties.get('--fl-font-mono') ?? '', /Cascadia Code/);
  assert.equal(properties.get('--fl-ui-font-scale'), '1.15');
});

test('accent selection and contrast helpers are deterministic', () => {
  assert.equal(selectedAccent({ ...defaultAppearancePreferences, accentPreset: 'TEAL' }), '#147D83');
  assert.equal(selectedAccent({ ...defaultAppearancePreferences, accentPreset: 'CUSTOM', customAccent: '#AABBCC' }), '#AABBCC');
  assert.ok(colorContrast('#FFFFFF', '#181A1F') > 15);
  assert.equal(colorContrast('#FFFFFF', '#FFFFFF'), 1);
});

test('Theme Config v1 export/import round-trips and only accepts bounded data', () => {
  const appearance = {
    ...defaultAppearancePreferences,
    themePreference: 'DARK' as const,
    accentPreset: 'ORANGE' as const,
    density: 'COMPACT' as const,
    uiFontScale: 105 as const,
    highContrast: true,
    advancedColorOverrides: { canvas: '#101214', foreground: '#F4F5F7' },
  };
  assert.deepEqual(importThemeConfig(exportThemeConfig(appearance)), appearance);
  for (const source of [
    '{bad',
    JSON.stringify({ version: 2 }),
    JSON.stringify({ version: 1, executable: 'alert(1)' }),
    JSON.stringify({ version: 1, customAccent: 'purple' }),
    JSON.stringify({ version: 1, colors: { canvas: '#FFFFFF', foreground: '#FDFDFD' } }),
    JSON.stringify({ version: 1, colors: { unknown: '#FFFFFF' } }),
  ]) assert.throws(() => importThemeConfig(source), /主题格式无效/);
});

test('resetting appearance can preserve non-appearance preferences', () => {
  const configured: AppPreferences = {
    version: 2,
    startupDestination: 'BROWSE',
    appearance: { ...defaultAppearancePreferences, themePreference: 'DARK', density: 'COMPACT' },
  };
  const reset = { ...configured, appearance: { ...defaultAppearancePreferences, advancedColorOverrides: {} } };
  assert.equal(reset.startupDestination, 'BROWSE');
  assert.equal(reset.appearance.themePreference, 'SYSTEM');
  assert.equal(reset.appearance.density, 'STANDARD');
});
