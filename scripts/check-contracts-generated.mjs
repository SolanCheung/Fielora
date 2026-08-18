import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const generated = path.join(root, 'packages', 'contracts', 'generated', 'index.ts');
const before = await readFile(generated);
const result = spawnSync('cargo', ['run', '-p', 'fielora-contracts', '--example', 'export_ts'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.status !== 0) process.exit(result.status ?? 1);
const after = await readFile(generated);
assert.deepEqual(after, before, 'generated TypeScript contracts were stale; regenerated output is now present');
console.log('Generated TypeScript contracts match the Rust source.');
