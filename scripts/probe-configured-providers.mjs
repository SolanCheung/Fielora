import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = process.env.FIELORA_CORE_EXE
  ? path.resolve(process.env.FIELORA_CORE_EXE)
  : path.join(root, 'target', 'debug', 'fielora-core.exe');
const environment = { ...process.env, FIELORA_E2E: '0' };
delete environment.FIELORA_DATA_DIR;

const child = spawn(core, ['--development'], {
  cwd: root,
  env: environment,
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const lines = readline.createInterface({ input: child.stdout });
if (process.env.FIELORA_PROVIDER_PROTOCOL_TRACE === '1') {
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
}
const pending = new Map();
const modelEvents = [];
let requestSequence = 0;

lines.on('line', (line) => {
  const frame = JSON.parse(line);
  if (frame.id && pending.has(frame.id)) {
    const waiter = pending.get(frame.id);
    pending.delete(frame.id);
    if (frame.error) waiter.reject(new Error(String(frame.error.code ?? 'CORE_REQUEST_FAILED')));
    else waiter.resolve(frame.result);
    return;
  }
  if (frame.method === 'event.model.invocation') modelEvents.push(frame.params);
});

function request(method, params = {}, deadlineMs = 20_000) {
  const id = `provider-probe-${++requestSequence}`;
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params,
    _meta: { protocol: '1.0', trace_id: randomUUID(), deadline_ms: deadlineMs },
  })}\n`);
  return promise;
}

async function waitForTerminal(invocationId, timeoutMs = 40_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const terminal = modelEvents.find((event) => event.invocation_id === invocationId && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(event.kind));
    if (terminal) return terminal;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { kind: 'FAILED', error_code: 'PROVIDER_PROBE_TIMEOUT' };
}

async function shutdown() {
  try { await request('system.shutdown', {}, 5_000); } catch {}
  child.stdin.end();
}

try {
  await request('system.hello');
  const providers = await request('query.provider.list_configs');
  const active = providers.filter((provider) => provider.lifecycle_status === 'ACTIVE' && provider.credential_present).slice(0, 8);
  if (active.length === 0) {
    console.log(JSON.stringify({ status: 'NO_CONFIGURED_PROVIDER' }));
  } else {
    const results = [];
    for (const provider of active) {
      const invocation = await request('command.provider.probe', { provider_config_id: provider.id });
      const terminal = await waitForTerminal(invocation.invocation_id);
      results.push({
        display_name: provider.display_name,
        provider_kind: provider.provider_kind,
        model_id: provider.default_model,
        status: terminal.kind === 'COMPLETED' ? 'PASS' : 'FAIL',
        error_code: terminal.error_code ?? null,
      });
    }
    const status = results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL';
    console.log(JSON.stringify({ status, results }, null, 2));
    if (status === 'FAIL') process.exitCode = 2;
  }
} catch (error) {
  console.log(JSON.stringify({ status: 'FAIL', error_code: error instanceof Error ? error.message : 'PROVIDER_PROBE_FAILED' }));
  process.exitCode = 1;
} finally {
  await shutdown();
}
