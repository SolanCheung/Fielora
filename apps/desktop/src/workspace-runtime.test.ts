import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { TerminalEvent } from './workspace-types';
import { WorkspaceRuntime } from './workspace-runtime.ts';

test('workspace file access stays bounded and uses optimistic hashes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-workspace-'));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src', 'app.ts'), 'export const before = true;\n');
  const runtime = new WorkspaceRuntime(() => undefined);
  try {
    assert.deepEqual(await runtime.listFiles(root), [{ relative_path: 'src/app.ts', size: 28 }]);
    const before = await runtime.readFile(root, 'src/app.ts');
    assert.match(before.sha256, /^[0-9a-f]{64}$/);
    const after = await runtime.applyFile(root, {
      field_id: 'unused', relative_path: 'src/app.ts', expected_sha256: before.sha256,
      content: 'export const after = true;\n',
    });
    assert.equal(after.content, 'export const after = true;\n');
    await assert.rejects(() => runtime.applyFile(root, {
      field_id: 'unused', relative_path: 'src/app.ts', expected_sha256: before.sha256, content: 'stale',
    }), /FILE_CHANGED_SINCE_REVIEW/);
    await assert.rejects(() => runtime.readFile(root, '../outside.txt'), /project-relative path/);
  } finally {
    runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('terminal streams output and exposes cancellation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-terminal-'));
  const events: TerminalEvent[] = [];
  let wake: (() => void) | undefined;
  const runtime = new WorkspaceRuntime((event) => { events.push(event); wake?.(); });
  const waitFor = async (predicate: () => boolean, timeout = 8_000): Promise<void> => {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeout) throw new Error('terminal event timeout');
      await new Promise<void>((resolve) => { wake = resolve; setTimeout(resolve, 100); });
    }
  };
  try {
    const completed = await runtime.runTerminal(root, 'field', "Write-Output 'terminal-ok'");
    await waitFor(() => events.some((event) => event.run_id === completed.run_id && event.kind === 'COMPLETED'));
    assert.equal(events.filter((event) => event.run_id === completed.run_id && event.kind === 'OUTPUT').some((event) => event.text?.includes('terminal-ok')), true);

    const cancelled = await runtime.runTerminal(root, 'field', 'Start-Sleep -Seconds 5');
    runtime.cancelTerminal(cancelled.run_id);
    await waitFor(() => events.some((event) => event.run_id === cancelled.run_id && event.kind === 'CANCELLED'));
  } finally {
    runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
