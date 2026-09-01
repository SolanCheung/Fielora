export type StartupDestination = 'PROJECTS' | 'NOW' | 'BROWSE';
export type AppearanceMode = 'SYSTEM' | 'LIGHT' | 'DARK';
export type EffectiveAppearance = 'LIGHT' | 'DARK';
export type MaterialMode = 'GLASS' | 'SOLID';
export type AccentPreset = 'FIELORA' | 'BLUE' | 'TEAL' | 'ORANGE' | 'CUSTOM';
export type InterfaceDensity = 'COMFORTABLE' | 'STANDARD' | 'COMPACT';
export type InterfaceContrast = 'SOFT' | 'STANDARD' | 'HIGH';
export type InterfaceRadius = 'SMALL' | 'STANDARD' | 'LARGE';
export type UiFont = 'SYSTEM' | 'INTER' | 'SEGOE_UI' | 'PINGFANG_SC' | 'MICROSOFT_YAHEI';
export type CodeFont = 'SYSTEM_MONO' | 'CONSOLAS' | 'CASCADIA_CODE' | 'JETBRAINS_MONO';
export type UiFontScale = 90 | 95 | 100 | 105 | 110 | 115 | 120;
export type ReducedMotionPreference = 'SYSTEM' | 'REDUCE' | 'FULL';
export type AdvancedColorKey = 'accent' | 'canvas' | 'sidebar' | 'surface' | 'foreground' | 'border';
export type AdvancedColorOverrides = Partial<Record<AdvancedColorKey, string>>;

export interface AppearancePreferences {
  /** Persisted field name retained for UI preference compatibility. This is an appearance mode, not a Theme ID. */
  themePreference: AppearanceMode;
  accentPreset: AccentPreset;
  customAccent: string;
  density: InterfaceDensity;
  contrast: InterfaceContrast;
  radius: InterfaceRadius;
  uiFont: UiFont;
  codeFont: CodeFont;
  uiFontScale: UiFontScale;
  translucentSidebar: boolean;
  softElevation: boolean;
  reducedMotionPreference: ReducedMotionPreference;
  smoothScrolling: boolean;
  pointerCursor: boolean;
  highContrast: boolean;
  advancedColorOverrides: AdvancedColorOverrides;
}

export interface AppPreferences {
  version: 2;
  startupDestination: StartupDestination;
  appearance: AppearancePreferences;
}

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AppearanceEnvironment {
  prefersDark: boolean;
  prefersReducedMotion: boolean;
  supportsBackdrop?: boolean;
}

const STORAGE_KEY = 'fielora.ui.preferences.v2';
const LEGACY_STORAGE_KEY = 'fielora.ui.preferences.v1';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ADVANCED_COLOR_KEYS: AdvancedColorKey[] = ['accent', 'canvas', 'sidebar', 'surface', 'foreground', 'border'];

export const defaultAppearancePreferences: AppearancePreferences = {
  themePreference: 'SYSTEM', accentPreset: 'FIELORA', customAccent: '#6546C7', density: 'STANDARD', contrast: 'STANDARD', radius: 'STANDARD',
  uiFont: 'SYSTEM', codeFont: 'SYSTEM_MONO', uiFontScale: 100, translucentSidebar: false, softElevation: true,
  reducedMotionPreference: 'SYSTEM', smoothScrolling: true, pointerCursor: true, highContrast: false, advancedColorOverrides: {},
};

export const defaultAppPreferences: AppPreferences = {
  version: 2, startupDestination: 'PROJECTS', appearance: defaultAppearancePreferences,
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

function normalizeAdvancedColors(value: unknown): AdvancedColorOverrides {
  const input = record(value);
  if (!input) return {};
  return Object.fromEntries(ADVANCED_COLOR_KEYS.flatMap((key) => isHexColor(input[key]) ? [[key, String(input[key]).toUpperCase()]] : []));
}

function normalizeAppearance(value: unknown, legacy?: Record<string, unknown>): AppearancePreferences {
  const input = record(value) ?? {};
  const legacyDensity = legacy?.density === 'COMPACT' ? 'COMPACT' : legacy?.density === 'COMFORTABLE' ? 'COMFORTABLE' : defaultAppearancePreferences.density;
  const legacyMotion = legacy?.reduceMotion === true ? 'REDUCE' : defaultAppearancePreferences.reducedMotionPreference;
  return {
    themePreference: oneOf(input.themePreference, ['SYSTEM', 'LIGHT', 'DARK'], defaultAppearancePreferences.themePreference),
    accentPreset: oneOf(input.accentPreset, ['FIELORA', 'BLUE', 'TEAL', 'ORANGE', 'CUSTOM'], defaultAppearancePreferences.accentPreset),
    customAccent: isHexColor(input.customAccent) ? input.customAccent.toUpperCase() : defaultAppearancePreferences.customAccent,
    density: oneOf(input.density, ['COMFORTABLE', 'STANDARD', 'COMPACT'], legacyDensity),
    contrast: oneOf(input.contrast, ['SOFT', 'STANDARD', 'HIGH'], defaultAppearancePreferences.contrast),
    radius: oneOf(input.radius, ['SMALL', 'STANDARD', 'LARGE'], defaultAppearancePreferences.radius),
    uiFont: oneOf(input.uiFont, ['SYSTEM', 'INTER', 'SEGOE_UI', 'PINGFANG_SC', 'MICROSOFT_YAHEI'], defaultAppearancePreferences.uiFont),
    codeFont: oneOf(input.codeFont, ['SYSTEM_MONO', 'CONSOLAS', 'CASCADIA_CODE', 'JETBRAINS_MONO'], defaultAppearancePreferences.codeFont),
    uiFontScale: [90, 95, 100, 105, 110, 115, 120].includes(Number(input.uiFontScale)) ? Number(input.uiFontScale) as UiFontScale : defaultAppearancePreferences.uiFontScale,
    translucentSidebar: booleanValue(input.translucentSidebar, defaultAppearancePreferences.translucentSidebar),
    softElevation: booleanValue(input.softElevation, defaultAppearancePreferences.softElevation),
    reducedMotionPreference: oneOf(input.reducedMotionPreference, ['SYSTEM', 'REDUCE', 'FULL'], legacyMotion),
    smoothScrolling: booleanValue(input.smoothScrolling, defaultAppearancePreferences.smoothScrolling),
    pointerCursor: booleanValue(input.pointerCursor, defaultAppearancePreferences.pointerCursor),
    highContrast: booleanValue(input.highContrast, defaultAppearancePreferences.highContrast),
    advancedColorOverrides: normalizeAdvancedColors(input.advancedColorOverrides),
  };
}

function freshDefaults(): AppPreferences {
  return { version: 2, startupDestination: 'PROJECTS', appearance: { ...defaultAppearancePreferences, advancedColorOverrides: {} } };
}

export function readAppPreferences(storage: Pick<PreferenceStorage, 'getItem'>): AppPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return freshDefaults();
    return normalizeAppPreferences(JSON.parse(raw));
  } catch { return freshDefaults(); }
}

