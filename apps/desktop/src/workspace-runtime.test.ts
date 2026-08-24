import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('supported images use the binary-safe preview channel instead of the text reader', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-image-preview-'));
  const runtime = new WorkspaceRuntime(() => undefined);
  try {
    const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x00]);
    await writeFile(path.join(root, 'preview.png'), png);
    const preview = await runtime.previewImage(root, 'preview.png');
    assert.equal(preview.kind, 'IMAGE');
    assert.equal(preview.mime_type, 'image/png');
    assert.equal(preview.size, png.byteLength);
    assert.equal(preview.data_url, `data:image/png;base64,${png.toString('base64')}`);
    await assert.rejects(() => runtime.readFile(root, 'preview.png'), /Binary files are not supported/);
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
    const moved = await runtime.runTerminal(root, 'field', 'cd..', root);
    assert.equal(moved.working_directory, path.dirname(root));

    const completed = await runtime.runTerminal(root, 'field', "Write-Output 'terminal-ok'", root);
    assert.equal(completed.working_directory, null);
    await waitFor(() => events.some((event) => event.run_id === completed.run_id && event.kind === 'COMPLETED'));
    assert.equal(events.filter((event) => event.run_id === completed.run_id && event.kind === 'OUTPUT').some((event) => event.text?.includes('terminal-ok')), true);

    const cancelled = await runtime.runTerminal(root, 'field', 'Start-Sleep -Seconds 5', root);
    runtime.cancelTerminal(cancelled.run_id);
    await waitFor(() => events.some((event) => event.run_id === cancelled.run_id && event.kind === 'CANCELLED'));
  } finally {
    runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('workspace environment reports real bounded Git state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-environment-'));
  const runtime = new WorkspaceRuntime(() => undefined);
  try {
    assert.equal((await runtime.getEnvironment(root)).is_git_repository, false);
    assert.equal(spawnSync('git.exe', ['init'], { cwd: root, windowsHide: true, stdio: 'ignore' }).status, 0);
    await writeFile(path.join(root, 'changed.txt'), 'changed\n');
    const environment = await runtime.getEnvironment(root);
    assert.equal(environment.is_git_repository, true);
    assert.equal(environment.changed_files, 1);
    assert.equal(typeof environment.branch === 'string' || environment.branch === null, true);
    assert.equal(environment.ahead, 0);
    assert.equal(environment.behind, 0);
  } finally {
    runtime.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
