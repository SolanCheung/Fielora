import assert from 'node:assert/strict';
import { cp, copyFile, mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import asar from '@electron/asar';

const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(process.argv[2] ?? '');
const destination = path.resolve(process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node package-convergence-fallback.mjs <existing-package-directory> <new-package-directory>');
assert.notEqual(source, destination);
await stat(path.join(source, 'Fielora.exe'));
await stat(path.join(source, 'resources', 'app.asar'));
await stat(path.join(root, 'target', 'release', 'fielora-core.exe'));
const productionWebpack = path.join(root, 'apps', 'desktop', '.webpack', 'x64');
await stat(path.join(productionWebpack, 'main', 'index.js'));
try {
  await stat(destination);
  throw new Error(`Destination already exists: ${destination}`);
} catch (error) {
  if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error;
}

const staging = await mkdtemp(path.join(tmpdir(), 'fielora-convergence-package-'));
try {
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
  asar.extractAll(path.join(source, 'resources', 'app.asar'), staging);
  const stagedWebpack = path.join(staging, '.webpack');
  assert.ok(stagedWebpack.startsWith(`${staging}${path.sep}`));
  await rm(stagedWebpack, { recursive: true, force: true });
  await cp(productionWebpack, stagedWebpack, { recursive: true });
  await asar.createPackage(staging, path.join(destination, 'resources', 'app.asar'));
  await copyFile(path.join(root, 'target', 'release', 'fielora-core.exe'), path.join(destination, 'resources', 'fielora-core.exe'));
  await mkdir(path.join(destination, 'resources'), { recursive: true });
  const manifest = {
    schema_version: 1,
    assembled_at: new Date().toISOString(),
    shell_source: source,
    renderer_bundle_bytes: (await readFile(path.join(destination, 'resources', 'app.asar'))).length,
    core_binary_bytes: (await readFile(path.join(destination, 'resources', 'fielora-core.exe'))).length,
  };
  console.log(JSON.stringify({ destination, manifest }, null, 2));
} finally {
  const resolved = path.resolve(staging);
  if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`) && path.basename(resolved).startsWith('fielora-convergence-package-')) {
    await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
