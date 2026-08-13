import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

const MAX_FRAME_BYTES = 4 * 1024 * 1024;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}

export class FipcClient extends EventEmitter {
  private buffer = Buffer.alloc(0);
  private discarding = false;
  private readonly pending = new Map<string, Pending>();
  private readonly child: ChildProcessWithoutNullStreams;

  constructor(child: ChildProcessWithoutNullStreams) {
    super();
    this.child = child;
    child.stdout.on('data', (chunk: Buffer) => this.push(chunk));
    child.on('exit', () => this.rejectAll(new Error('Fielora Core exited')));
  }

  request(method: string, params: unknown = {}, deadlineMs = 10_000): Promise<unknown> {
    const id = randomUUID();
    const traceId = randomUUID();
    const envelope = {
      jsonrpc: '2.0', id, method, params,
      _meta: { protocol: '1.0', trace_id: traceId, deadline_ms: deadlineMs },
    };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`FIPC request timed out: ${method}`));
      }, deadlineMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${JSON.stringify(envelope)}\n`, 'utf8', (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  closeParentPipe(): void {
    this.child.stdin.end();
  }

  rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private push(chunk: Buffer): void {
    for (const byte of chunk) {
      if (this.discarding) {
        if (byte === 10) this.discarding = false;
        continue;
      }
      if (byte === 10) {
        const frame = this.buffer;
        this.buffer = Buffer.alloc(0);
        this.handleFrame(frame);
      } else if (this.buffer.length === MAX_FRAME_BYTES) {
        this.buffer = Buffer.alloc(0);
        this.discarding = true;
        this.emit('protocol-error', new Error('Core emitted oversized frame'));
      } else {
        this.buffer = Buffer.concat([this.buffer, Buffer.of(byte)]);
      }
    }
  }

  private handleFrame(frame: Buffer): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame)) as Record<string, unknown>;
    } catch (error) {
      this.emit('protocol-error', error);
      return;
    }
    if (typeof message.method === 'string' && !('id' in message)) {
      this.emit('notification', message);
      return;
    }
    if (typeof message.id !== 'string') return;
    const pending = this.pending.get(message.id);
    if (!pending) {
      this.emit('late-response', message.id);
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    if ('error' in message) {
      const error = message.error as { message?: string; data?: { code?: string } };
      const failure = new Error(error.message ?? 'Core request failed');
      Object.assign(failure, { code: error.data?.code });
      pending.reject(failure);
    } else {
      pending.resolve(message.result);
    }
  }
}
