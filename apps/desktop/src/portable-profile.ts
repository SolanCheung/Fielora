import { createHash } from 'node:crypto';
import { mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';

const MAGIC = Buffer.from('FIELORA_PROFILE\0', 'ascii');
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_FILES = 100_000;
const MAX_PREFERENCES_BYTES = 64 * 1024;
const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const PORTABLE_SECTIONS = new Set(['PROFILE', 'SETTINGS', 'PROJECT_METADATA', 'CONVERSATIONS', 'AGENT_HISTORY', 'LIBRARY_METADATA']);

export interface PortableProfileManifest {
  format_version: 1;
  profile_id: string;
  profile_schema_version: number;
  fielora_version: string;
  created_at: string;
  source_os: string;
  included_sections: string[];
  library_mode: 'METADATA_ONLY' | 'INCLUDE_BLOBS';
  encryption: { mode: 'NONE'; envelope_version: 1 };
  checksums: Record<string, string>;
  files: Array<{ path: string; size: number }>;
}

export interface PortableInputFile {
  archive_path: string;
  source_path: string;
}

async function sha256File(filePath: string): Promise<string> {
  const handle = await open(filePath, 'r');
  const digest = createHash('sha256');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const read = await handle.read(buffer, 0, buffer.length, null);
      if (read.bytesRead === 0) break;
      digest.update(buffer.subarray(0, read.bytesRead));
    }
  } finally { await handle.close(); }
  return digest.digest('hex');
}

function allowedArchivePath(value: string): boolean {
  if (value === 'data/profile.sqlite' || value === 'data/app-preferences.json') return true;
  const match = /^library\/blobs\/objects\/([0-9a-f]{2})\/([0-9a-f]{64})$/u.exec(value);
  return Boolean(match && match[1] === match[2]!.slice(0, 2));
}

function destinationFor(root: string, archivePath: string): string {
  if (!allowedArchivePath(archivePath)) throw new Error('Portable profile contains a disallowed path');
  const resolved = path.join(root, ...archivePath.split('/'));
  const relative = path.relative(path.resolve(root), path.resolve(resolved));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Portable profile path escaped extraction root');
  return resolved;
}

function validSections(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= PORTABLE_SECTIONS.size
    && new Set(value).size === value.length && value.every((item) => typeof item === 'string' && PORTABLE_SECTIONS.has(item));
}

async function writeAll(handle: Awaited<ReturnType<typeof open>>, bytes: Buffer): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) offset += (await handle.write(bytes, offset)).bytesWritten;
}

async function readExact(handle: Awaited<ReturnType<typeof open>>, length: number, position: number): Promise<Buffer> {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const result = await handle.read(bytes, offset, length - offset, position + offset);
    if (result.bytesRead === 0) throw new Error('Portable profile is truncated');
    offset += result.bytesRead;
  }
  return bytes;
}

