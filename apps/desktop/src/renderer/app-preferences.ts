export type StartupDestination = 'PROJECTS' | 'NOW' | 'BROWSE';
export type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK';
export type ResolvedTheme = 'LIGHT' | 'DARK';
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
  themePreference: ThemePreference;
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
}

const STORAGE_KEY = 'fielora.ui.preferences.v2';
const LEGACY_STORAGE_KEY = 'fielora.ui.preferences.v1';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ADVANCED_COLOR_KEYS: AdvancedColorKey[] = ['accent', 'canvas', 'sidebar', 'surface', 'foreground', 'border'];

const accentColors: Record<Exclude<AccentPreset, 'CUSTOM'>, string> = {
  FIELORA: '#6546C7', BLUE: '#326BCB', TEAL: '#147D83', ORANGE: '#C15B28',
};

const uiFonts: Record<UiFont, string> = {
  SYSTEM: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", sans-serif',
  INTER: 'Inter, "Segoe UI Variable", "Segoe UI", sans-serif',
  SEGOE_UI: '"Segoe UI Variable", "Segoe UI", sans-serif',
  PINGFANG_SC: '"PingFang SC", "Microsoft YaHei UI", sans-serif',
  MICROSOFT_YAHEI: '"Microsoft YaHei UI", "Segoe UI", sans-serif',
};

const codeFonts: Record<CodeFont, string> = {
  SYSTEM_MONO: 'ui-monospace, "Cascadia Code", Consolas, monospace',
  CONSOLAS: 'Consolas, "Cascadia Code", monospace',
  CASCADIA_CODE: '"Cascadia Code", Consolas, monospace',
  JETBRAINS_MONO: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
};

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

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  return preference === 'SYSTEM' ? (prefersDark ? 'DARK' : 'LIGHT') : preference;
}

export function resolveReducedMotion(preference: ReducedMotionPreference, prefersReducedMotion: boolean): boolean {
  return preference === 'SYSTEM' ? prefersReducedMotion : preference === 'REDUCE';
}

export function selectedAccent(appearance: AppearancePreferences): string {
  return appearance.accentPreset === 'CUSTOM' ? appearance.customAccent : accentColors[appearance.accentPreset];
}

