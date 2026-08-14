export interface SenderLike {
  senderId: number;
  expectedSenderId: number;
  frameUrl: string;
  isMainFrame: boolean;
}

export function trustedOriginFor(isPackaged: boolean, rendererEntryUrl?: string): string {
  if (isPackaged) return 'fielora://app';
  if (!rendererEntryUrl) throw new Error('Forge renderer entry URL is unavailable');
  const parsed = new URL(rendererEntryUrl);
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
  if (!loopback || !['http:', 'https:'].includes(parsed.protocol) || !parsed.port) {
    throw new Error('Development renderer entry must use one exact loopback origin');
  }
  return parsed.origin;
}

export function assertTrustedSender(sender: SenderLike, trustedOrigin: string): void {
  if (sender.senderId !== sender.expectedSenderId || !sender.isMainFrame) {
    throw new Error('Untrusted bridge sender');
  }
  if (originOf(sender.frameUrl) !== trustedOrigin) {
    throw new Error('Untrusted bridge origin');
  }
}

export function isAllowedNavigation(targetUrl: string, trustedOrigin: string): boolean {
  try {
    return originOf(targetUrl) === trustedOrigin;
  } catch {
    return false;
  }
}

function originOf(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol === 'fielora:') return `fielora://${parsed.host}`;
  return parsed.origin;
}