export async function createPortableProfile(
  target: string,
  profile: Omit<PortableProfileManifest, 'format_version' | 'created_at' | 'encryption' | 'checksums' | 'files'>,
  inputs: PortableInputFile[],
): Promise<PortableProfileManifest> {
  if (!PROFILE_ID.test(profile.profile_id) || !Number.isInteger(profile.profile_schema_version) || profile.profile_schema_version < 1
    || !validSections(profile.included_sections) || !profile.included_sections.includes('PROFILE')) {
    throw new Error('Invalid portable profile identity');
  }
  const unique = new Set<string>();
  const files: PortableProfileManifest['files'] = [];
  const checksums: Record<string, string> = {};
  for (const input of [...inputs].sort((left, right) => left.archive_path.localeCompare(right.archive_path))) {
    if (!allowedArchivePath(input.archive_path) || unique.has(input.archive_path)) throw new Error('Invalid portable profile file set');
    unique.add(input.archive_path);
    const info = await stat(input.source_path);
    if (!info.isFile() || !Number.isSafeInteger(info.size)) throw new Error('Portable profile input is not a regular file');
    if (input.archive_path === 'data/app-preferences.json' && info.size > MAX_PREFERENCES_BYTES) throw new Error('Portable profile preferences are too large');
    if (profile.library_mode === 'METADATA_ONLY' && input.archive_path.startsWith('library/')) throw new Error('Metadata-only profile cannot include Library blobs');
    files.push({ path: input.archive_path, size: info.size });
    checksums[input.archive_path] = await sha256File(input.source_path);
  }
  if (!unique.has('data/profile.sqlite') || files.length > MAX_FILES
    || profile.included_sections.includes('SETTINGS') !== unique.has('data/app-preferences.json')) throw new Error('Portable profile database is missing');
  const manifest: PortableProfileManifest = {
    format_version: 1,
    ...profile,
    created_at: new Date().toISOString(),
    encryption: { mode: 'NONE', envelope_version: 1 },
    checksums,
    files,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('Portable profile manifest is too large');
  const output = await open(target, 'wx');
  try {
    await writeAll(output, MAGIC);
    const length = Buffer.alloc(4); length.writeUInt32BE(manifestBytes.length);
    await writeAll(output, length);
    await writeAll(output, manifestBytes);
    for (const item of files) {
      const pathBytes = Buffer.from(item.path, 'utf8');
      const header = Buffer.alloc(12);
      header.writeUInt32BE(pathBytes.length, 0);
      header.writeBigUInt64BE(BigInt(item.size), 4);
      await writeAll(output, header);
      await writeAll(output, pathBytes);
      const input = await open(inputs.find((candidate) => candidate.archive_path === item.path)!.source_path, 'r');
      try {
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let position = 0;
        while (position < item.size) {
          const read = await input.read(buffer, 0, Math.min(buffer.length, item.size - position), position);
          if (read.bytesRead === 0) throw new Error('Portable profile input changed during export');
          await writeAll(output, buffer.subarray(0, read.bytesRead));
          position += read.bytesRead;
        }
      } finally { await input.close(); }
    }
    await output.sync();
  } catch (error) {
    await output.close();
    throw error;
  }
  await output.close();
  return manifest;
}

export async function extractPortableProfile(archive: string, destinationRoot: string): Promise<PortableProfileManifest> {
  const input = await open(archive, 'r');
  try {
    const archiveSize = (await input.stat()).size;
    let position = 0;
    const magic = await readExact(input, MAGIC.length, position); position += MAGIC.length;
    if (!magic.equals(MAGIC)) throw new Error('Not a Fielora portable profile');
    const manifestLength = (await readExact(input, 4, position)).readUInt32BE(); position += 4;
    if (manifestLength === 0 || manifestLength > MAX_MANIFEST_BYTES) throw new Error('Invalid portable profile manifest length');
    const manifest = JSON.parse((await readExact(input, manifestLength, position)).toString('utf8')) as PortableProfileManifest;
    position += manifestLength;
    if (manifest.format_version !== 1 || manifest.encryption?.mode !== 'NONE' || manifest.encryption.envelope_version !== 1
      || !Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.length > MAX_FILES
      || typeof manifest.checksums !== 'object' || manifest.checksums === null
      || !PROFILE_ID.test(manifest.profile_id) || !Number.isInteger(manifest.profile_schema_version) || manifest.profile_schema_version < 1
      || !validSections(manifest.included_sections) || !manifest.included_sections.includes('PROFILE')
      || !['METADATA_ONLY', 'INCLUDE_BLOBS'].includes(manifest.library_mode)
      || typeof manifest.fielora_version !== 'string' || manifest.fielora_version.length > 64
      || typeof manifest.source_os !== 'string' || manifest.source_os.length > 32
      || typeof manifest.created_at !== 'string' || !Number.isFinite(Date.parse(manifest.created_at))) {
      throw new Error('Unsupported portable profile manifest');
    }
    const seen = new Set<string>();
    await mkdir(destinationRoot, { recursive: true });
    for (const declared of manifest.files) {
      if (!allowedArchivePath(declared.path) || seen.has(declared.path) || !Number.isSafeInteger(declared.size) || declared.size < 0
        || !/^[0-9a-f]{64}$/u.test(manifest.checksums[declared.path] ?? '')) {
        throw new Error('Invalid portable profile file declaration');
      }
      if (declared.path === 'data/app-preferences.json' && declared.size > MAX_PREFERENCES_BYTES) throw new Error('Portable profile preferences are too large');
      if (manifest.library_mode === 'METADATA_ONLY' && declared.path.startsWith('library/')) throw new Error('Metadata-only profile contains Library blobs');
      seen.add(declared.path);
      const header = await readExact(input, 12, position); position += 12;
      const pathLength = header.readUInt32BE(0);
      const size = Number(header.readBigUInt64BE(4));
      if (pathLength === 0 || pathLength > 1024 || size !== declared.size || !Number.isSafeInteger(size)) throw new Error('Portable profile record mismatch');
      const recordPath = (await readExact(input, pathLength, position)).toString('utf8'); position += pathLength;
      if (recordPath !== declared.path) throw new Error('Portable profile record order mismatch');
      const target = destinationFor(destinationRoot, recordPath);
      await mkdir(path.dirname(target), { recursive: true });
      const output = await open(target, 'wx');
      const digest = createHash('sha256');
      try {
        let remaining = size;
        while (remaining > 0) {
          const chunk = await readExact(input, Math.min(1024 * 1024, remaining), position);
          position += chunk.length; remaining -= chunk.length;
          digest.update(chunk); await writeAll(output, chunk);
        }
        await output.sync();
      } finally { await output.close(); }
      if (digest.digest('hex') !== manifest.checksums[recordPath]) throw new Error('Portable profile checksum mismatch');
    }
    if (!seen.has('data/profile.sqlite') || manifest.included_sections.includes('SETTINGS') !== seen.has('data/app-preferences.json')
      || Object.keys(manifest.checksums).length !== seen.size || position !== archiveSize) throw new Error('Portable profile has missing or trailing data');
    return manifest;
  } finally { await input.close(); }
}
