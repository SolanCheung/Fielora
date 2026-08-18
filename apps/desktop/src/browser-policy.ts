import type { BrowserViewBounds } from './browser-types';

const MAX_URL_BYTES = 8192;
const ERROR_PREFIX = 'FIELORA_BROWSER_ERROR:';

export const BROWSER_ERROR_CODES = {
  inputEmpty: 'INPUT_EMPTY',
  inputTooLong: 'INPUT_TOO_LONG',
  invalidUrl: 'INVALID_URL',
  unsupportedProtocol: 'UNSUPPORTED_PROTOCOL',
  privilegedOrigin: 'PRIVILEGED_ORIGIN',
  credentialsInUrl: 'CREDENTIALS_IN_URL',
  urlTooLong: 'URL_TOO_LONG',
} as const;

type BrowserErrorCode = (typeof BROWSER_ERROR_CODES)[keyof typeof BROWSER_ERROR_CODES];

const USER_MESSAGES: Record<BrowserErrorCode, string> = {
  INPUT_EMPTY: '请输入网址或搜索内容。',
  INPUT_TOO_LONG: '输入内容过长，请缩短后重试。',
  INVALID_URL: '无法识别这个地址，请检查后重试。',
  UNSUPPORTED_PROTOCOL: '无法打开这个地址。Browse 不支持此协议。',
  PRIVILEGED_ORIGIN: '无法从 Browse 打开 Fielora 的受保护页面。',
  CREDENTIALS_IN_URL: '出于安全考虑，不能打开包含用户名或密码的网址。',
  URL_TOO_LONG: '网址过长，请缩短后重试。',
};

export function browserPolicyError(code: BrowserErrorCode, diagnostic: string): Error {
  return new Error(`${ERROR_PREFIX}${code}: ${diagnostic}`);
}

export function toBrowserUserMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason ?? '');
  for (const [code, message] of Object.entries(USER_MESSAGES)) {
    if (raw.includes(`${ERROR_PREFIX}${code}`)) return message;
  }
  if (raw.includes('Browse page no longer exists')) return '这个页面已经关闭。';
  return 'Browse 暂时无法完成此操作，请重试。';
}

export type BrowserAddressKind = 'URL' | 'LOCAL_URL' | 'LOCAL_FILE' | 'SEARCH';

export type BrowserNavigationInitiator = 'USER' | 'REMOTE_PAGE' | 'LOCAL_PAGE' | 'OPAQUE_PAGE';

export interface BrowserAddressClassification {
  kind: BrowserAddressKind;
  url: string;
}

export interface BrowserSearchProvider {
  readonly id: string;
  readonly name: string;
  searchUrl(query: string): string;
}

export const DEFAULT_SEARCH_PROVIDER: BrowserSearchProvider = {
  id: 'google',
  name: 'Google',
  searchUrl(query: string): string {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  },
};

export function classifyBrowserAddress(
  address: string,
  searchProvider: BrowserSearchProvider = DEFAULT_SEARCH_PROVIDER,
): BrowserAddressClassification {
  const input = address.trim();
  if (!input) throw browserPolicyError(BROWSER_ERROR_CODES.inputEmpty, 'The Omnibox input is empty');
  if (Buffer.byteLength(input, 'utf8') > MAX_URL_BYTES) throw browserPolicyError(BROWSER_ERROR_CODES.inputTooLong, 'The Omnibox input exceeds the byte limit');

  if (hasLocalAddressSyntax(input)) {
    return { kind: 'LOCAL_URL', url: parseBrowseUrl(`http://${input}`) };
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(input)) {
    const url = parseBrowseUrl(input);
    return { kind: url.startsWith('file:') ? 'LOCAL_FILE' : 'URL', url };
  }
  if (hasDomainSyntax(input)) {
    return { kind: 'URL', url: parseBrowseUrl(`https://${input}`) };
  }
  const searchUrl = searchProvider.searchUrl(input);
  if (Buffer.byteLength(searchUrl, 'utf8') > MAX_URL_BYTES) throw browserPolicyError(BROWSER_ERROR_CODES.inputTooLong, 'The search target exceeds the byte limit');
  return { kind: 'SEARCH', url: parseBrowseUrl(searchUrl) };
}

