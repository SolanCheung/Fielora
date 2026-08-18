import test from 'node:test';
import assert from 'node:assert/strict';
import { UNTRUSTED_WEB_PREFERENCES } from './browser-security.ts';

test('remote and local Browse WebContents share the frozen untrusted preference baseline', () => {
  assert.equal(Object.isFrozen(UNTRUSTED_WEB_PREFERENCES), true);
  assert.deepEqual(UNTRUSTED_WEB_PREFERENCES, {
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    safeDialogs: true,
    navigateOnDragDrop: false,
    spellcheck: true,
  });
  assert.equal('preload' in UNTRUSTED_WEB_PREFERENCES, false);
});
