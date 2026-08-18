import assert from 'node:assert/strict';
import test from 'node:test';
import { focusUsableWindow, usableWindow, withUsableWindow } from './window-lifecycle.ts';

function fakeWindow(options: { destroyed?: boolean; contentsDestroyed?: boolean; throwOnFocus?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    isDestroyed: () => Boolean(options.destroyed),
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => {
      if (options.throwOnFocus) throw new Error('Object has been destroyed');
      calls.push('focus');
    },
    webContents: {
      isDestroyed: () => Boolean(options.contentsDestroyed),
    },
  };
}

test('destroyed BrowserWindow references are rejected before native methods run', () => {
  const window = fakeWindow({ destroyed: true });
  assert.equal(usableWindow(window), undefined);
  assert.equal(focusUsableWindow(window), false);
  assert.deepEqual(window.calls, []);
});

test('destroyed webContents blocks late Main-to-Renderer notifications', () => {
  const window = fakeWindow({ contentsDestroyed: true });
  assert.equal(withUsableWindow(window, () => window.calls.push('send')), false);
  assert.deepEqual(window.calls, []);
});

test('single-instance focus restores only a live window and absorbs native invalidation races', () => {
  const live = fakeWindow();
  assert.equal(focusUsableWindow(live), true);
  assert.deepEqual(live.calls, ['restore', 'show', 'focus']);

  const invalidated = fakeWindow({ throwOnFocus: true });
  assert.equal(focusUsableWindow(invalidated), false);
  assert.deepEqual(invalidated.calls, ['restore', 'show']);
});
