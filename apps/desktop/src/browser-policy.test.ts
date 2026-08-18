import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_ERROR_CODES,
  classifyBrowserAddress,
  allowedWindowOpenTarget,
  browserNavigationInitiatorForDocument,
  browserPolicyError,
  DEFAULT_SEARCH_PROVIDER,
  fitBrowserBounds,
  isAllowedBrowseNavigation,
  normalizeBrowserAddress,
  toBrowserUserMessage,
} from './browser-policy.ts';

test('Browser policy errors map to stable product messages across an IPC wrapper', () => {
  const policyError = browserPolicyError(BROWSER_ERROR_CODES.unsupportedProtocol, 'Browse only permits HTTP(S)');
  const ipcWrapped = new Error(`Error invoking remote method 'fielora:browser:navigate': ${policyError.message}`);
  assert.equal(toBrowserUserMessage(ipcWrapped), '无法打开这个地址。Browse 不支持此协议。');
  assert.equal(toBrowserUserMessage(ipcWrapped).includes('Error invoking remote method'), false);
  assert.equal(toBrowserUserMessage(ipcWrapped).includes('FIELORA_BROWSER_ERROR'), false);
});

test('unknown Electron and IPC failures never surface their raw exception text', () => {
  const raw = new Error("Error invoking remote method 'fielora:browser:navigate': Error: ERR_FAILED (-2)");
  assert.equal(toBrowserUserMessage(raw), 'Browse 暂时无法完成此操作，请重试。');
  assert.equal(toBrowserUserMessage('Browse page no longer exists'), '这个页面已经关闭。');
});

test('Omnibox classifies explicit URLs and clear domains without guessing', () => {
  assert.deepEqual(classifyBrowserAddress('https://www.bilibili.com/'), { kind: 'URL', url: 'https://www.bilibili.com/' });
  assert.deepEqual(classifyBrowserAddress('http://example.com'), { kind: 'URL', url: 'http://example.com/' });
  assert.deepEqual(classifyBrowserAddress('bilibili.com'), { kind: 'URL', url: 'https://bilibili.com/' });
  assert.deepEqual(classifyBrowserAddress('www.bilibili.com'), { kind: 'URL', url: 'https://www.bilibili.com/' });
  assert.deepEqual(classifyBrowserAddress('example.co.jp/path'), { kind: 'URL', url: 'https://example.co.jp/path' });
  assert.deepEqual(classifyBrowserAddress('example.com/path?q=one#part'), { kind: 'URL', url: 'https://example.com/path?q=one#part' });
  assert.deepEqual(classifyBrowserAddress('  bilibili.com/path?q=one#part  '), { kind: 'URL', url: 'https://bilibili.com/path?q=one#part' });
  assert.equal(normalizeBrowserAddress('example.com/docs'), 'https://example.com/docs');
});

test('Omnibox keeps localhost and IPv4 development addresses local', () => {
  assert.deepEqual(classifyBrowserAddress('localhost:3000'), { kind: 'LOCAL_URL', url: 'http://localhost:3000/' });
  assert.deepEqual(classifyBrowserAddress('localhost:3000/path?mode=dev#top'), { kind: 'LOCAL_URL', url: 'http://localhost:3000/path?mode=dev#top' });
  assert.deepEqual(classifyBrowserAddress('127.0.0.1:5173'), { kind: 'LOCAL_URL', url: 'http://127.0.0.1:5173/' });
  assert.equal(normalizeBrowserAddress('http://127.0.0.1:8080/page'), 'http://127.0.0.1:8080/page');
});

test('Omnibox accepts an explicit local file without treating it as a web URL or search', () => {
  assert.deepEqual(classifyBrowserAddress('file:///C:/Windows/win.ini'), {
    kind: 'LOCAL_FILE',
    url: 'file:///C:/Windows/win.ini',
  });
  assert.deepEqual(classifyBrowserAddress('  file:///C:/Program%20Files/readme.html  '), {
    kind: 'LOCAL_FILE',
    url: 'file:///C:/Program%20Files/readme.html',
  });
});

test('Omnibox sends ordinary words and natural language to the default search provider', () => {
  assert.deepEqual(classifyBrowserAddress('bilibili'), { kind: 'SEARCH', url: 'https://www.google.com/search?q=bilibili' });
  assert.deepEqual(classifyBrowserAddress('github'), { kind: 'SEARCH', url: 'https://www.google.com/search?q=github' });
  assert.deepEqual(classifyBrowserAddress('中文'), { kind: 'SEARCH', url: `https://www.google.com/search?q=${encodeURIComponent('中文')}` });
  assert.deepEqual(classifyBrowserAddress('七夕约会怎么穿'), { kind: 'SEARCH', url: `https://www.google.com/search?q=${encodeURIComponent('七夕约会怎么穿')}` });
  assert.deepEqual(classifyBrowserAddress('electron webcontentsview'), { kind: 'SEARCH', url: 'https://www.google.com/search?q=electron%20webcontentsview' });
  assert.deepEqual(classifyBrowserAddress('  C++ & Rust?  '), { kind: 'SEARCH', url: 'https://www.google.com/search?q=C%2B%2B%20%26%20Rust%3F' });
  assert.equal(DEFAULT_SEARCH_PROVIDER.id, 'google');
  assert.equal(DEFAULT_SEARCH_PROVIDER.name, 'Google');
  assert.equal(DEFAULT_SEARCH_PROVIDER.searchUrl('中文 #tag'), `https://www.google.com/search?q=${encodeURIComponent('中文 #tag')}`);
});