export function normalizeAppPreferences(value: unknown): AppPreferences {
  const parsed = record(value);
  if (!parsed) return freshDefaults();
  return {
    version: 2,
    startupDestination: oneOf(parsed.startupDestination, ['PROJECTS', 'NOW', 'BROWSE'], defaultAppPreferences.startupDestination),
    appearance: normalizeAppearance(parsed.appearance, parsed),
  };
}

export function writeAppPreferences(storage: Pick<PreferenceStorage, 'setItem'>, preferences: AppPreferences): void {
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...preferences, version: 2 }));
}

export function resolveAppearance(preference: AppearanceMode, prefersDark: boolean): EffectiveAppearance {
  return preference === 'SYSTEM' ? (prefersDark ? 'DARK' : 'LIGHT') : preference;
}

export function resolveMaterial(supportsBackdrop: boolean): MaterialMode {
  return supportsBackdrop ? 'GLASS' : 'SOLID';
}

export function resolveReducedMotion(preference: ReducedMotionPreference, prefersReducedMotion: boolean): boolean {
  return preference === 'SYSTEM' ? prefersReducedMotion : preference === 'REDUCE';
}

export function applyAppPreferences(target: HTMLElement, preferences: AppPreferences, environment: AppearanceEnvironment = { prefersDark: false, prefersReducedMotion: false }): void {
  const appearance = preferences.appearance;
  const effectiveAppearance = resolveAppearance(appearance.themePreference, environment.prefersDark);
  const material = resolveMaterial(environment.supportsBackdrop ?? false);
  target.dataset.officialTheme = 'fielora';
  target.dataset.designLanguage = 'fielora-glass';
  target.dataset.appearanceMode = appearance.themePreference.toLowerCase();
  target.dataset.effectiveAppearance = effectiveAppearance.toLowerCase();
  target.dataset.material = material.toLowerCase();
  // Temporary compatibility markers for older non-visual E2E entry points.
  target.dataset.themePreference = appearance.themePreference.toLowerCase();
  target.dataset.resolvedTheme = effectiveAppearance.toLowerCase();
  target.dataset.uiDensity = 'standard';
  target.dataset.uiContrast = 'standard';
  target.dataset.uiRadius = 'standard';
  target.dataset.reduceMotion = String(resolveReducedMotion(appearance.reducedMotionPreference, environment.prefersReducedMotion));
  target.dataset.smoothScrolling = String(appearance.smoothScrolling);
  target.dataset.pointerCursor = String(appearance.pointerCursor);
  target.dataset.highContrast = String(appearance.highContrast);
  target.style.colorScheme = effectiveAppearance.toLowerCase();
  target.style.removeProperty('--fl-color-accent');
  target.style.removeProperty('--fl-font-sans');
  target.style.removeProperty('--fl-font-mono');
  target.style.setProperty('--fl-ui-font-scale', String(appearance.uiFontScale / 100));
  for (const property of ['--fl-color-canvas', '--fl-color-navigation', '--fl-color-surface-subtle', '--fl-color-text-strong', '--fl-color-border']) target.style.removeProperty(property);
}

function linearChannel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  return 0.2126 * linearChannel(channels[0]!) + 0.7152 * linearChannel(channels[1]!) + 0.0722 * linearChannel(channels[2]!);
}

export function colorContrast(left: string, right: string): number {
  const [bright, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (bright! + 0.05) / (dark! + 0.05);
}
