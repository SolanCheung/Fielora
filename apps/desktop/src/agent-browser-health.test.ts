import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { browserServerAddress, probeBrowserServer } from './agent-browser-health.ts';

test('server health proves a local socket, never an HTTP page or credentials', async () => {
  let sentBytes = 0;
  const server = createServer(socket => socket.on('data', bytes => { sentBytes += bytes.length; }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/must-not-request-this-route`;
  try {
    const listening = await probeBrowserServer(url, new AbortController().signal);
    assert.equal(listening.readiness, 'LISTENING');
    assert.equal(listening.page_verified, false);
    assert.equal(sentBytes, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  assert.equal((await probeBrowserServer(url, new AbortController().signal)).readiness, 'NOT_LISTENING');
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(probeBrowserServer(url, cancelled.signal), /BROWSER_CANCELLED/);
});

test('readiness rejects external hosts, privileged schemes and URL credentials before starting work', () => {
  for (const url of ['https://example.com', 'http://127.0.0.1.example.com', 'http://10.0.0.1', 'file:///C:/secret', 'http://user:secret@localhost', 'invalid']) assert.throws(() => browserServerAddress(url), /BROWSER_SERVER_URL_REJECTED/);
  assert.equal(browserServerAddress('http://127.0.0.2:8019').host, '127.0.0.2:8019');
});
