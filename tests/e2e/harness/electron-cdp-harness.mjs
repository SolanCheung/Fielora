import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';

export class CdpConnection {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
  }

  async open() {
    if (this.socket.readyState !== WebSocket.OPEN) await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const value = JSON.parse(String(event.data));
      const pending = this.pending.get(value.id);
      if (!pending) return;
      this.pending.delete(value.id);
      value.error ? pending.reject(new Error(value.error.message)) : pending.resolve(value.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

export async function freeDebuggingPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to allocate an Electron debugging port');
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

export async function pollUntil(check, { timeoutMs, intervalMs, errorMessage }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await check();
      if (result) return result;
    } catch {}
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
  throw new Error(typeof errorMessage === 'function' ? errorMessage() : errorMessage);
}

export async function launchElectron({ root, dataRoot, executablePath = '', args = [], extraEnv = {}, output = [] }) {
  const port = await freeDebuggingPort();
  const env = {
    ...process.env,
    ...extraEnv,
    APPDATA: path.join(dataRoot, 'roaming'),
    LOCALAPPDATA: dataRoot,
    FIELORA_E2E: '1',
    FIELORA_E2E_DEBUG_PORT: String(port),
  };
  const child = executablePath
    ? spawn(executablePath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @fielora/desktop start'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  return { child, output, port };
}

export async function connectToFieloraApp({ port, output, timeoutMs = 60_000, enablePage = false }) {
  const target = await pollUntil(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    return targets.find((item) => item.type === 'page' && (item.url.startsWith('fielora://app') || item.url.includes('main_window')));
  }, { timeoutMs, intervalMs: 100, errorMessage: () => `Electron target timeout\n${output.join('')}` });
  const cdp = new CdpConnection(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Runtime.enable');
  if (enablePage) await cdp.send('Page.enable');
  return cdp;
}

export async function waitForExpression(cdp, expression, { timeoutMs = 20_000, output = [] } = {}) {
  return pollUntil(async () => await cdp.eval(`Boolean(${expression})`), {
    timeoutMs,
    intervalMs: 75,
    errorMessage: () => `wait failed: ${expression}\n${output.join('')}`,
  });
}

export async function captureScreenshot(cdp, filePath) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(filePath, Buffer.from(shot.data, 'base64'));
}

export async function waitForChildExit(child) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve) => child.once('exit', resolve));
}

export async function cleanupElectronProcess(child, timeoutMs = 2_000) {
  if (!child || child.exitCode !== null) return;
  spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
