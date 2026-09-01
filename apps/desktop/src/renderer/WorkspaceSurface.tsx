import { useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ResizableDivider } from './ResizableDivider';

const sharedNavigationWidthKey = 'fielora:workspace-navigation-width';

export const WORKSPACE_NAVIGATION_DEFAULT_WIDTH = 304;
export const WORKSPACE_NAVIGATION_MIN_WIDTH = 220;
export const WORKSPACE_NAVIGATION_MAX_WIDTH = 560;

function clampNavigationWidth(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function readWorkspaceNavigationWidth(fallback: number, legacyKey?: string): number {
  const stored = window.localStorage.getItem(sharedNavigationWidthKey)
    ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null)
    ?? String(fallback);
  const value = Number.parseFloat(stored);
  if (!Number.isFinite(value)) return fallback;
  if (value < WORKSPACE_NAVIGATION_MIN_WIDTH) return fallback;
  return Math.min(value, WORKSPACE_NAVIGATION_MAX_WIDTH);
}

export function persistWorkspaceNavigationWidth(value: number, legacyKey?: string): void {
  const serialized = String(Math.round(value));
  window.localStorage.setItem(sharedNavigationWidthKey, serialized);
  if (legacyKey) window.localStorage.setItem(legacyKey, serialized);
}

interface WorkspaceSurfaceProps {
  className: string;
  testId: string;
  navigation: ReactNode;
  navigationWidth: number;
  onNavigationWidthChange: (value: number) => void;
  navigationMin?: number;
  navigationMax?: number;
  navigationResizerTestId: string;
  navigationResizerClassName?: string;
  surfaceRef?: RefObject<HTMLElement | null>;
  style?: CSSProperties;
  children: ReactNode;
}

export function WorkspaceSurface({ className, testId, navigation, navigationWidth, onNavigationWidthChange, navigationMin = WORKSPACE_NAVIGATION_MIN_WIDTH, navigationMax = WORKSPACE_NAVIGATION_MAX_WIDTH, navigationResizerTestId, navigationResizerClassName = '', surfaceRef, style, children }: WorkspaceSurfaceProps) {
  const localRef = useRef<HTMLElement>(null);
  const rootRef = surfaceRef ?? localRef;
  const surfaceStyle = { ...style, '--workspace-navigation-width': `${navigationWidth}px` } as CSSProperties;
  return <main ref={rootRef} className={`workspace-surface ${className}`} style={surfaceStyle} data-layout-owner="app-workspace" data-testid={testId}>
    {navigation}
    <ResizableDivider
      label="调整工作区导航宽度"
      value={navigationWidth}
      min={navigationMin}
      max={navigationMax}
      onResize={(clientX) => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        rootRef.current?.style.setProperty('--workspace-navigation-width', `${clampNavigationWidth(clientX - rect.left, navigationMin, navigationMax)}px`);
      }}
      onResizeEnd={(clientX) => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (rect) onNavigationWidthChange(clampNavigationWidth(clientX - rect.left, navigationMin, navigationMax));
      }}
      onKeyboardResize={(delta) => onNavigationWidthChange(clampNavigationWidth(navigationWidth + delta, navigationMin, navigationMax))}
      testId={navigationResizerTestId}
      className={`workspace-navigation-resizer ${navigationResizerClassName}`.trim()}
    />
    {children}
  </main>;
}
