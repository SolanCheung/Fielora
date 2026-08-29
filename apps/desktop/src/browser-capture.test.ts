import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCaptureIdentityCurrent,
  assertScreenshotBounds,
  waitForBoundedCapture,
} from './browser-capture.ts';

test('browser screenshot bounds accept the product envelope and reject oversized captures', () => {
  assert.doesNotThrow(() => assertScreenshotBounds(4 * 1024 * 1024, 4096, 4096));
  assert.throws(() => assertScreenshotBounds(4 * 1024 * 1024 + 1, 10, 10), /safe bounds/u);
  assert.throws(() => assertScreenshotBounds(100, 4097, 10), /safe bounds/u);
  assert.throws(() => assertScreenshotBounds(100, 4096, 4097), /safe bounds/u);
});

test('browser screenshot rejects a capture resolved after navigation generation changes', () => {
  const captured = { page_id: 'page_a', navigation_generation: 1, url: 'https://fixture.example/a' };
  assert.doesNotThrow(() => assertCaptureIdentityCurrent(captured, { ...captured }));
  assert.throws(() => assertCaptureIdentityCurrent(captured, {
    ...captured,
    navigation_generation: 2,
    url: 'https://fixture.example/b',
  }), /became stale/u);
});

test('browser screenshot capture is cancellable and time bounded', async () => {
  const controller = new AbortController();
  const cancelled = waitForBoundedCapture(new Promise<string>(() => undefined), {
    timeoutMs: 1_000,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(cancelled, /cancelled/u);
  await assert.rejects(
    waitForBoundedCapture(new Promise<string>(() => undefined), { timeoutMs: 5 }),
    /timed out/u,
  );
});
