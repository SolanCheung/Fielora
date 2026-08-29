export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
export const MAX_SCREENSHOT_WIDTH = 4096;
export const MAX_SCREENSHOT_HEIGHT = 4096;
export const MAX_SCREENSHOT_PIXELS = 16_777_216;
export const DEFAULT_SCREENSHOT_TIMEOUT_MS = 5_000;

export interface BrowserCaptureIdentity {
  page_id: string;
  navigation_generation: number;
  url: string;
}

export interface BrowserCaptureGuardOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function waitForBoundedCapture<T>(
  capture: Promise<T>,
  options: BrowserCaptureGuardOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SCREENSHOT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error('Invalid screenshot timeout');
  }
  if (options.signal?.aborted) throw new Error('Screenshot capture cancelled');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Screenshot capture timed out')), timeoutMs);
    });
    const cancelled = new Promise<never>((_resolve, reject) => {
      if (!options.signal) return;
      onAbort = () => reject(new Error('Screenshot capture cancelled'));
      options.signal.addEventListener('abort', onAbort, { once: true });
    });
    return await Promise.race([capture, timeout, cancelled]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener('abort', onAbort);
  }
}

export function assertCaptureIdentityCurrent(
  captured: BrowserCaptureIdentity,
  current: BrowserCaptureIdentity | null,
): void {
  if (!current
    || current.page_id !== captured.page_id
    || current.navigation_generation !== captured.navigation_generation
    || current.url !== captured.url) {
    throw new Error('Browse screenshot became stale');
  }
}

export function assertScreenshotBounds(bytes: number, width: number, height: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_SCREENSHOT_BYTES
    || !Number.isSafeInteger(width) || width < 1 || width > MAX_SCREENSHOT_WIDTH
    || !Number.isSafeInteger(height) || height < 1 || height > MAX_SCREENSHOT_HEIGHT
    || width * height > MAX_SCREENSHOT_PIXELS) {
    throw new Error('Browse screenshot exceeds safe bounds');
  }
}
