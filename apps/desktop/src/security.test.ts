import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTrustedSender, isAllowedNavigation, trustedOriginFor } from './security.ts';

test('production trusts only the exact application origin', () => {
  assert.equal(trustedOriginFor(true), 'fielora://app');
  assert.equal(isAllowedNavigation('fielora://app/index.html', 'fielora://app'), true);
  assert.equal(isAllowedNavigation('fielora://other/index.html', 'fielora://app'), false);
  assert.equal(isAllowedNavigation('fielora://app.evil.example/index.html', 'fielora://app'), false);
  assert.equal(isAllowedNavigation('fielora://app@evil.example/index.html', 'fielora://app'), false);
  assert.equal(isAllowedNavigation('https://example.com', 'fielora://app'), false);
  assert.equal(isAllowedNavigation('file:///C:/app/index.html', 'fielora://app'), false);
});

test('development trusts only the current exact loopback origin', () => {
  assert.equal(trustedOriginFor(false, 'http://127.0.0.1:3921/main_window'), 'http://127.0.0.1:3921');
  assert.equal(isAllowedNavigation('http://127.0.0.1:3921/other', 'http://127.0.0.1:3921'), true);
  assert.equal(isAllowedNavigation('http://localhost:3921/main_window', 'http://127.0.0.1:3921'), false);
  assert.equal(isAllowedNavigation('http://127.0.0.1:3922/main_window', 'http://127.0.0.1:3921'), false);
  assert.throws(() => trustedOriginFor(false, 'https://example.com/app'));
  assert.throws(() => trustedOriginFor(false, 'http://localhost/app'));
});

test('bridge requires expected webContents, main frame and exact origin', () => {
  const valid = { senderId: 9, expectedSenderId: 9, frameUrl: 'fielora://app/index.html', isMainFrame: true };
  assert.doesNotThrow(() => assertTrustedSender(valid, 'fielora://app'));
  assert.throws(() => assertTrustedSender({ ...valid, senderId: 8 }, 'fielora://app'));
  assert.throws(() => assertTrustedSender({ ...valid, isMainFrame: false }, 'fielora://app'));
  assert.throws(() => assertTrustedSender({ ...valid, frameUrl: 'https://evil.example' }, 'fielora://app'));
});
