import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPortableProfile, extractPortableProfile, portableLibraryInputs } from './portable-profile.ts';

test('portable profile is versioned, checksummed, path-bounded, and keeps metadata/blob sections separate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-portable-profile-'));
  try {
    const database = path.join(root, 'profile.sqlite'); await writeFile(database, 'sqlite-profile-without-credential-secret');
    const preferences = path.join(root, 'preferences.json'); await writeFile(preferences, '{"version":2,"startupDestination":"PROJECTS"}');
    const hash = 'a'.repeat(64);
    const blob = path.join(root, hash); await writeFile(blob, 'blob');
    const archive = path.join(root, 'backup.fielora');
    const profileId = '018f2c10-7b55-7f13-8d2b-20f24fcb1210';
    const manifest = await createPortableProfile(archive, {
      profile_id: profileId,
      profile_schema_version: 1,
      fielora_version: '0.1.0',
      source_os: 'win32',
      included_sections: ['PROFILE', 'SETTINGS', 'LIBRARY_METADATA'],
      library_mode: 'INCLUDE_BLOBS',
    }, [
      { archive_path: 'data/profile.sqlite', source_path: database },
      { archive_path: 'data/app-preferences.json', source_path: preferences },
      { archive_path: `library/blobs/objects/aa/${hash}`, source_path: blob },
    ]);
    assert.equal(manifest.profile_id, profileId);
    assert.equal(manifest.encryption.mode, 'NONE');
    const extracted = path.join(root, 'extracted');
    const restored = await extractPortableProfile(archive, extracted);
    assert.equal(restored.profile_id, profileId);
    assert.equal(await readFile(path.join(extracted, 'data', 'profile.sqlite'), 'utf8'), 'sqlite-profile-without-credential-secret');
    assert.equal(await readFile(path.join(extracted, 'data', 'app-preferences.json'), 'utf8'), '{"version":2,"startupDestination":"PROJECTS"}');
    assert.equal(await readFile(path.join(extracted, 'library', 'blobs', 'objects', 'aa', hash), 'utf8'), 'blob');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('portable profile rejects disallowed machine paths before writing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-portable-boundary-'));
  try {
    const source = path.join(root, 'source'); await writeFile(source, 'x');
    await assert.rejects(createPortableProfile(path.join(root, 'bad.fielora'), {
      profile_id: '018f2c10-7b55-7f13-8d2b-20f24fcb1210', profile_schema_version: 1,
      fielora_version: '0.1.0', source_os: 'win32', included_sections: ['PROFILE'], library_mode: 'METADATA_ONLY',
    }, [{ archive_path: '../machine/path', source_path: source }]), /Invalid portable profile file set/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('portable Library manifest excludes screenshot-only bytes while an eligible owner still exports a shared SHA', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fielora-portable-evidence-privacy-'));
  try {
    const libraryRoot = path.join(root, 'LibraryRoot');
    const normalBytes = Buffer.from('normal-library-image');
    const sharedOwnerBytes = Buffer.from('library-image-also-referenced-by-excluded-screenshot');
    const screenshotBytes = Buffer.from('private-screenshot-evidence');
    const normalHash = createHash('sha256').update(normalBytes).digest('hex');
    const sharedOwnerHash = createHash('sha256').update(sharedOwnerBytes).digest('hex');
    const screenshotHash = createHash('sha256').update(screenshotBytes).digest('hex');
    const normalPath = path.join(libraryRoot, 'blobs', 'objects', normalHash.slice(0, 2), normalHash);
    const sharedOwnerPath = path.join(libraryRoot, 'blobs', 'objects', sharedOwnerHash.slice(0, 2), sharedOwnerHash);
    const screenshotPath = path.join(libraryRoot, 'blobs', 'objects', screenshotHash.slice(0, 2), screenshotHash);
    await mkdir(path.dirname(normalPath), { recursive: true });
    await mkdir(path.dirname(sharedOwnerPath), { recursive: true });
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(normalPath, normalBytes);
    await writeFile(sharedOwnerPath, sharedOwnerBytes);
    await writeFile(screenshotPath, screenshotBytes);
    const inputs = await portableLibraryInputs(libraryRoot, [
      {
        blob_ref: `blobs/objects/${normalHash.slice(0, 2)}/${normalHash}`,
        content_sha256: normalHash,
        byte_size: normalBytes.byteLength,
      },
      {
        // The Core manifest includes this SHA because it has an eligible Library
        // owner even when an excluded ScreenshotEvidence also references it.
        blob_ref: `blobs/objects/${sharedOwnerHash.slice(0, 2)}/${sharedOwnerHash}`,
        content_sha256: sharedOwnerHash,
        byte_size: sharedOwnerBytes.byteLength,
      },
    ]);
    const database = path.join(root, 'profile.sqlite'); await writeFile(database, 'sqlite');
    const archive = path.join(root, 'privacy.fielora');
    const manifest = await createPortableProfile(archive, {
      profile_id: '018f2c10-7b55-7f13-8d2b-20f24fcb1210', profile_schema_version: 1,
      fielora_version: '0.1.0', source_os: 'win32', included_sections: ['PROFILE', 'LIBRARY_METADATA'], library_mode: 'INCLUDE_BLOBS',
    }, [{ archive_path: 'data/profile.sqlite', source_path: database }, ...inputs]);
    assert.ok(manifest.files.some((file) => file.path.endsWith(normalHash)));
    assert.ok(manifest.files.some((file) => file.path.endsWith(sharedOwnerHash)));
    assert.ok(manifest.files.every((file) => !file.path.endsWith(screenshotHash)));
    const extracted = path.join(root, 'extracted');
    await extractPortableProfile(archive, extracted);
    assert.equal(await readFile(path.join(extracted, 'library', 'blobs', 'objects', normalHash.slice(0, 2), normalHash), 'utf8'), normalBytes.toString());
    assert.equal(await readFile(path.join(extracted, 'library', 'blobs', 'objects', sharedOwnerHash.slice(0, 2), sharedOwnerHash), 'utf8'), sharedOwnerBytes.toString());
    await assert.rejects(readFile(path.join(extracted, 'library', 'blobs', 'objects', screenshotHash.slice(0, 2), screenshotHash)), /ENOENT/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
