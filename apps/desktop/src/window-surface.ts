export type WindowSurfaceTheme = 'LIGHT' | 'DARK';

export interface WindowSurfaceColors {
  background: string;
  symbols: string;
  height: number;
}

/** Mirrors the Brand Chrome caption edge for the native WCO surface. */
export function windowSurfaceColors(theme: WindowSurfaceTheme, backgroundOverride?: string): WindowSurfaceColors {
  const background = backgroundOverride ?? (theme === 'DARK' ? '#2b2229' : '#ffeff2');
  return theme === 'DARK'
    ? { background, symbols: '#f8f1fa', height: 44 }
    : { background, symbols: '#251a2d', height: 44 };
}