export function applyAppPreferences(target: HTMLElement, preferences: AppPreferences, environment: AppearanceEnvironment = { prefersDark: false, prefersReducedMotion: false }): void {
  const appearance = preferences.appearance;
  const resolvedTheme = resolveTheme(appearance.themePreference, environment.prefersDark);
  target.dataset.themePreference = appearance.themePreference.toLowerCase();
  target.dataset.resolvedTheme = resolvedTheme.toLowerCase();
  target.dataset.uiDensity = appearance.density.toLowerCase();
  target.dataset.uiContrast = appearance.contrast.toLowerCase();
  target.dataset.uiRadius = appearance.radius.toLowerCase();
  target.dataset.translucentSidebar = String(appearance.translucentSidebar);
  target.dataset.softElevation = String(appearance.softElevation);
  target.dataset.reduceMotion = String(resolveReducedMotion(appearance.reducedMotionPreference, environment.prefersReducedMotion));
  target.dataset.smoothScrolling = String(appearance.smoothScrolling);
  target.dataset.pointerCursor = String(appearance.pointerCursor);
  target.dataset.highContrast = String(appearance.highContrast);
  target.style.colorScheme = resolvedTheme.toLowerCase();
  target.style.setProperty('--fl-color-accent', appearance.advancedColorOverrides.accent ?? selectedAccent(appearance));
  target.style.setProperty('--fl-font-sans', uiFonts[appearance.uiFont]);
  target.style.setProperty('--fl-font-mono', codeFonts[appearance.codeFont]);
  target.style.setProperty('--fl-ui-font-scale', String(appearance.uiFontScale / 100));
  const colorProperties: Record<Exclude<AdvancedColorKey, 'accent'>, string> = {
    canvas: '--fl-color-canvas', sidebar: '--fl-color-navigation', surface: '--fl-color-surface-subtle', foreground: '--fl-color-text-strong', border: '--fl-color-border',
  };
  for (const [key, property] of Object.entries(colorProperties)) {
    const color = appearance.advancedColorOverrides[key as AdvancedColorKey];
    if (color) target.style.setProperty(property, color); else target.style.removeProperty(property);
  }
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

const themeConfigKeys = new Set(['version', 'baseTheme', 'accentPreset', 'customAccent', 'density', 'contrast', 'radius', 'uiFont', 'codeFont', 'uiFontScale', 'translucentSidebar', 'softElevation', 'reducedMotionPreference', 'smoothScrolling', 'pointerCursor', 'highContrast', 'colors']);

export function exportThemeConfig(appearance: AppearancePreferences): string {
  return JSON.stringify({
    version: 1, baseTheme: appearance.themePreference.toLowerCase(), accentPreset: appearance.accentPreset.toLowerCase(), customAccent: appearance.customAccent,
    density: appearance.density.toLowerCase(), contrast: appearance.contrast.toLowerCase(), radius: appearance.radius.toLowerCase(), uiFont: appearance.uiFont.toLowerCase(),
    codeFont: appearance.codeFont.toLowerCase(), uiFontScale: appearance.uiFontScale, translucentSidebar: appearance.translucentSidebar, softElevation: appearance.softElevation,
    reducedMotionPreference: appearance.reducedMotionPreference.toLowerCase(), smoothScrolling: appearance.smoothScrolling, pointerCursor: appearance.pointerCursor,
    highContrast: appearance.highContrast, colors: appearance.advancedColorOverrides,
  }, null, 2);
}

function importedEnum<T extends string>(input: Record<string, unknown>, key: string, values: readonly T[], fallback: T): T {
  const value = input[key];
  if (value === undefined) return fallback;
  const normalized = String(value).toUpperCase();
  if (!values.includes(normalized as T)) throw new Error('主题格式无效');
  return normalized as T;
}

function importedBoolean(input: Record<string, unknown>, key: string, fallback: boolean): boolean {
  if (input[key] === undefined) return fallback;
  if (typeof input[key] !== 'boolean') throw new Error('主题格式无效');
  return input[key] as boolean;
}

export function importThemeConfig(source: string): AppearancePreferences {
  let input: Record<string, unknown>;
  try { input = record(JSON.parse(source)) ?? (() => { throw new Error('主题格式无效'); })(); }
  catch { throw new Error('主题格式无效'); }
  if (input.version !== 1 || Object.keys(input).some((key) => !themeConfigKeys.has(key))) throw new Error('主题格式无效');
  if (input.customAccent !== undefined && !isHexColor(input.customAccent)) throw new Error('主题格式无效');
  if (input.uiFontScale !== undefined && ![90, 95, 100, 105, 110, 115, 120].includes(Number(input.uiFontScale))) throw new Error('主题格式无效');
  const colors = record(input.colors) ?? (input.colors === undefined ? {} : null);
  if (!colors || Object.keys(colors).some((key) => !ADVANCED_COLOR_KEYS.includes(key as AdvancedColorKey)) || Object.values(colors).some((value) => !isHexColor(value))) throw new Error('主题格式无效');
  const appearance: AppearancePreferences = {
    themePreference: importedEnum(input, 'baseTheme', ['SYSTEM', 'LIGHT', 'DARK'], defaultAppearancePreferences.themePreference),
    accentPreset: importedEnum(input, 'accentPreset', ['FIELORA', 'BLUE', 'TEAL', 'ORANGE', 'CUSTOM'], defaultAppearancePreferences.accentPreset),
    customAccent: typeof input.customAccent === 'string' ? input.customAccent.toUpperCase() : defaultAppearancePreferences.customAccent,
    density: importedEnum(input, 'density', ['COMFORTABLE', 'STANDARD', 'COMPACT'], defaultAppearancePreferences.density),
    contrast: importedEnum(input, 'contrast', ['SOFT', 'STANDARD', 'HIGH'], defaultAppearancePreferences.contrast),
    radius: importedEnum(input, 'radius', ['SMALL', 'STANDARD', 'LARGE'], defaultAppearancePreferences.radius),
    uiFont: importedEnum(input, 'uiFont', ['SYSTEM', 'INTER', 'SEGOE_UI', 'PINGFANG_SC', 'MICROSOFT_YAHEI'], defaultAppearancePreferences.uiFont),
    codeFont: importedEnum(input, 'codeFont', ['SYSTEM_MONO', 'CONSOLAS', 'CASCADIA_CODE', 'JETBRAINS_MONO'], defaultAppearancePreferences.codeFont),
    uiFontScale: input.uiFontScale === undefined ? defaultAppearancePreferences.uiFontScale : Number(input.uiFontScale) as UiFontScale,
    translucentSidebar: importedBoolean(input, 'translucentSidebar', defaultAppearancePreferences.translucentSidebar),
    softElevation: importedBoolean(input, 'softElevation', defaultAppearancePreferences.softElevation),
    reducedMotionPreference: importedEnum(input, 'reducedMotionPreference', ['SYSTEM', 'REDUCE', 'FULL'], defaultAppearancePreferences.reducedMotionPreference),
    smoothScrolling: importedBoolean(input, 'smoothScrolling', defaultAppearancePreferences.smoothScrolling),
    pointerCursor: importedBoolean(input, 'pointerCursor', defaultAppearancePreferences.pointerCursor),
    highContrast: importedBoolean(input, 'highContrast', defaultAppearancePreferences.highContrast),
    advancedColorOverrides: normalizeAdvancedColors(colors),
  };
  const resolved = appearance.themePreference === 'DARK' ? 'DARK' : 'LIGHT';
  const canvas = appearance.advancedColorOverrides.canvas ?? (resolved === 'DARK' ? '#17191D' : '#FFFFFF');
  const foreground = appearance.advancedColorOverrides.foreground ?? (resolved === 'DARK' ? '#F1F2F5' : '#181A1F');
  if (colorContrast(canvas, foreground) < 4.5) throw new Error('主题格式无效');
  return appearance;
}
