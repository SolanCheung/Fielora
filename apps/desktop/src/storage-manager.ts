import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access, copyFile, mkdir, open, readFile, readdir, rename, rm, rmdir, stat, statfs, writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export interface StorageRoots {
  data_root: string;
  library_root: string;
  cache_root: string;
}

export interface StorageDetail {
  id: 'MAIN_DATABASE' | 'AGENT_LEDGER' | 'LIBRARY_BLOBS' | 'SQLITE_WAL' | 'SQLITE_SHM' | 'VECTOR_INDEX' | 'SEARCH_INDEX' | 'INTERNAL_INDEX' | 'CACHE';
  label: string;
  path: string | null;
  state: 'PRESENT' | 'NOT_PRESENT' | 'SHARED_DATABASE';
}

export interface StorageInfo {
  roots: StorageRoots;
  cache_bytes: number;
  details: StorageDetail[];
}

interface RootLocator {
  version: 1;
  data_root: string;
  library_root: string;
  cache_root: string;
}

export interface CopiedFile {
  relative_path: string;
  size: number;
  sha256: string;
}

const LOCATOR_NAME = 'storage-roots.json';
const BLOB_REF = /^blobs\/objects\/([0-9a-f]{2})\/([0-9a-f]{64})$/u;

function absolute(value: string, label: string): string {
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved) || resolved === path.parse(resolved).root) throw new Error(`Invalid ${label}`);
  return resolved;
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertIndependentRoots(roots: StorageRoots): void {
  const entries = Object.entries(roots) as Array<[keyof StorageRoots, string]>;
  for (let index = 0; index < entries.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < entries.length; otherIndex += 1) {
      const [leftName, left] = entries[index]!;
      const [rightName, right] = entries[otherIndex]!;
      if (inside(left, right) || inside(right, left)) {
        throw new Error(`${leftName} and ${rightName} must be independent roots`);
      }
    }
  }
}

async function exists(candidate: string): Promise<boolean> {
  try { await access(candidate); return true; } catch { return false; }
}

export async function sha256File(filePath: string): Promise<string> {
  const handle = await open(filePath, 'r');
  const digest = createHash('sha256');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
    }
  } finally { await handle.close(); }
  return digest.digest('hex');
}

async function regularFiles(root: string): Promise<string[]> {
  if (!await exists(root)) return [];
  const result: string[] = [];
  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Storage roots cannot contain symbolic links');
      if (entry.isDirectory()) await walk(candidate);
      else if (entry.isFile()) result.push(candidate);
      else throw new Error('Storage roots contain an unsupported filesystem entry');
    }
  };
  await walk(root);
  return result;
}

export async function directoryManifest(root: string): Promise<CopiedFile[]> {
  const files = await regularFiles(root);
  return Promise.all(files.map(async (filePath) => {
    const relative = path.relative(root, filePath).replaceAll('\\', '/');
    const info = await stat(filePath);
    return { relative_path: relative, size: info.size, sha256: await sha256File(filePath) };
  }));
}

export async function copyDirectoryVerified(source: string, destination: string): Promise<CopiedFile[]> {
  const sourceRoot = absolute(source, 'source root');
  const destinationRoot = absolute(destination, 'destination root');
  if (inside(sourceRoot, destinationRoot) || inside(destinationRoot, sourceRoot)) {
    throw new Error('Storage roots must not contain one another');
  }
  await mkdir(destinationRoot, { recursive: true });
  const existing = await readdir(destinationRoot);
  if (existing.length !== 0) throw new Error('Migration target must be empty');
  const sourceManifest = await directoryManifest(sourceRoot);
  for (const item of sourceManifest) {
    const from = path.join(sourceRoot, ...item.relative_path.split('/'));
    const to = path.join(destinationRoot, ...item.relative_path.split('/'));
    if (!inside(destinationRoot, to)) throw new Error('Migration path escaped the destination root');
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to, constants.COPYFILE_EXCL);
  }
  const copiedManifest = await directoryManifest(destinationRoot);
  if (JSON.stringify(copiedManifest) !== JSON.stringify(sourceManifest)) {
    throw new Error('Migration copy verification failed');
  }
  return copiedManifest;
}

