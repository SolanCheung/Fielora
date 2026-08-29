import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StorageManager, directoryManifest, sha256File } from './storage-manager.ts';

test('StorageManager resolves independent roots and imports content-addressed blobs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-storage-manager-'));
  try {
    const manager = await StorageManager.open(root, path.join(root, 'isolated'));
    const roots = manager.current();
    assert.equal(roots.data_root, path.join(root, 'isolated', 'data'));
    assert.equal(roots.library_root, path.join(root, 'isolated', 'library'));
    assert.equal(roots.cache_root, path.join(root, 'isolated', 'cache'));
    const source = path.join(root, 'sample.txt');
    await writeFile(source, 'library fixture');
    const stored = await manager.importFile(source);
    assert.equal(stored.content_hash, await sha256File(source));
    assert.match(stored.blob_ref, /^blobs\/objects\/[0-9a-f]{2}\/[0-9a-f]{64}$/u);
    assert.equal(await readFile(manager.resolveBlob(stored.blob_ref), 'utf8'), 'library fixture');
    const details = await manager.info();
    assert.equal(details.details.find((item) => item.id === 'AGENT_LEDGER')?.path, manager.databasePath());
    assert.equal(details.details.find((item) => item.id === 'VECTOR_INDEX')?.state, 'NOT_PRESENT');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('closed DataRoot and LibraryRoot migrations verify copies, retain source, and roll back failed validation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-storage-migration-'));
  try {
    const manager = await StorageManager.open(root, path.join(root, 'isolated'));
    const original = manager.current();
    await writeFile(path.join(original.data_root, 'fielora.db'), 'conversation durable fixture');
    const dataTarget = path.join(root, 'data-b'); await mkdir(dataTarget);
    await manager.migrateClosedDataRoot(dataTarget, async (database) => {
      assert.equal(await readFile(database, 'utf8'), 'conversation durable fixture');
    });
    assert.equal(await readFile(path.join(dataTarget, 'fielora.db'), 'utf8'), 'conversation durable fixture');
    assert.equal(await readFile(path.join(original.data_root, 'fielora.db'), 'utf8'), 'conversation durable fixture');

    const failedTarget = path.join(root, 'data-failed'); await mkdir(failedTarget);
    await assert.rejects(manager.migrateClosedDataRoot(failedTarget, async () => { throw new Error('forced validation failure'); }), /forced validation failure/u);
    assert.equal(manager.current().data_root, dataTarget);

    const source = path.join(root, 'blob.bin'); await writeFile(source, Buffer.from([1, 2, 3, 4]));
    await manager.importFile(source);
    const libraryA = manager.current().library_root;
    const libraryTarget = path.join(root, 'library-b'); await mkdir(libraryTarget);
    await manager.migrateLibraryRoot(libraryTarget);
    assert.deepEqual(await directoryManifest(libraryTarget), await directoryManifest(libraryA));
    assert.ok((await directoryManifest(libraryA)).length > 0, 'Library source is retained');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('verified Library blobs stay identity-addressed across root migration and fail safely when stale', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-verified-library-'));
  try {
    const manager = await StorageManager.open(root, path.join(root, 'isolated'));
    const source = path.join(root, 'image.bin');
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    await writeFile(source, bytes);
    const stored = await manager.importFile(source);
    assert.deepEqual(Buffer.from(await manager.readVerifiedBlob(stored.blob_ref, stored.content_hash, 1024)), bytes);
    await assert.rejects(manager.readVerifiedBlob(stored.blob_ref, '0'.repeat(64), 1024), /integrity/u);
    assert.throws(() => manager.resolveBlob('../outside.png'), /Invalid Library blob reference/u);
    const storedPath = manager.resolveBlob(stored.blob_ref);
    const storedDirectory = path.dirname(storedPath);
    const escapedDirectory = path.join(root, 'escaped-blob-directory');
    await mkdir(escapedDirectory);await writeFile(path.join(escapedDirectory, path.basename(storedPath)), bytes);
    await rm(storedDirectory, { recursive: true, force: true });
    await symlink(escapedDirectory, storedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(manager.readVerifiedBlob(stored.blob_ref, stored.content_hash, 1024), /escaped LibraryRoot/u);
    await rm(storedDirectory, { recursive: true, force: true });await mkdir(storedDirectory);await writeFile(storedPath, bytes);

    const migrated = path.join(root, 'library-migrated');await mkdir(migrated);
    await manager.migrateLibraryRoot(migrated);
    assert.deepEqual(Buffer.from(await manager.readVerifiedBlob(stored.blob_ref, stored.content_hash, 1024)), bytes);
    await unlink(manager.resolveBlob(stored.blob_ref));
    await assert.rejects(manager.readVerifiedBlob(stored.blob_ref, stored.content_hash, 1024));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('cache cleanup is root-bounded and never touches durable roots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-cache-cleanup-'));
  try {
    const manager = await StorageManager.open(root, path.join(root, 'isolated'));
    const roots = manager.current();
    await writeFile(path.join(roots.data_root, 'keep.db'), 'keep');
    await writeFile(path.join(roots.library_root, 'keep.blob'), 'keep');
    await writeFile(path.join(roots.cache_root, 'discard.tmp'), 'discard');
    assert.equal(await manager.clearCache(), 7);
    assert.equal(await readFile(path.join(roots.data_root, 'keep.db'), 'utf8'), 'keep');
    assert.equal(await readFile(path.join(roots.library_root, 'keep.blob'), 'utf8'), 'keep');
    assert.deepEqual(await directoryManifest(roots.cache_root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('machine-local root locator persists selected roots without entering DataRoot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-root-locator-'));
  try {
    const manager = await StorageManager.open(root);
    const target = path.join(root, 'external-library'); await mkdir(target);
    await manager.migrateLibraryRoot(target);
    const reopened = await StorageManager.open(root);
    assert.equal(reopened.current().library_root, target);
    assert.equal(reopened.current().data_root, path.join(root, 'Fielora', 'data'));
    assert.equal((await directoryManifest(reopened.current().data_root)).some((item) => item.relative_path.includes('storage-roots.json')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('root boundaries reject overlap with another managed root before writing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-root-boundary-'));
  try {
    const manager = await StorageManager.open(root, path.join(root, 'isolated'));
    await assert.rejects(
      manager.migrateLibraryRoot(path.join(manager.current().data_root, 'nested-library')),
      /must be independent roots/u,
    );
    assert.equal(manager.current().library_root, path.join(root, 'isolated', 'library'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
