import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  cleanupElectronProcess, connectToFieloraApp, launchElectron, pollUntil, waitForChildExit, waitForExpression,
} from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const node24Directory = path.dirname(process.execPath);

async function launch(dataRoot, fixture, dataTarget, libraryTarget, profile = {}) {
  const output = [];
  const extraEnv = {
    PATH: `${node24Directory};${process.env.PATH ?? ''}`,
    FIELORA_E2E_LIBRARY_PATHS: JSON.stringify([fixture]),
    FIELORA_E2E_DATA_ROOT_TARGET: dataTarget,
    FIELORA_E2E_LIBRARY_ROOT_TARGET: libraryTarget,
  };
  if (profile.exportTarget) extraEnv.FIELORA_E2E_PROFILE_EXPORT_TARGET = profile.exportTarget;
  if (profile.importSource) extraEnv.FIELORA_E2E_PROFILE_IMPORT_SOURCE = profile.importSource;
  const launched = await launchElectron({
    root, dataRoot, output,
    extraEnv,
  });
  try {
    const cdp = await connectToFieloraApp({ port: launched.port, output });
    await waitForExpression(cdp, `document.querySelector('[data-testid="project-workspace"]')`, { output });
    return { ...launched, cdp };
  } catch (error) {
    await cleanupElectronProcess(launched.child);
    throw error;
  }
}

async function close(instance) {
  try { await instance.cdp.eval(`void window.fielora.core.quit(); true`); } catch {}
  instance.cdp.close();
  await Promise.race([waitForChildExit(instance.child), new Promise((resolve) => setTimeout(resolve, 3_000))]);
  await cleanupElectronProcess(instance.child);
}

const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'fielora-library-e2e-'));
const fixture = path.join(dataRoot, 'durable-library.txt');
const migratedDataRoot = path.join(dataRoot, 'migrated-data');
const migratedLibraryRoot = path.join(dataRoot, 'migrated-library');
const importedEnvironment = path.join(dataRoot, 'imported-device');
const profileArchive = path.join(dataRoot, 'portable-profile.fielora');
await mkdir(migratedDataRoot);
await mkdir(migratedLibraryRoot);
await writeFile(fixture, 'durable Library fixture');
const expectedHash = createHash('sha256').update('durable Library fixture').digest('hex');
const server = http.createServer((_request, response) => response.end('<!doctype html><title>Saved Web Fixture</title><main>safe local page</main>'));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('fixture server unavailable');
const pageUrl = `http://127.0.0.1:${address.port}/library`;

