import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, readdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ApplyWorkspaceFileRequest, TerminalEvent, TerminalRunResult, WorkspaceFileEntry,
  WorkspaceFileView,
} from './workspace-types';

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 2_500;
const MAX_DEPTH = 16;
const MAX_TERMINAL_OUTPUT_BYTES = 512 * 1024;
const IGNORED_DIRECTORIES = new Set(['.git', '.webpack', 'node_modules', 'target', 'dist', 'build', 'out']);

interface TerminalRun {
  child: ChildProcessWithoutNullStreams;
  fieldId: string;
  cancelled: boolean;
  emittedBytes: number;
  truncated: boolean;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeRelative(value: string): string {
  if (!value || value.length > 4_096 || value.includes('\0') || path.isAbsolute(value)) {
    throw new Error('Invalid project-relative path');
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => part === '..' || part === '')) {
    throw new Error('Invalid project-relative path');
  }
  return normalized;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.includes(0)) throw new Error('Binary files are not supported');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Only UTF-8 text files are supported');
  }
}

export class WorkspaceRuntime {
  readonly #runs = new Map<string, TerminalRun>();
  readonly #emit: (event: TerminalEvent) => void;

  constructor(emit: (event: TerminalEvent) => void) { this.#emit = emit; }

  async #root(rootPath: string): Promise<string> {
    const root = await realpath(rootPath);
    if (!(await stat(root)).isDirectory()) throw new Error('Project root is unavailable');
    return root;
  }

  async #file(rootPath: string, relativePath: string): Promise<{ root: string; target: string; relative: string }> {
    const root = await this.#root(rootPath);
    const relative = safeRelative(relativePath);
    const candidate = path.resolve(root, ...relative.split('/'));
    if (!inside(root, candidate)) throw new Error('Project path escaped its root');
    const target = await realpath(candidate);
    if (!inside(root, target) || !(await lstat(target)).isFile()) throw new Error('Project file is unavailable');
    return { root, target, relative };
  }

  async listFiles(rootPath: string): Promise<WorkspaceFileEntry[]> {
    const root = await this.#root(rootPath);
    const files: WorkspaceFileEntry[] = [];
    const walk = async (directory: string, depth: number): Promise<void> => {
      if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (files.length >= MAX_FILES) break;
        if (entry.isSymbolicLink()) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolute, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        const info = await stat(absolute);
        if (info.size > MAX_FILE_BYTES) continue;
        files.push({ relative_path: path.relative(root, absolute).replaceAll('\\', '/'), size: info.size });
      }
    };
    await walk(root, 0);
    return files;
  }

  async readFile(rootPath: string, relativePath: string): Promise<WorkspaceFileView> {
    const file = await this.#file(rootPath, relativePath);
    const bytes = await readFile(file.target);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('File is too large');
    return {
      relative_path: file.relative,
      size: bytes.byteLength,
      content: decodeText(bytes),
      sha256: digest(bytes),
    };
  }

  async applyFile(rootPath: string, request: ApplyWorkspaceFileRequest): Promise<WorkspaceFileView> {
    if (!/^[0-9a-f]{64}$/.test(request.expected_sha256)) throw new Error('Invalid expected file hash');
    const encoded = new TextEncoder().encode(request.content);
    if (encoded.byteLength > MAX_FILE_BYTES || request.content.includes('\0')) throw new Error('File content is too large or binary');
    const file = await this.#file(rootPath, request.relative_path);
    const current = await readFile(file.target);
    if (digest(current) !== request.expected_sha256) throw new Error('FILE_CHANGED_SINCE_REVIEW');
    const info = await stat(file.target);
    const temporary = path.join(path.dirname(file.target), `.fielora-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, encoded, { flag: 'wx' });
      await chmod(temporary, info.mode);
      await rename(temporary, file.target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    return this.readFile(rootPath, request.relative_path);
  }

  async runTerminal(rootPath: string, fieldId: string, command: string): Promise<TerminalRunResult> {
    const root = await this.#root(rootPath);
    if (!command.trim() || command.length > 8_000 || command.includes('\0')) throw new Error('Invalid terminal command');
    const runId = `run_${randomUUID()}`;
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      cwd: root,
      env: process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const run: TerminalRun = { child, fieldId, cancelled: false, emittedBytes: 0, truncated: false };
    this.#runs.set(runId, run);
    this.#emit({ event: 'event.workspace.terminal', run_id: runId, field_id: fieldId, kind: 'STARTED', stream: null, text: null, exit_code: null });
    const output = (stream: 'STDOUT' | 'STDERR', bytes: Buffer): void => {
      if (run.emittedBytes >= MAX_TERMINAL_OUTPUT_BYTES) {
        if (!run.truncated) {
          run.truncated = true;
          this.#emit({ event: 'event.workspace.terminal', run_id: runId, field_id: fieldId, kind: 'OUTPUT', stream: 'STDERR', text: '\n[Fielora truncated terminal output at 512 KiB]\n', exit_code: null });
        }
        return;
      }
      const remaining = MAX_TERMINAL_OUTPUT_BYTES - run.emittedBytes;
      const chunk = bytes.subarray(0, remaining);
      run.emittedBytes += chunk.byteLength;
      this.#emit({ event: 'event.workspace.terminal', run_id: runId, field_id: fieldId, kind: 'OUTPUT', stream, text: chunk.toString('utf8'), exit_code: null });
    };
    child.stdout.on('data', (bytes: Buffer) => output('STDOUT', bytes));
    child.stderr.on('data', (bytes: Buffer) => output('STDERR', bytes));
    child.on('error', (error) => {
      this.#runs.delete(runId);
      this.#emit({ event: 'event.workspace.terminal', run_id: runId, field_id: fieldId, kind: run.cancelled ? 'CANCELLED' : 'FAILED', stream: null, text: run.cancelled ? null : error.message, exit_code: null });
    });
    child.on('close', (code) => {
      if (!this.#runs.delete(runId)) return;
      this.#emit({
        event: 'event.workspace.terminal', run_id: runId, field_id: fieldId,
        kind: run.cancelled ? 'CANCELLED' : code === 0 ? 'COMPLETED' : 'FAILED',
        stream: null, text: null, exit_code: code,
      });
    });
    child.stdin.end();
    return { run_id: runId };
  }

  cancelTerminal(runId: string): void {
    const run = this.#runs.get(runId);
    if (!run) throw new Error('Terminal run is not active');
    run.cancelled = true;
    run.child.kill();
  }

  dispose(): void {
    for (const run of this.#runs.values()) {
      run.cancelled = true;
      run.child.kill();
    }
    this.#runs.clear();
  }
}
