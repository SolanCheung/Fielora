interface WindowWebContentsTarget {
  isDestroyed(): boolean;
}

interface WindowTarget {
  isDestroyed(): boolean;
  webContents: WindowWebContentsTarget;
}

interface FocusableWindowTarget extends WindowTarget {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

export function usableWindow<T extends WindowTarget>(target: T | undefined): T | undefined {
  if (!target) return undefined;
  try {
    return target.isDestroyed() || target.webContents.isDestroyed() ? undefined : target;
  } catch {
    return undefined;
  }
}

export function withUsableWindow<T extends WindowTarget>(
  target: T | undefined,
  action: (window: T) => void,
): boolean {
  const window = usableWindow(target);
  if (!window) return false;
  try {
    action(window);
    return true;
  } catch {
    // Electron can invalidate a native BrowserWindow between lifecycle events.
    // A late notification or second-instance signal must never crash Main.
    return false;
  }
}

export function focusUsableWindow<T extends FocusableWindowTarget>(target: T | undefined): boolean {
  return withUsableWindow(target, (window) => {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
}