let first;
let second;
let imported;
try {
  first = await launch(dataRoot, fixture, migratedDataRoot, migratedLibraryRoot, { exportTarget: profileArchive });
  await first.cdp.eval(`document.querySelector('[data-testid="library-nav"]').click()`);
  await waitForExpression(first.cdp, `document.querySelector('[data-testid="library-screen"]')`, { output: first.output });
  const addResult = await first.cdp.eval(`window.fielora.library.addFiles().then(value=>({value})).catch(error=>({error:String(error)}))`);
  assert.ok(!addResult.error, addResult.error);
  await pollUntil(() => first.cdp.eval(`window.fielora.library.list({media_kind:null,include_deleted:false,limit:20}).then(value=>value.length===1)`), { timeoutMs: 20_000, intervalMs: 75, errorMessage: 'local Library object did not persist' });
  const local = await first.cdp.eval(`window.fielora.library.list({media_kind:null,include_deleted:false,limit:20})`);
  assert.equal(local[0].content_hash, expectedHash);
  assert.equal(local[0].kind, 'FILE');
  const blobPath = path.join(dataRoot, 'Fielora', 'library', ...local[0].blob_ref.split('/'));
  assert.equal(await readFile(blobPath, 'utf8'), 'durable Library fixture');

  await first.cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-utility',{detail:'BROWSER'}))`);
  await waitForExpression(first.cdp, `document.querySelector('[data-testid="browse-screen"]')`, { output: first.output });
  await first.cdp.eval(`window.fielora.browser.navigate({url:${JSON.stringify(pageUrl)}})`);
  await pollUntil(() => first.cdp.eval(`window.fielora.browser.getState().then(value=>value.title==='Saved Web Fixture')`), { timeoutMs: 20_000, intervalMs: 75, errorMessage: 'Browser fixture did not load' });
  await first.cdp.eval(`document.querySelector('[data-testid="browser-overflow"]').click()`);
  await waitForExpression(first.cdp, `document.querySelector('[data-testid="browser-overflow-menu"]')`, { output: first.output });
  await first.cdp.eval(`document.querySelector('[data-testid="browser-save-library"]').click()`);
  await pollUntil(() => first.cdp.eval(`window.fielora.library.list({media_kind:null,include_deleted:false,limit:20}).then(value=>value.length===2)`), { timeoutMs: 20_000, intervalMs: 75, errorMessage: 'saved web object did not persist' });
  await first.cdp.eval(`document.querySelector('[data-testid="browser-overflow"]').click()`);
  await waitForExpression(first.cdp, `document.querySelector('[data-testid="browser-overflow-menu"]')`, { output: first.output });
  await first.cdp.eval(`document.querySelector('[data-testid="browser-open-settings"]').click()`);
  await waitForExpression(first.cdp, `document.querySelector('[data-testid="settings-browser"]')`, { output: first.output });
  assert.equal(await first.cdp.eval(`document.querySelector('[data-testid="browser-startup-toggle"]').getAttribute('role')`), 'switch');
  const originalStorage = await first.cdp.eval(`window.fielora.storage.info()`);
  const dataMigration = await first.cdp.eval(`window.fielora.storage.migrateDataRoot()`);
  assert.equal(dataMigration.root, migratedDataRoot);
  assert.ok((await readFile(path.join(originalStorage.roots.data_root, 'fielora.db'))).length > 0, 'DataRoot source database must be retained');
  assert.equal((await first.cdp.eval(`window.fielora.library.list({media_kind:null,include_deleted:false,limit:20})`)).length, 2);
  const libraryMigration = await first.cdp.eval(`window.fielora.storage.migrateLibraryRoot()`);
  assert.equal(libraryMigration.root, migratedLibraryRoot);
  assert.equal(await readFile(path.join(migratedLibraryRoot, ...local[0].blob_ref.split('/')), 'utf8'), 'durable Library fixture');
  assert.equal(await readFile(blobPath, 'utf8'), 'durable Library fixture', 'LibraryRoot source blob must be retained');
  const sourceProfile = await first.cdp.eval(`window.fielora.profile.get()`);
  const exported = await first.cdp.eval(`window.fielora.profile.export({include_library:true,preferences:{version:2,startupDestination:'BROWSE',appearance:{themePreference:'DARK',accentPreset:'FIELORA',customAccent:'#6546C7',density:'STANDARD',contrast:'STANDARD',radius:'STANDARD',uiFont:'SYSTEM',codeFont:'SYSTEM_MONO',uiFontScale:100,translucentSidebar:false,softElevation:true,reducedMotionPreference:'SYSTEM',smoothScrolling:true,pointerCursor:true,highContrast:false,advancedColorOverrides:{}}}})`);
  assert.equal(exported.path, profileArchive);
  const archiveBytes = await readFile(profileArchive);
  assert.ok(archiveBytes.length > 0);
  assert.equal(archiveBytes.includes(Buffer.from(fixture, 'utf8')), false, 'Portable Profile must not contain the machine-local Library source path');
  await close(first); first = null;

  imported = await launch(importedEnvironment, fixture, path.join(importedEnvironment, 'unused-data-target'), path.join(importedEnvironment, 'unused-library-target'), { importSource: profileArchive });
  const importedResult = await imported.cdp.eval(`window.fielora.profile.import()`);
  assert.equal(importedResult.profile_id, sourceProfile.profile_id);
  assert.equal(importedResult.preferences.appearance.themePreference, 'DARK');
  const importedProfile = await imported.cdp.eval(`window.fielora.profile.get()`);
  assert.notEqual(importedProfile.device_id, sourceProfile.device_id);
  const importedObjects = await imported.cdp.eval(`window.fielora.library.list({media_kind:null,include_deleted:false,limit:20})`);
  assert.equal(importedObjects.length, 2);
  assert.equal(await readFile(path.join(importedEnvironment, 'Fielora', 'library', ...local[0].blob_ref.split('/')), 'utf8'), 'durable Library fixture');
  await close(imported); imported = null;

  second = await launch(dataRoot, fixture, migratedDataRoot, migratedLibraryRoot);
  const restored = await second.cdp.eval(`window.fielora.library.list({media_kind:null,include_deleted:false,limit:20})`);
  assert.equal(restored.length, 2);
  assert.equal(restored.find((item) => item.kind === 'WEB').original_source, pageUrl);
  const file = restored.find((item) => item.kind === 'FILE');
  const readBack = await second.cdp.eval(`window.fielora.library.get({library_object_id:${JSON.stringify(file.id)}})`);
  assert.equal(readBack.content_hash, expectedHash);
  await second.cdp.eval(`window.fielora.library.delete({library_object_id:${JSON.stringify(file.id)},expected_revision:${file.revision}})`);
  assert.equal((await second.cdp.eval(`window.fielora.library.list({media_kind:null,include_deleted:false,limit:20})`)).length, 1);
  const withTombstone = await second.cdp.eval(`window.fielora.library.list({media_kind:null,include_deleted:true,limit:20})`);
  assert.equal(withTombstone.find((item) => item.id === file.id).lifecycle, 'TOMBSTONE');
  console.log('LIBRARY_STORAGE_PROFILE_E2E: PASS');
} finally {
  if (first) await close(first);
  if (second) await close(second);
  if (imported) await close(imported);
  await new Promise((resolve) => server.close(resolve));
  await rm(dataRoot, { recursive: true, force: true });
}
