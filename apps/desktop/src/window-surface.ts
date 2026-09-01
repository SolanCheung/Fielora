export type WindowSurfaceTheme = 'LIGHT' | 'DARK';

export interface WindowSurfaceColors {
  background: string;
  symbols: string;
  height: number;
}

/** Mirrors the Brand Chrome caption edge for the native WCO surface. */
export function windowSurfaceColors(theme: WindowSurfaceTheme): WindowSurfaceColors {
  return theme === 'DARK'
    ? { background: '#2b2229', symbols: '#f8f1fa', height: 44 }
    : { background: '#f9e8ed', symbols: '#251a2d', height: 44 };
}
