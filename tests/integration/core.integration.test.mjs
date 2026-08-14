import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..', '..');
const core = path.join(root, 'target', 'debug', 'fielora-core.exe');

function request(child, id, method, params = {}, protocol = '1.0') {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params, _meta: { protocol, trace_id: randomUUID(), deadline_ms: 10000 } })}\n`);
}

function harness(dataDir) {
  const child = spawn(core, ['--development'], { env: { ...process.env, FIELORA_DATA_DIR: dataDir }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const lines = readline.createInterface({ input: child.stdout });
  const queue = [];
  const waiters = [];
  lines.on('line', (line) => {
    const value = JSON.parse(line);
    const waiter = waiters.shift();
    if (waiter) waiter(value); else queue.push(value);
  });
  return {
    child,
    send(id, method, params = {}, protocol) { request(child, id, method, params, protocol); },
    next() { if (queue.length) return Promise.resolve(queue.shift()); return new Promise((resolve) => waiters.push(resolve)); },
    async exit(timeout = 2000) {
      if (child.exitCode !== null) return child.exitCode;
      return Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Core did not exit')), timeout)),
      ]);
    },
  };
}

async function hello(h) { h.send('hello', 'system.hello'); return h.next(); }

test('real Core persists create/focus/snapshot through close and restart', async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'fielora-core-integration-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const first = harness(dataDir);
  assert.equal((await hello(first)).result.schema_version, 1);
  first.send('create', 'command.field.create', { title: 'Phase 01 Test', goal: 'Persistence' });
  const created = await first.next();
  const event = await first.next();
  assert.equal(event.method, 'event.field.changed');
  first.send('focus', 'command.field.update_focus', { field_id: created.result.id, expected_revision: 1, focus: 'Persistence' });
  const updated = await first.next();
  await first.next();
  assert.equal(updated.result.revision, 2);
  first.send('snapshot', 'command.surface.save_snapshot', { field_id: created.result.id, layout: { primary: 'FIELD' }, open_objects: [] });
  assert.equal((await first.next()).result.observed_field_revision, 2);
  first.send('shutdown', 'system.shutdown');
  await first.next();
  assert.equal(await first.exit(), 0);

  const second = harness(dataDir);
  await hello(second);
  second.send('list', 'query.field.list');
  assert.equal((await second.next()).result[0].current_focus, 'Persistence');
  second.send('resume', 'query.surface.latest_snapshot', { field_id: created.result.id });
  const resume = await second.next();
  assert.equal(resume.result.field.current_focus, 'Persistence');
  assert.equal(resume.result.snapshot.observed_field_revision, 2);
  second.send('shutdown', 'system.shutdown');
  await second.next();
  await second.exit();
});

test('parent-pipe EOF exits within two seconds without explicit shutdown', async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'fielora-core-eof-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const h = harness(dataDir);
  await hello(h);
  const started = performance.now();
  h.child.stdin.end();
  assert.equal(await h.exit(2000), 0);
  assert.ok(performance.now() - started < 2000);
});

test('protocol failures recover without crashing and conflict remains conflict', async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'fielora-core-protocol-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const h = harness(dataDir);
  h.child.stdin.write(Buffer.from([0xff, 0xfe, 0x0a]));
  assert.equal((await h.next()).error.code, -32700);
  h.child.stdin.write('{not-json}\n');
  assert.equal((await h.next()).error.code, -32700);
  await hello(h);
  h.child.stdin.write(`${'x'.repeat(4 * 1024 * 1024 + 1)}\n`);
  assert.equal((await h.next()).error.data.code, 'protocol_error');
  h.send('recovered', 'system.health');
  assert.equal((await h.next()).result.state, 'READY');
  h.send('unknown', 'unknown.method');
  assert.equal((await h.next()).error.code, -32601);
  h.send('wrong', 'system.health', {}, '2.0');
  assert.equal((await h.next()).error.data.code, 'protocol_error');
  h.send('minor', 'system.health', {}, '1.9');
  assert.equal((await h.next()).result.state, 'READY');
  h.send('create', 'command.field.create', { title: 'Conflict', goal: null });
  const created = await h.next(); await h.next();
  h.send('first', 'command.field.update_focus', { field_id: created.result.id, expected_revision: 1, focus: 'A' });
  await h.next(); await h.next();
  h.send('stale', 'command.field.update_focus', { field_id: created.result.id, expected_revision: 1, focus: 'B' });
  assert.equal((await h.next()).error.data.code, 'conflict');
  h.send('shutdown', 'system.shutdown'); await h.next(); await h.exit();
});
