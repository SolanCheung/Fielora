import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WorkspaceRuntime } from './workspace-runtime.ts';

test('latest process output continues past the terminal emission cap', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fielora-log-tail-'));
  const emitted: string[] = [];
  const runtime = new WorkspaceRuntime(event => { if (event.kind === 'OUTPUT') emitted.push(event.text ?? ''); });
  try {
    await writeFile(path.join(root, 'output.cjs'), "process.stdout.write('67% building\\n'+'x'.repeat(600*1024));setTimeout(()=>process.stdout.write('\\n100% compiled: ready\\n'),100);\n");
    const run = await runtime.runTerminal(root, 'test', `& '${process.execPath.replaceAll("'", "''")}' 'output.cjs'`);
    const deadline = Date.now() + 10_000;
    while (runtime.agentServerStatus(run.run_id).status === 'RUNNING' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    const result = runtime.agentServerStatus(run.run_id);
    assert.equal(result.status, 'COMPLETED');
    assert.ok(result.output.endsWith('100% compiled: ready\n'));
    assert.ok(result.output.length <= 8192);
    assert.ok(!emitted.join('').includes('100% compiled: ready'));
    assert.equal(emitted.filter(text => text.includes('Fielora truncated terminal output')).length, 1);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
