import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ResizableDivider } from './ResizableDivider';

const sharedNavigationWidthKey = 'fielora:workspace-navigation-width';

export const WORKSPACE_NAVIGATION_DEFAULT_WIDTH = 304;
export const WORKSPACE_NAVIGATION_MIN_WIDTH = 220;
export const WORKSPACE_NAVIGATION_MAX_WIDTH = 560;
const NAVIGATION_COLLAPSE_THRESHOLD = 112;
const NAVIGATION_RESTORE_THRESHOLD = 168;

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
  const collapsedDuringDragRef = useRef(false);
  const dragGeometryRef = useRef<{ left: number; maximum: number } | null>(null);
  const rootRef = surfaceRef ?? localRef;
  const surfaceStyle = { ...style, '--workspace-navigation-width': `${navigationWidth}px` } as CSSProperties;
  useLayoutEffect(() => {
    (rootRef.current?.firstElementChild as HTMLElement | null)?.style.setProperty('--navigation-content-width', `${navigationWidth}px`);
  }, [navigationWidth, rootRef]);
  const setSidebarCollapsed = (collapsed: boolean) => {
    if (collapsedDuringDragRef.current === collapsed) return;
    collapsedDuringDragRef.current = collapsed;
    window.dispatchEvent(new CustomEvent('fielora:set-sidebar-collapsed', { detail: collapsed }));
  };
  const resizeNavigation = (clientX: number, commit: boolean) => {
    const geometry = dragGeometryRef.current;
    if (!geometry) return;
    const rawWidth = clientX - geometry.left;
    if (!collapsedDuringDragRef.current && rawWidth <= NAVIGATION_COLLAPSE_THRESHOLD) {
      setSidebarCollapsed(true);
      return;
    }
    if (collapsedDuringDragRef.current) {
      if (rawWidth < NAVIGATION_RESTORE_THRESHOLD) return;
      setSidebarCollapsed(false);
    }
    const width = clampNavigationWidth(rawWidth, navigationMin, geometry.maximum);
    rootRef.current?.style.setProperty('--workspace-navigation-width', `${width}px`);
    (rootRef.current?.firstElementChild as HTMLElement | null)?.style.setProperty('--navigation-content-width', `${width}px`);
    if (commit) onNavigationWidthChange(width);
  };
  return <main ref={rootRef} className={`workspace-surface ${className}`} style={surfaceStyle} data-layout-owner="app-workspace" data-testid={testId}>
    {navigation}
    <ResizableDivider
      label="调整工作区导航宽度"
      value={navigationWidth}
      min={navigationMin}
      max={navigationMax}
      onResizeStart={(clientX) => {
        collapsedDuringDragRef.current = document.body.dataset.sidebarCollapsed === 'true';
        const width = rootRef.current?.firstElementChild?.getBoundingClientRect().width ?? navigationWidth;
        dragGeometryRef.current = { left: clientX - width, maximum: navigationMax };
      }}
      onResize={(clientX) => resizeNavigation(clientX, false)}
      onResizeEnd={(clientX) => { resizeNavigation(clientX, true); dragGeometryRef.current = null; }}
      onKeyboardResize={(delta) => onNavigationWidthChange(clampNavigationWidth(navigationWidth + delta, navigationMin, navigationMax))}
      testId={navigationResizerTestId}
      className={`workspace-navigation-resizer ${navigationResizerClassName}`.trim()}
    />
    {children}
  </main>;
}
