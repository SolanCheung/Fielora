export type ThemeBase = 'LIGHT' | 'DARK';

export interface Theme {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly baseTheme: ThemeBase;
}

const THEME_KEYS = new Set<keyof Theme>(['id', 'name', 'version', 'author', 'baseTheme']);
const THEME_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const THEME_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const FIELORA_LIGHT_THEME: Theme = Object.freeze({
  id: 'fielora-light',
  name: 'Fielora Light',
  version: '1.0.0',
  author: 'Fielora',
  baseTheme: 'LIGHT',
});

export const FIELORA_DARK_THEME: Theme = Object.freeze({
  id: 'fielora-dark',
  name: 'Fielora Dark',
  version: '1.0.0',
  author: 'Fielora',
  baseTheme: 'DARK',
});

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function boundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximumLength;
}

function validateTheme(value: unknown): Theme {
  const input = plainRecord(value);
  if (!input || Object.keys(input).some((key) => !THEME_KEYS.has(key as keyof Theme))) throw new Error('Invalid theme schema');
  if (!boundedText(input.id, 64) || !THEME_ID.test(input.id)) throw new Error('Invalid theme schema');
  if (!boundedText(input.name, 120) || !boundedText(input.author, 120)) throw new Error('Invalid theme schema');
  if (!boundedText(input.version, 64) || !THEME_VERSION.test(input.version)) throw new Error('Invalid theme schema');
  if (input.baseTheme !== 'LIGHT' && input.baseTheme !== 'DARK') throw new Error('Invalid theme schema');
  return Object.freeze({
    id: input.id,
    name: input.name,
    version: input.version,
    author: input.author,
    baseTheme: input.baseTheme,
  });
}

export class ThemeRegistry {
  readonly #themes = new Map<string, Theme>();
  readonly #fallbackId: string;
  #activeId: string;

  constructor(fallbackTheme: unknown, themes: readonly unknown[] = []) {
    const fallback = this.register(fallbackTheme);
    this.#fallbackId = fallback.id;
    this.#activeId = fallback.id;
    for (const theme of themes) this.register(theme);
  }

  register(value: unknown): Theme {
    const theme = validateTheme(value);
    if (this.#themes.has(theme.id)) throw new Error(`Theme already registered: ${theme.id}`);
    this.#themes.set(theme.id, theme);
    return theme;
  }

  get(id: string): Theme | undefined {
    return this.#themes.get(id);
  }

  list(): Theme[] {
    return [...this.#themes.values()];
  }

  activate(id: string): Theme {
    const theme = this.get(id);
    if (!theme) return this.fallback();
    this.#activeId = theme.id;
    return theme;
  }

  get activeTheme(): Theme {
    return this.get(this.#activeId) ?? this.fallback();
  }

  fallback(): Theme {
    const theme = this.get(this.#fallbackId);
    if (!theme) throw new Error('Theme registry fallback is unavailable');
    this.#activeId = theme.id;
    return theme;
  }
}

export function themeIdForBase(baseTheme: ThemeBase): string {
  return baseTheme === 'DARK' ? FIELORA_DARK_THEME.id : FIELORA_LIGHT_THEME.id;
}

export function createBuiltinThemeRegistry(): ThemeRegistry {
  return new ThemeRegistry(FIELORA_LIGHT_THEME, [FIELORA_DARK_THEME]);
}

export const themeRegistry = createBuiltinThemeRegistry();
