import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-terminal-session-'));
const projectRoot = path.join(dataRoot, 'project');
const evidenceDir = path.join(root, 'artifacts', 'workspace-shell-routing');
const runtimeNode = process.execPath;
const forgeEntry = path.join(root, 'apps', 'desktop', 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const packagedApp = process.env.FIELORA_PACKAGED_APP ?? '';
const output = [];
let child;
let port;

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); });
    this.socket.addEventListener('message', (event) => {
      const value = JSON.parse(String(event.data));
      if (!value.id) return;
      const pending = this.pending.get(value.id);
      if (!pending) return;
      this.pending.delete(value.id);
      value.error ? pending.reject(new Error(value.error.message)) : pending.resolve(value.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}

async function connect() {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find((item) => item.type === 'page' && (item.url.startsWith('fielora://app') || item.url.includes('main_window')));
      if (target) { const cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.open(); await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); return cdp; }
    } catch { /* Electron is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Electron target timeout\n${output.join('')}`);
}

async function wait(cdp, expression, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await cdp.eval(`Boolean(${expression})`)) return; } catch { /* Renderer may be reloading. */ }
    await new Promise((resolve) => setTimeout(resolve, 70));
  }
  throw new Error(`wait failed: ${expression}\n${output.join('')}`);
}

async function screenshot(cdp, name) {
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(evidenceDir, name), Buffer.from(image.data, 'base64'));
}

function setValue(selector, value) {
  return `(()=>{const element=document.querySelector(${JSON.stringify(selector)});const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value');descriptor.set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));})()`;
}

try {
  await mkdir(projectRoot, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  port = await freePort();
  const env = { ...process.env, Path: `${path.dirname(runtimeNode)};${process.env.Path ?? process.env.PATH ?? ''}`, APPDATA: path.join(dataRoot, 'roaming'), LOCALAPPDATA: dataRoot, FIELORA_E2E: '1', FIELORA_E2E_DEBUG_PORT: String(port), ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' };
  child = packagedApp
    ? spawn(packagedApp, [], { cwd: path.dirname(packagedApp), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(runtimeNode, [forgeEntry, 'start'], { cwd: path.join(root, 'apps', 'desktop'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  const cdp = await connect();
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]') && window.fieloraTest`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Terminal Session 验收',goal:'Focused terminal verification',root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'终端隔离验收',provider_config_id:null,model_id:null})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('.conversation-context-header') && document.querySelector('[data-testid="rail-terminal"]')`);

  await cdp.eval(`document.querySelector('[data-testid="rail-terminal"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="bottom-terminal-dock"]')?.getAttribute('aria-hidden') === 'false'`);
  await cdp.eval(setValue('[data-testid="bottom-terminal-command"]', 'Write-Output FIELORA_BOTTOM_TERMINAL'));
  await cdp.eval(`document.querySelector('[data-testid="bottom-terminal-command"]').closest('form').requestSubmit()`);
  await wait(cdp, `document.querySelector('[data-testid="bottom-terminal-output"]')?.innerText.includes('FIELORA_BOTTOM_TERMINAL')`);
  await wait(cdp, `!document.querySelector('[data-testid="bottom-terminal-session"] .terminal-prompt button')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('[data-testid="message-assistant"]').length`), 0);

  await cdp.eval(setValue('[data-testid="bottom-terminal-command"]', 'cd..'));
  await cdp.eval(`document.querySelector('[data-testid="bottom-terminal-command"]').closest('form').requestSubmit()`);
  await wait(cdp, `document.querySelector('[data-testid="bottom-terminal-session"] .terminal-prompt > span')?.textContent === ${JSON.stringify(`PS ${path.dirname(projectRoot)}>` )}`);
  await screenshot(cdp, '03-bottom-terminal-routing.png');
  await cdp.eval(`document.querySelector('[data-testid="bottom-terminal-close"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="bottom-terminal-dock"]')?.getAttribute('aria-hidden') === 'true'`);

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'TERMINAL'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-terminal"]') && document.querySelector('[data-testid="terminal-command"]')`);
  await cdp.eval(setValue('[data-testid="terminal-command"]', 'Write-Output ((Get-Location).Path); Write-Output FIELORA_SIDE_TERMINAL'));
  await cdp.eval(`document.querySelector('[data-testid="terminal-command"]').closest('form').requestSubmit()`);
  await wait(cdp, `document.querySelector('[data-testid="terminal-output"] pre')?.innerText.includes('FIELORA_SIDE_TERMINAL')`);
  const sideOutput = await cdp.eval(`document.querySelector('[data-testid="terminal-output"] pre').innerText.trim().split(/\\r?\\n/)`);
  assert.equal(sideOutput[0], path.dirname(projectRoot));
  assert.equal(sideOutput[1], 'FIELORA_SIDE_TERMINAL');
  assert.equal(await cdp.eval(`document.querySelectorAll('[data-testid="message-assistant"]').length`), 0);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="terminal-message-projection"]') === null`), true);
  await screenshot(cdp, '04-side-powershell-terminal.png');

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('TERMINAL_SESSION_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
