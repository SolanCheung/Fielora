import { useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ResizableDivider } from './ResizableDivider';

const sharedNavigationWidthKey = 'fielora:workspace-navigation-width';

export function readWorkspaceNavigationWidth(fallback: number, legacyKey?: string): number {
  const stored = window.localStorage.getItem(sharedNavigationWidthKey)
    ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null)
    ?? String(fallback);
  const value = Number.parseFloat(stored);
  return Number.isFinite(value) ? Math.min(Math.max(value, 190), 360) : fallback;
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

export function WorkspaceSurface({ className, testId, navigation, navigationWidth, onNavigationWidthChange, navigationMin = 190, navigationMax = 360, navigationResizerTestId, navigationResizerClassName = '', surfaceRef, style, children }: WorkspaceSurfaceProps) {
  const localRef = useRef<HTMLElement>(null);
  const rootRef = surfaceRef ?? localRef;
  const surfaceStyle = { ...style, '--workspace-navigation-width': `${navigationWidth}px` } as CSSProperties;

  return <main ref={rootRef} className={`workspace-surface ${className}`} style={surfaceStyle} data-testid={testId}>
    {navigation}
    <ResizableDivider
      label="调整工作区导航宽度"
      value={navigationWidth}
      min={navigationMin}
      max={navigationMax}
      onResize={(clientX) => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (rect) onNavigationWidthChange(clientX - rect.left);
      }}
      onKeyboardResize={(delta) => onNavigationWidthChange(navigationWidth + delta)}
      testId={navigationResizerTestId}
      className={`workspace-navigation-resizer ${navigationResizerClassName}`.trim()}
    />
    {children}
  </main>;
}