test('Omnibox search classification accepts a replaceable provider without changing URL classification', () => {
  const testProvider = {
    id: 'fixture',
    name: 'Fixture Search',
    searchUrl(query: string): string {
      return `https://search.example/?query=${encodeURIComponent(query)}`;
    },
  };

  assert.deepEqual(classifyBrowserAddress('github', testProvider), {
    kind: 'SEARCH',
    url: 'https://search.example/?query=github',
  });
  assert.equal(normalizeBrowserAddress('中文 #tag', testProvider), `https://search.example/?query=${encodeURIComponent('中文 #tag')}`);
  assert.deepEqual(classifyBrowserAddress('example.com/path', testProvider), {
    kind: 'URL',
    url: 'https://example.com/path',
  });
});

test('Omnibox rejects empty, invalid, privileged, and non-local file URLs', () => {
  assert.throws(() => classifyBrowserAddress('   '), /FIELORA_BROWSER_ERROR:INPUT_EMPTY/);
  assert.throws(() => classifyBrowserAddress('https://'), /FIELORA_BROWSER_ERROR:INVALID_URL/);
  assert.throws(() => classifyBrowserAddress('https://exa mple.com'), /FIELORA_BROWSER_ERROR:INVALID_URL/);
  assert.throws(() => normalizeBrowserAddress('file://remote-host/share/page.html'), /FIELORA_BROWSER_ERROR:UNSUPPORTED_PROTOCOL/);
  assert.throws(() => normalizeBrowserAddress('fielora://app/index.html'), /FIELORA_BROWSER_ERROR:PRIVILEGED_ORIGIN/);
  assert.throws(() => normalizeBrowserAddress('javascript:alert(1)'), /FIELORA_BROWSER_ERROR:UNSUPPORTED_PROTOCOL/);
  assert.throws(() => normalizeBrowserAddress('https://user:secret@example.com/'), /FIELORA_BROWSER_ERROR:CREDENTIALS_IN_URL/);
});

test('navigation policy decides local file access from both initiator and target', () => {
  const localFile = 'file:///C:/Windows/win.ini';
  assert.equal(isAllowedBrowseNavigation('https://example.com/', 'REMOTE_PAGE'), true);
  assert.equal(isAllowedBrowseNavigation('http://example.com/', 'LOCAL_PAGE'), true);
  assert.equal(isAllowedBrowseNavigation('about:blank', 'REMOTE_PAGE'), true);
  assert.equal(isAllowedBrowseNavigation('blob:https://example.com/id', 'REMOTE_PAGE'), true);
  assert.equal(isAllowedBrowseNavigation(localFile, 'USER'), true);
  assert.equal(isAllowedBrowseNavigation(localFile, 'LOCAL_PAGE'), true);
  assert.equal(isAllowedBrowseNavigation(localFile, 'REMOTE_PAGE'), false);
  assert.equal(isAllowedBrowseNavigation(localFile, 'OPAQUE_PAGE'), false);
  for (const initiator of ['USER', 'LOCAL_PAGE', 'REMOTE_PAGE', 'OPAQUE_PAGE'] as const) {
    assert.equal(isAllowedBrowseNavigation('fielora://app/index.html', initiator), false);
  }
  assert.equal(isAllowedBrowseNavigation('data:text/html,hello', 'USER'), false);
  assert.equal(browserNavigationInitiatorForDocument('https://example.com/'), 'REMOTE_PAGE');
  assert.equal(browserNavigationInitiatorForDocument(localFile), 'LOCAL_PAGE');
  assert.equal(browserNavigationInitiatorForDocument('about:blank'), 'OPAQUE_PAGE');
});

test('window-open policy exposes only targets that may become an isolated Browse Page', () => {
  assert.equal(allowedWindowOpenTarget('https://example.com/blank', 'REMOTE_PAGE'), 'https://example.com/blank');
  assert.equal(allowedWindowOpenTarget('http://127.0.0.1/script-open', 'REMOTE_PAGE'), 'http://127.0.0.1/script-open');
  assert.equal(allowedWindowOpenTarget('file:///C:/Windows/win.ini', 'LOCAL_PAGE'), 'file:///C:/Windows/win.ini');
  assert.equal(allowedWindowOpenTarget('file:///C:/Windows/win.ini', 'REMOTE_PAGE'), null);
  assert.equal(allowedWindowOpenTarget('file:///C:/Windows/win.ini', 'OPAQUE_PAGE'), null);
  assert.equal(allowedWindowOpenTarget('fielora://app/index.html', 'USER'), null);
  assert.equal(allowedWindowOpenTarget('fielora://app/index.html', 'LOCAL_PAGE'), null);
  assert.equal(allowedWindowOpenTarget('javascript:alert(1)', 'REMOTE_PAGE'), null);
});

test('Browse view bounds stay inside the app content view', () => {
  assert.deepEqual(
    fitBrowserBounds({ x: 200, y: 90, width: 1000, height: 800 }, { x: 0, y: 0, width: 1180, height: 760 }),
    { x: 200, y: 90, width: 980, height: 670 },
  );
  assert.deepEqual(
    fitBrowserBounds({ x: -10, y: -20, width: 100, height: 100 }, { x: 0, y: 0, width: 1180, height: 760 }),
    { x: 0, y: 0, width: 90, height: 80 },
  );
});
