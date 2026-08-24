import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-resource-layout-'));
const projectRoot = path.join(dataRoot, 'project');
const evidenceDir = path.join(root, 'artifacts', 'workspace-resource-layout');
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

try {
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(projectRoot, 'src', 'layout.ts'), 'export const dockLayout = true;\n');

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
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Resource Layout 验收',goal:'Focused resource layout verification',root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'自然对话标题',provider_config_id:null,model_id:null})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('.conversation-heading')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('.conversation-heading > .shell-icon').length`), 0);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="project-open-default"] [data-app-icon]')?.dataset.appIcon`), 'FILE_EXPLORER');
  await wait(cdp, `document.querySelector('[data-testid="project-open-default"] [data-icon-source="native"]')`);

  const motion = await cdp.eval(`(()=>{const layout=document.querySelector('.project-layout');const style=getComputedStyle(layout);window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}));return{property:style.transitionProperty,duration:style.transitionDuration};})()`);
  assert.ok(motion.property.includes('grid-template-columns'), JSON.stringify(motion));
  assert.notEqual(motion.duration, '0s');
  await wait(cdp, `document.querySelector('.project-layout')?.classList.contains('workspace-open')`);
  await wait(cdp, `document.querySelector('[data-testid="workspace-file"]')`);
  await cdp.eval(`[...document.querySelectorAll('[data-testid="workspace-file"]')].find((row)=>row.textContent.includes('layout.ts')).click()`);
  await wait(cdp, `document.querySelector('[data-testid="dock-file-tree-resizer"]')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('.dock-file-editor > footer').length`), 0);
  await cdp.eval(`(()=>{window.__fieloraDockFileTreeBody=document.querySelector('[data-testid="dock-file-tree-body"]');return true;})()`);

  const folderIcon = await cdp.eval(`document.querySelector('[data-testid="dock-project-open-default"] [data-app-icon]')?.dataset.appIcon`);
  assert.equal(folderIcon, 'FILE_EXPLORER');
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="dock-project-open-default"] [data-app-icon]')?.dataset.iconSource`), 'native');
  await cdp.eval(`document.querySelector('[data-testid="dock-project-open-menu-toggle"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="dock-project-open-menu"]')`);
  const launcher = await cdp.eval(`(()=>{const menu=document.querySelector('[data-testid="dock-project-open-menu"]');const buttons=[...menu.querySelectorAll(':scope > button')];return{external:[...menu.querySelectorAll('[data-app-icon]')].map((icon)=>icon.dataset.appIcon),sources:[...menu.querySelectorAll('[data-app-icon]')].map((icon)=>icon.dataset.iconSource),internal:buttons.map((button)=>button.textContent.trim()).filter(Boolean),widths:buttons.map((button)=>Math.round(button.getBoundingClientRect().width)),heights:buttons.map((button)=>Math.round(button.getBoundingClientRect().height))};})()`);
  assert.ok(launcher.external.includes('FILE_EXPLORER'), JSON.stringify(launcher));
  assert.equal(launcher.sources[launcher.external.indexOf('FILE_EXPLORER')], 'native', JSON.stringify(launcher));
  assert.ok(launcher.internal.includes('Fielora 文件'), JSON.stringify(launcher));
  assert.ok(launcher.widths.every((width) => width >= 230), JSON.stringify(launcher));
  assert.ok(launcher.heights.every((height) => height <= 44), JSON.stringify(launcher));
  await screenshot(cdp, '01-project-open-menu.png');
  await cdp.eval(`document.querySelector('[data-testid="dock-project-open-menu-toggle"]').click()`);

  const before = await cdp.eval(`Number(document.querySelector('[data-testid="dock-file-tree-resizer"]').getAttribute('aria-valuenow'))`);
  await cdp.eval(`(()=>{const divider=document.querySelector('[data-testid="dock-file-tree-resizer"]');divider.focus();divider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));})()`);
  await wait(cdp, `Number(document.querySelector('[data-testid="dock-file-tree-resizer"]').getAttribute('aria-valuenow')) > ${before}`);
  const resized = await cdp.eval(`Number(document.querySelector('[data-testid="dock-file-tree-resizer"]').getAttribute('aria-valuenow'))`);
  assert.equal(resized, before + 16);

  await cdp.eval(`document.querySelector('[data-testid="dock-file-tree-toggle"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="dock-resource-layout"]').classList.contains('file-tree-collapsed')`);
  await wait(cdp, `(()=>{const layout=document.querySelector('[data-testid="dock-resource-layout"]');const content=layout?.querySelector('.dock-resource-content')?.getBoundingClientRect();const whole=layout?.getBoundingClientRect();return Boolean(content && whole && Math.round(whole.right-content.right)<=1);})()`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="dock-file-tree-body"]') === window.__fieloraDockFileTreeBody`), true);
  const collapsed = await cdp.eval(`(()=>{const layout=document.querySelector('[data-testid="dock-resource-layout"]');const content=layout.querySelector('.dock-resource-content').getBoundingClientRect();const whole=layout.getBoundingClientRect();const tree=getComputedStyle(layout.querySelector('[data-testid="dock-resource-file-tree"]'));return{gap:Math.round(whole.right-content.right),treeDisplay:tree.display};})()`);
  assert.ok(collapsed.gap <= 1, JSON.stringify(collapsed));
  assert.equal(collapsed.treeDisplay, 'none');
  await screenshot(cdp, '02-resource-tree-fully-collapsed.png');
  await cdp.eval(`document.querySelector('[data-testid="dock-file-tree-toggle"]').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="dock-resource-layout"]').classList.contains('file-tree-collapsed')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="dock-file-tree-body"]') === window.__fieloraDockFileTreeBody`), true);
  assert.equal(await cdp.eval(`getComputedStyle(document.querySelector('[data-testid="dock-resource-file-tree"]')).animationName`), 'dock-file-tree-enter');
  await screenshot(cdp, '03-resource-tree-expanded.png');

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('WORKSPACE_RESOURCE_LAYOUT_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
