import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { FipcClient } from './fipc.ts';

function fakeChild() {
  const process = new EventEmitter() as ChildProcessWithoutNullStreams;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  Object.assign(process, {
    stdin,
    stdout,
    stderr,
  });
  return { process, stdin, stdout, stderr };
}

test('FIPC client incrementally parses response and notification frames', async () => {
  const { process: child, stdin, stdout } = fakeChild();
  const client = new FipcClient(child);
  const writes: string[] = [];
  stdin.on('data', (chunk) => writes.push(String(chunk)));
  const request = client.request('system.health');
  await new Promise((resolve) => setImmediate(resolve));
  const id = JSON.parse(writes.join('')).id;
  stdout.write(`{"jsonrpc":"2.0","id":"${id}",`);
  stdout.write('"result":{"state":"READY"}}\n');
  assert.deepEqual(await request, { state: 'READY' });

  const notification = new Promise((resolve) => client.once('notification', resolve));
  stdout.write('{"jsonrpc":"2.0","method":"event.field.changed","params":{}}\n');
  assert.equal((await notification as { method: string }).method, 'event.field.changed');
});

test('FIPC deadlines delete pending requests and late responses do not mutate result', async () => {
  const { process: child, stdin, stdout } = fakeChild();
  const client = new FipcClient(child);
  const writes: string[] = [];
  stdin.on('data', (chunk) => writes.push(String(chunk)));
  await assert.rejects(client.request('system.health', {}, 10), /timed out/);
  const id = JSON.parse(writes.join('')).id;
  const late = new Promise((resolve) => client.once('late-response', resolve));
  stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result: {} })}\n`);
  assert.equal(await late, id);
});

test('FIPC parses large fragmented frames without byte-at-a-time concatenation and reports duration', async () => {
  const { process: child, stdin, stdout } = fakeChild();
  const client = new FipcClient(child);
  const writes: string[] = [];
  stdin.on('data', (chunk) => writes.push(String(chunk)));
  const request = client.request('query.agent.events');
  await new Promise((resolve) => setImmediate(resolve));
  const id = JSON.parse(writes.join('')).id;
  const completed = new Promise<Record<string, unknown>>((resolve) => client.once('request-completed', resolve));
  const payload = JSON.stringify({ jsonrpc: '2.0', id, result: [{ text: 'x'.repeat(256_000) }] });
  for (let offset = 0; offset < payload.length; offset += 8192) stdout.write(payload.slice(offset, offset + 8192));
  stdout.write('\n');
  assert.equal(((await request) as Array<{ text: string }>)[0]?.text.length, 256_000);
  const metric = await completed;
  assert.equal(metric.method, 'query.agent.events');
  assert.equal(metric.success, true);
  assert.equal(metric.run_id, undefined);
  assert.equal(typeof metric.duration_ms, 'number');
});
