export type WindowSurfaceTheme = 'LIGHT' | 'DARK';

export interface WindowSurfaceColors {
  background: string;
  symbols: string;
  height: number;
}

/** Mirrors --fl-color-app and --fl-color-icon for the native WCO surface. */
export function windowSurfaceColors(theme: WindowSurfaceTheme): WindowSurfaceColors {
  return theme === 'DARK'
    ? { background: '#17191e', symbols: '#c4c9d1', height: 44 }
    : { background: '#f9fafc', symbols: '#505660', height: 44 };
}
