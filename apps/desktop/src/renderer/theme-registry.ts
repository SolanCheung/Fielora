export const OFFICIAL_THEME_ID = 'fielora' as const;
export const OFFICIAL_DESIGN_LANGUAGE = 'Fielora Glass' as const;

export interface OfficialThemeDefinition {
  readonly id: typeof OFFICIAL_THEME_ID;
  readonly name: 'Fielora';
  readonly designLanguage: typeof OFFICIAL_DESIGN_LANGUAGE;
  readonly version: string;
  readonly author: 'Fielora';
  readonly builtin: true;
}

export const FIELORA_THEME: OfficialThemeDefinition = Object.freeze({
  id: OFFICIAL_THEME_ID,
  name: 'Fielora',
  designLanguage: OFFICIAL_DESIGN_LANGUAGE,
  version: '1.0.0',
  author: 'Fielora',
  builtin: true,
});

export const CUSTOM_THEME_PACKAGE_SEAM = Object.freeze({
  status: 'SEAM_ONLY',
  schemaVersion: 1,
  format: 'DECLARATIVE_ONLY',
  localImportEnabled: false,
  allowedTokenGroups: Object.freeze(['colors', 'surfaces', 'effects', 'radius', 'shadow', 'blur', 'opacity', 'icons', 'motion']),
  forbiddenCapabilities: Object.freeze(['javascript', 'typescript', 'renderer-code', 'css-selectors', 'dom-mutation', 'network', 'filesystem', 'credentials', 'tools', 'runtime']),
});

export class ThemeRegistry {
  readonly #officialTheme = FIELORA_THEME;

  listOfficial(): readonly OfficialThemeDefinition[] {
    return [this.#officialTheme];
  }

  get officialTheme(): OfficialThemeDefinition {
    return this.#officialTheme;
  }

  get(id: string): OfficialThemeDefinition | undefined {
    return id === this.#officialTheme.id ? this.#officialTheme : undefined;
  }
}

export function createBuiltinThemeRegistry(): ThemeRegistry {
  return new ThemeRegistry();
}

export const themeRegistry = createBuiltinThemeRegistry();