async function directoryBytes(root: string): Promise<number> {
  const files = await regularFiles(root);
  const sizes = await Promise.all(files.map((candidate) => stat(candidate).then((value) => value.size)));
  return sizes.reduce((total, size) => total + size, 0);
}

async function assertSpace(target: string, requiredBytes: number): Promise<void> {
  const filesystem = await statfs(target);
  const available = Number(filesystem.bavail) * Number(filesystem.bsize);
  if (!Number.isSafeInteger(available) || available < requiredBytes) throw new Error('Migration target has insufficient free space');
}

async function assertWritable(target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const probe = path.join(target, `.fielora-write-probe-${randomUUID()}`);
  await writeFile(probe, 'ok', { flag: 'wx' });
  await rm(probe);
}

export class StorageManager {
  private roots: StorageRoots;
  readonly base_root: string;
  private readonly locator_path: string;
  private readonly persistent: boolean;

  private constructor(
    baseRoot: string,
    locatorPath: string,
    roots: StorageRoots,
    persistent: boolean,
  ) {
    this.base_root = baseRoot;
    this.locator_path = locatorPath;
    this.roots = roots;
    this.persistent = persistent;
  }

  static async open(localAppDataRoot: string, developmentRoot?: string): Promise<StorageManager> {
    const base = developmentRoot
      ? absolute(developmentRoot, 'development storage root')
      : path.join(absolute(localAppDataRoot, 'local app data root'), 'Fielora');
    const defaults: StorageRoots = {
      data_root: path.join(base, 'data'),
      library_root: path.join(base, 'library'),
      cache_root: path.join(base, 'cache'),
    };
    const locator = path.join(base, 'config', LOCATOR_NAME);
    let roots = defaults;
    if (!developmentRoot && await exists(locator)) {
      const parsed = JSON.parse(await readFile(locator, 'utf8')) as Partial<RootLocator>;
      if (parsed.version !== 1 || typeof parsed.data_root !== 'string' || typeof parsed.library_root !== 'string' || typeof parsed.cache_root !== 'string') {
        throw new Error('Invalid storage root locator');
      }
      roots = {
        data_root: absolute(parsed.data_root, 'DataRoot'),
        library_root: absolute(parsed.library_root, 'LibraryRoot'),
        cache_root: absolute(parsed.cache_root, 'CacheRoot'),
      };
    }
    assertIndependentRoots(roots);
    const manager = new StorageManager(base, locator, roots, !developmentRoot);
    await manager.ensureRoots();
    return manager;
  }

  current(): StorageRoots { return { ...this.roots }; }

  coreEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      FIELORA_MANAGED_DATA_ROOT: this.roots.data_root,
      FIELORA_MANAGED_LIBRARY_ROOT: this.roots.library_root,
      FIELORA_MANAGED_CACHE_ROOT: this.roots.cache_root,
    };
  }

  databasePath(): string { return path.join(this.roots.data_root, 'fielora.db'); }
  blobStorePath(): string { return path.join(this.roots.library_root, 'blobs', 'objects'); }

  resolveBlob(blobRef: string): string {
    const match = BLOB_REF.exec(blobRef);
    if (!match || match[1] !== match[2]!.slice(0, 2)) throw new Error('Invalid Library blob reference');
    const resolved = path.join(this.roots.library_root, ...blobRef.split('/'));
    if (!inside(this.roots.library_root, resolved)) throw new Error('Library blob escaped LibraryRoot');
    return resolved;
  }

  async importFile(sourcePath: string): Promise<{ blob_ref: string; content_hash: string; size: number }> {
    const source = absolute(sourcePath, 'Library source');
    const info = await stat(source);
    if (!info.isFile() || info.size <= 0) throw new Error('Library source must be a non-empty regular file');
    const contentHash = await sha256File(source);
    const blobRef = `blobs/objects/${contentHash.slice(0, 2)}/${contentHash}`;
    const destination = this.resolveBlob(blobRef);
    await mkdir(path.dirname(destination), { recursive: true });
    if (!await exists(destination)) await copyFile(source, destination, constants.COPYFILE_EXCL);
    const copied = await stat(destination);
    if (copied.size !== info.size || await sha256File(destination) !== contentHash) throw new Error('Library blob verification failed');
    return { blob_ref: blobRef, content_hash: contentHash, size: info.size };
  }

  async migrateClosedDataRoot(target: string, validate: (databasePath: string) => Promise<void>): Promise<string> {
    return this.migrateRoot('data_root', target, validate);
  }

  async migrateLibraryRoot(target: string): Promise<string> {
    return this.migrateRoot('library_root', target, async (copiedRoot) => {
      for (const item of await directoryManifest(copiedRoot)) {
        if (!item.relative_path.startsWith('blobs/objects/')) continue;
        const name = path.posix.basename(item.relative_path);
        if (!/^[0-9a-f]{64}$/u.test(name) || name !== item.sha256) throw new Error('Library blob hash verification failed');
      }
    });
  }

  private async migrateRoot(key: 'data_root' | 'library_root', target: string, validate: (databasePath: string) => Promise<void>): Promise<string> {
    const source = this.roots[key];
    const destination = absolute(target, key);
    if (path.resolve(source) === destination) return source;
    assertIndependentRoots({ ...this.roots, [key]: destination });
    await assertWritable(destination);
    if ((await readdir(destination)).length !== 0) throw new Error('Migration target must be empty');
    await assertSpace(destination, await directoryBytes(source));
    const staging = path.join(path.dirname(destination), `.${path.basename(destination)}.fielora-migration-${randomUUID()}`);
    try {
      await copyDirectoryVerified(source, staging);
      await validate(key === 'data_root' ? path.join(staging, 'fielora.db') : staging);
      await rmdir(destination);
      await rename(staging, destination);
      const previous = this.roots;
      this.roots = { ...previous, [key]: destination };
      try { await this.persist(); }
      catch (error) { this.roots = previous; throw error; }
      return destination;
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  async clearCache(): Promise<number> {
    const root = absolute(this.roots.cache_root, 'CacheRoot');
    const removed = await directoryBytes(root);
    for (const entry of await readdir(root)) {
      const candidate = path.join(root, entry);
      if (!inside(root, candidate) || path.dirname(candidate) !== root) throw new Error('Cache cleanup escaped CacheRoot');
      await rm(candidate, { recursive: true, force: true });
    }
    return removed;
  }

  async installImportedDatabase(snapshot: string): Promise<string> {
    const dataRoot = this.roots.data_root;
    const parent = path.dirname(dataRoot);
    const staging = path.join(parent, `.${path.basename(dataRoot)}.fielora-import-${randomUUID()}`);
    const backup = path.join(parent, `.${path.basename(dataRoot)}.fielora-import-backup-${randomUUID()}`);
    await mkdir(staging, { recursive: false });
    const destination = path.join(staging, 'fielora.db');
    try {
      await copyFile(snapshot, destination, constants.COPYFILE_EXCL);
      if (await sha256File(snapshot) !== await sha256File(destination)) throw new Error('Imported database copy verification failed');
      await rename(dataRoot, backup);
      try { await rename(staging, dataRoot); }
      catch (error) { await rename(backup, dataRoot); throw error; }
      return backup;
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  async rollbackImportedDatabase(backup: string): Promise<void> {
    const dataRoot = this.roots.data_root;
    const failed = `${dataRoot}.failed-import-${randomUUID()}`;
    await rename(dataRoot, failed);
    try { await rename(backup, dataRoot); }
    catch (error) { await rename(failed, dataRoot); throw error; }
  }

  async restoreRoots(previous: StorageRoots): Promise<void> {
    assertIndependentRoots(previous);
    this.roots = { ...previous };
    await this.persist();
  }

  async info(): Promise<StorageInfo> {
    const database = this.databasePath();
    const wal = `${database}-wal`;
    const shm = `${database}-shm`;
    const blobStore = this.blobStorePath();
    const internalIndex = path.join(this.roots.data_root, 'agent-artifacts', 'repository-context-index');
    const details: StorageDetail[] = [
      { id: 'MAIN_DATABASE', label: 'Main SQLite Database', path: database, state: await exists(database) ? 'PRESENT' : 'NOT_PRESENT' },
      { id: 'AGENT_LEDGER', label: 'Agent Ledger', path: database, state: await exists(database) ? 'SHARED_DATABASE' : 'NOT_PRESENT' },
      { id: 'LIBRARY_BLOBS', label: 'Library Blob Store', path: blobStore, state: await exists(blobStore) ? 'PRESENT' : 'NOT_PRESENT' },
      { id: 'SQLITE_WAL', label: 'SQLite WAL', path: await exists(wal) ? wal : null, state: await exists(wal) ? 'PRESENT' : 'NOT_PRESENT' },
      { id: 'SQLITE_SHM', label: 'SQLite SHM', path: await exists(shm) ? shm : null, state: await exists(shm) ? 'PRESENT' : 'NOT_PRESENT' },
      { id: 'VECTOR_INDEX', label: 'Vector Index', path: null, state: 'NOT_PRESENT' },
      { id: 'SEARCH_INDEX', label: 'Search Index', path: null, state: 'NOT_PRESENT' },
      { id: 'INTERNAL_INDEX', label: 'Internal Repository Index', path: await exists(internalIndex) ? internalIndex : null, state: await exists(internalIndex) ? 'PRESENT' : 'NOT_PRESENT' },
      { id: 'CACHE', label: 'Cache', path: this.roots.cache_root, state: 'PRESENT' },
    ];
    return { roots: this.current(), cache_bytes: await directoryBytes(this.roots.cache_root), details };
  }

  async openablePath(id: 'DATA_ROOT' | 'LIBRARY_ROOT' | 'CACHE_ROOT' | StorageDetail['id']): Promise<string | null> {
    if (id === 'DATA_ROOT') return this.roots.data_root;
    if (id === 'LIBRARY_ROOT') return this.roots.library_root;
    if (id === 'CACHE_ROOT') return this.roots.cache_root;
    return (await this.info()).details.find((item) => item.id === id)?.path ?? null;
  }

  private async ensureRoots(): Promise<void> {
    await Promise.all([
      mkdir(path.dirname(this.locator_path), { recursive: true }),
      mkdir(this.roots.data_root, { recursive: true }),
      mkdir(this.blobStorePath(), { recursive: true }),
      mkdir(this.roots.cache_root, { recursive: true }),
    ]);
  }

  private async persist(): Promise<void> {
    if (!this.persistent) return;
    const locator: RootLocator = { version: 1, ...this.roots };
    const temporary = `${this.locator_path}.${randomUUID()}.tmp`;
    const previous = `${this.locator_path}.${randomUUID()}.previous`;
    await writeFile(temporary, `${JSON.stringify(locator, null, 2)}\n`, { flag: 'wx' });
    const hadPrevious = await exists(this.locator_path);
    if (hadPrevious) await rename(this.locator_path, previous);
    try { await rename(temporary, this.locator_path); }
    catch (error) {
      if (hadPrevious) await rename(previous, this.locator_path);
      throw error;
    }
    if (hadPrevious) await rm(previous, { force: true });
  }
}
