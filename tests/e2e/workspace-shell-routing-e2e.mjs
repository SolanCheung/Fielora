import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-shell-routing-'));
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
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(projectRoot, 'src', 'routing.ts'), 'export const workspaceRouting = true;\n');

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
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Shell Routing 验收',goal:'Focused shell routing verification',root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'自然对话工作面',provider_config_id:null,model_id:null})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('.conversation-context-header')`);

  assert.equal(await cdp.eval(`document.querySelector('.conversation-tab-strip') === null && document.querySelector('[data-testid="conversation-tabs"]') === null`), true);
  assert.equal(await cdp.eval(`document.querySelectorAll('.conversation-context-header').length`), 1);
  await screenshot(cdp, '01-natural-conversation-header.png');

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-files"]') && document.querySelector('[data-testid="workspace-file"]') && document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  const roundedFileIcon = await cdp.eval(`(()=>{const tile=document.querySelector('[data-testid="workspace-file"] .file-type-tile');return{hasTile:Boolean(tile),radius:tile?.getAttribute('rx')};})()`);
  assert.deepEqual(roundedFileIcon, { hasTile: true, radius: '3.25' });
  await cdp.eval(`document.querySelector('[data-testid="right-dock-close-files"]').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  await new Promise((resolve) => setTimeout(resolve, 320));
  assert.equal(await cdp.eval(`getComputedStyle(document.querySelector('[data-testid="right-workspace-dock"]')).visibility`), 'hidden');

  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-home"]') && document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  const launcher = await cdp.eval(`(()=>{const buttons=[...document.querySelectorAll('[data-testid^="right-dock-home-"]')];return{labels:buttons.map((button)=>button.querySelector('span')?.textContent),shortcuts:buttons.map((button)=>button.querySelector('kbd')?.textContent),count:buttons.length};})()`);
  assert.deepEqual(launcher.labels, ['审阅', '终端', '浏览器', '文件', '侧边聊天']);
  assert.deepEqual(launcher.shortcuts, ['Ctrl+Shift+G', 'Ctrl+`', 'Ctrl+T', 'Ctrl+P', 'Ctrl+Alt+S']);
  assert.equal(launcher.count, 5);
  await screenshot(cdp, '02-right-workspace-launcher.png');

  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await new Promise((resolve) => setTimeout(resolve, 70));
  const closingDock = await cdp.eval(`(()=>{const dock=document.querySelector('[data-testid="right-workspace-dock"]');const tools=document.querySelector('[data-testid="chrome-tools"]');const d=dock.getBoundingClientRect();const t=tools.getBoundingClientRect();return{dockOpacity:Number(getComputedStyle(dock).opacity),dockLeft:d.left,dockRight:d.right,toolsLeft:t.left,toolsRight:t.right,viewport:innerWidth};})()`);
  assert.ok(closingDock.dockOpacity < 1, JSON.stringify(closingDock));
  assert.ok(closingDock.toolsRight <= closingDock.viewport, JSON.stringify(closingDock));
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-home"]')`);

  assert.equal(await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-terminal"]') === null`), true);
  await cdp.eval(`document.querySelector('[data-testid="rail-terminal"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="bottom-terminal-dock"]')?.getAttribute('aria-hidden') === 'false'`);
  await wait(cdp, `document.activeElement === document.querySelector('[data-testid="bottom-terminal-command"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-terminal"]') === null`), true);
  const bottomTerminal = await cdp.eval(`(()=>{const session=document.querySelector('[data-testid="bottom-terminal-session"]');return{text:session.innerText,toolbar:Boolean(session.querySelector('.terminal-toolbar')),background:getComputedStyle(session).backgroundColor,inlinePrompt:Boolean(session.querySelector('.terminal-transcript > .terminal-prompt')),detachedPrompt:Boolean(session.querySelector(':scope > .terminal-prompt'))};})()`);
  assert.match(bottomTerminal.text, /Windows PowerShell/);
  assert.equal(bottomTerminal.toolbar, false);
  assert.equal(bottomTerminal.background, 'rgba(0, 0, 0, 0)');
  assert.equal(bottomTerminal.inlinePrompt, true);
  assert.equal(bottomTerminal.detachedPrompt, false);
  await cdp.eval(setValue('[data-testid="bottom-terminal-command"]', 'Write-Output FIELORA_BOTTOM_TERMINAL'));
  await cdp.eval(`document.querySelector('[data-testid="bottom-terminal-command"]').closest('form').requestSubmit()`);
  await wait(cdp, `document.querySelector('[data-testid="bottom-terminal-output"]')?.innerText.includes('FIELORA_BOTTOM_TERMINAL')`);
  await wait(cdp, `!document.querySelector('[data-testid="bottom-terminal-session"] .terminal-prompt button')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('[data-testid="message-assistant"]').length`), 0);
  await cdp.eval(setValue('[data-testid="bottom-terminal-command"]', 'cd..'));
  await cdp.eval(`document.querySelector('[data-testid="bottom-terminal-command"]').closest('form').requestSubmit()`);
  await wait(cdp, `document.querySelector('[data-testid="bottom-terminal-session"] .terminal-prompt > span')?.textContent.includes(${JSON.stringify(path.dirname(projectRoot))})`);
  await screenshot(cdp, '03-bottom-terminal-routing.png');
  await cdp.eval(`document.querySelector('[data-testid="bottom-terminal-close"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="bottom-terminal-dock"]')?.getAttribute('aria-hidden') === 'true'`);

  await cdp.eval(`document.querySelector('[data-testid="right-dock-home-terminal"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-terminal"]') && document.querySelector('[data-testid="terminal-session"]')`);
  await wait(cdp, `document.activeElement === document.querySelector('[data-testid="terminal-command"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="bottom-terminal-dock"]')?.getAttribute('aria-hidden')`), 'true');
  const sideTerminal = await cdp.eval(`(()=>{const view=document.querySelector('.right-dock-view-terminal:not([hidden])');const terminal=document.querySelector('[data-testid="terminal-dock"]');const session=document.querySelector('[data-testid="terminal-session"]');return{text:session.innerText,toolbar:Boolean(terminal.querySelector('.terminal-toolbar')),legacyActions:Boolean(terminal.querySelector('[data-testid="run-tests"],[data-testid="terminal-run"]')),viewBackground:getComputedStyle(view).backgroundColor,terminalBackground:getComputedStyle(terminal).backgroundColor,sessionBackground:getComputedStyle(session).backgroundColor,toolbarRow:Boolean(document.querySelector('[data-testid="right-dock-toolbar"]')),inlinePrompt:Boolean(session.querySelector('.terminal-transcript > .terminal-prompt')),detachedPrompt:Boolean(session.querySelector(':scope > .terminal-prompt'))};})()`);
  assert.match(sideTerminal.text, /Windows PowerShell/);
  assert.equal(sideTerminal.toolbar, false);
  assert.equal(sideTerminal.legacyActions, false);
  assert.equal(sideTerminal.terminalBackground, sideTerminal.viewBackground);
  assert.equal(sideTerminal.sessionBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(sideTerminal.toolbarRow, false);
  assert.equal(sideTerminal.inlinePrompt, true);
  assert.equal(sideTerminal.detachedPrompt, false);
  await cdp.eval(setValue('[data-testid="terminal-command"]', 'Write-Output ((Get-Location).Path); Write-Output FIELORA_SIDE_TERMINAL'));
  await cdp.eval(`document.querySelector('[data-testid="terminal-command"]').closest('form').requestSubmit()`);
  await wait(cdp, `document.querySelector('[data-testid="terminal-output"]')?.innerText.includes('FIELORA_SIDE_TERMINAL')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="terminal-output"]')?.innerText.includes(${JSON.stringify(path.dirname(projectRoot))})`), true);
  assert.equal(await cdp.eval(`document.querySelectorAll('[data-testid="message-assistant"]').length`), 0);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="terminal-message-projection"]') === null`), true);
  await screenshot(cdp, '04-side-powershell-terminal.png');

  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-terminal"]') && document.querySelector('[data-testid="terminal-session"]')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('[data-testid="right-dock-tab-terminal"]').length`), 1);

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('WORKSPACE_SHELL_ROUTING_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
