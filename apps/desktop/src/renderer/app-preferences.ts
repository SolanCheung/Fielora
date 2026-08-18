export type StartupDestination = 'PROJECTS' | 'NOW' | 'BROWSE';
export type InterfaceDensity = 'COMFORTABLE' | 'COMPACT';

export interface AppPreferences {
  startupDestination: StartupDestination;
  density: InterfaceDensity;
  reduceMotion: boolean;
}

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'fielora.ui.preferences.v1';

export const defaultAppPreferences: AppPreferences = {
  startupDestination: 'PROJECTS',
  density: 'COMFORTABLE',
  reduceMotion: false,
};

export function readAppPreferences(storage: Pick<PreferenceStorage, 'getItem'>): AppPreferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultAppPreferences;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      startupDestination: ['PROJECTS', 'NOW', 'BROWSE'].includes(String(parsed.startupDestination))
        ? parsed.startupDestination as StartupDestination
        : defaultAppPreferences.startupDestination,
      density: ['COMFORTABLE', 'COMPACT'].includes(String(parsed.density))
        ? parsed.density as InterfaceDensity
        : defaultAppPreferences.density,
      reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : defaultAppPreferences.reduceMotion,
    };
  } catch {
    return defaultAppPreferences;
  }
}

export function writeAppPreferences(storage: Pick<PreferenceStorage, 'setItem'>, preferences: AppPreferences): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function applyAppPreferences(target: HTMLElement, preferences: AppPreferences): void {
  target.dataset.uiDensity = preferences.density.toLowerCase();
  target.dataset.reduceMotion = String(preferences.reduceMotion);
}
