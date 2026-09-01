import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAppPreferences,
  colorContrast,
  defaultAppearancePreferences,
  defaultAppPreferences,
  readAppPreferences,
  resolveAppearance,
  resolveMaterial,
  resolveReducedMotion,
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

test('System appearance and motion resolve from the environment without becoming themes', () => {
  assert.equal(resolveAppearance('SYSTEM', false), 'LIGHT');
  assert.equal(resolveAppearance('SYSTEM', true), 'DARK');
  assert.equal(resolveAppearance('LIGHT', true), 'LIGHT');
  assert.equal(resolveMaterial(true), 'GLASS');
  assert.equal(resolveMaterial(false), 'SOLID');
  assert.equal(resolveReducedMotion('SYSTEM', true), true);
  assert.equal(resolveReducedMotion('FULL', true), false);
  assert.equal(resolveReducedMotion('REDUCE', false), true);
});

test('applying appearance fixes the official identity and resolves Glass material capability', () => {
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
  applyAppPreferences(target, preferences, { prefersDark: true, prefersReducedMotion: true, supportsBackdrop: true });
  assert.deepEqual({
    theme: target.dataset.officialTheme, language: target.dataset.designLanguage, mode: target.dataset.appearanceMode,
    effective: target.dataset.effectiveAppearance, material: target.dataset.material, density: target.dataset.uiDensity,
    contrast: target.dataset.uiContrast, radius: target.dataset.uiRadius,
    motion: target.dataset.reduceMotion, pointer: target.dataset.pointerCursor,
  }, { theme: 'fielora', language: 'fielora-glass', mode: 'system', effective: 'dark', material: 'glass', density: 'standard', contrast: 'standard', radius: 'standard', motion: 'true', pointer: 'false' });
  assert.equal(target.style.colorScheme, 'dark');
  assert.equal(properties.has('--fl-color-accent'), false);
  assert.equal(properties.has('--fl-color-canvas'), false);
  assert.equal(properties.has('--fl-font-sans'), false);
  assert.equal(properties.get('--fl-ui-font-scale'), '1.15');

  applyAppPreferences(target, preferences, { prefersDark: false, prefersReducedMotion: false, supportsBackdrop: false });
  assert.equal(target.dataset.material, 'solid');
  assert.equal(target.dataset.effectiveAppearance, 'light');
});

test('contrast helper remains deterministic', () => {
  assert.ok(colorContrast('#FFFFFF', '#181A1F') > 15);
  assert.equal(colorContrast('#FFFFFF', '#FFFFFF'), 1);
});

test('legacy visual customization data remains readable but cannot replace the official design language', () => {
  const storage = memoryStorage({ 'fielora.ui.preferences.v2': JSON.stringify({
    version: 2,
    startupDestination: 'PROJECTS',
    appearance: { ...defaultAppearancePreferences, accentPreset: 'CUSTOM', customAccent: '#AABBCC', advancedColorOverrides: { canvas: '#101214' } },
  }) });
  const preferences = readAppPreferences(storage);
  assert.equal(preferences.appearance.customAccent, '#AABBCC');
  const properties = new Map<string, string>();
  const target = { dataset: {} as DOMStringMap, style: { colorScheme: '', setProperty: (name: string, value: string) => { properties.set(name, value); }, removeProperty: (name: string) => { properties.delete(name); return ''; } } } as unknown as HTMLElement;
  applyAppPreferences(target, preferences, { prefersDark: false, prefersReducedMotion: false, supportsBackdrop: true });
  assert.equal(properties.has('--fl-color-canvas'), false);
  assert.equal(target.dataset.officialTheme, 'fielora');
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