export function normalizeBrowserAddress(
  address: string,
  searchProvider: BrowserSearchProvider = DEFAULT_SEARCH_PROVIDER,
): string {
  return classifyBrowserAddress(address, searchProvider).url;
}

function parseBrowseUrl(candidate: string): string {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw browserPolicyError(BROWSER_ERROR_CODES.invalidUrl, 'URL parsing failed');
  }

  if (parsed.protocol === 'fielora:') {
    throw browserPolicyError(BROWSER_ERROR_CODES.privilegedOrigin, 'Loose Browse cannot enter the trusted application origin');
  }
  const isWeb = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const isLocalFile = parsed.protocol === 'file:' && (!parsed.hostname || parsed.hostname === 'localhost');
  if ((!isWeb || !parsed.hostname) && !isLocalFile) {
    throw browserPolicyError(BROWSER_ERROR_CODES.unsupportedProtocol, `Rejected protocol: ${parsed.protocol || '(missing)'}`);
  }
  if (parsed.username || parsed.password) throw browserPolicyError(BROWSER_ERROR_CODES.credentialsInUrl, 'Credentials are not permitted in Browse URLs');
  if (Buffer.byteLength(parsed.toString(), 'utf8') > MAX_URL_BYTES) throw browserPolicyError(BROWSER_ERROR_CODES.urlTooLong, 'The normalized URL exceeds the byte limit');
  return parsed.toString();
}

function hasLocalAddressSyntax(input: string): boolean {
  const authority = input.split(/[/?#]/, 1)[0] ?? '';
  if (/^localhost(?::\d+)?$/i.test(authority)) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(authority);
}

function hasDomainSyntax(input: string): boolean {
  const authority = input.split(/[/?#]/, 1)[0] ?? '';
  const match = authority.match(/^([^:]+)(?::(\d+))?$/);
  if (!match) return false;
  const [, hostname, port] = match;
  if (!hostname || (port && Number(port) > 65535)) return false;
  return /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/i.test(hostname);
}

export function browserNavigationInitiatorForDocument(value: string): BrowserNavigationInitiator {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return 'REMOTE_PAGE';
    if (parsed.protocol === 'file:') return 'LOCAL_PAGE';
    return 'OPAQUE_PAGE';
  } catch {
    return 'OPAQUE_PAGE';
  }
}

export function isAllowedBrowseNavigation(value: string, initiator: BrowserNavigationInitiator): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'file:') {
      return (!parsed.hostname || parsed.hostname === 'localhost')
        && (initiator === 'USER' || initiator === 'LOCAL_PAGE');
    }
    if (parsed.protocol === 'about:') return parsed.pathname === 'blank' || parsed.pathname === 'srcdoc';
    if (parsed.protocol === 'blob:') return parsed.origin.startsWith('http://') || parsed.origin.startsWith('https://');
    return false;
  } catch {
    return false;
  }
}

export function allowedWindowOpenTarget(value: string, initiator: BrowserNavigationInitiator): string | null {
  return isAllowedBrowseNavigation(value, initiator) ? value : null;
}

export function fitBrowserBounds(requested: BrowserViewBounds, available: BrowserViewBounds): BrowserViewBounds {
  const left = Math.min(Math.max(requested.x, available.x), available.x + available.width);
  const top = Math.min(Math.max(requested.y, available.y), available.y + available.height);
  const right = Math.min(Math.max(requested.x + requested.width, left), available.x + available.width);
  const bottom = Math.min(Math.max(requested.y + requested.height, top), available.y + available.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
