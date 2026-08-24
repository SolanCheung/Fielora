import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-header-icons-'));
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
  await writeFile(path.join(projectRoot, 'src', 'header.ts'), 'export const headerIcons = true;\n');

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
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Header Icon 验收',goal:'Focused header and icon verification',root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'可修改的对话标题',provider_config_id:null,model_id:null})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('.conversation-title-line h2')?.textContent === '可修改的对话标题'`);

  const titleLayout = await cdp.eval(`(()=>{const title=document.querySelector('.conversation-title-line h2').getBoundingClientRect();const menu=document.querySelector('[data-testid="conversation-menu-trigger"]').getBoundingClientRect();return{titleRight:title.right,menuLeft:menu.left,titleCenter:title.top+title.height/2,menuCenter:menu.top+menu.height/2,gap:menu.left-title.right};})()`);
  assert.ok(titleLayout.gap >= 0 && titleLayout.gap <= 8, JSON.stringify(titleLayout));
  assert.ok(Math.abs(titleLayout.titleCenter - titleLayout.menuCenter) <= 2, JSON.stringify(titleLayout));
  await cdp.eval(`document.querySelector('[data-testid="conversation-menu-trigger"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-menu-popover"]')`);
  await cdp.eval(`[...document.querySelectorAll('[data-testid="conversation-menu-popover"] button')].find((button)=>button.textContent==='重命名').click()`);
  await wait(cdp, `document.querySelector('[data-testid="rename-conversation-dialog"] input')`);
  await cdp.eval(setValue('[data-testid="rename-conversation-dialog"] input', '已更新的对话标题'));
  await cdp.eval(`document.querySelector('[data-testid="rename-conversation-dialog"] .dialog-confirm').click()`);
  await wait(cdp, `document.querySelector('.conversation-title-line h2')?.textContent === '已更新的对话标题'`);
  await screenshot(cdp, '05-conversation-title-actions.png');

  await cdp.eval(`document.querySelector('[data-testid="environment-menu-toggle"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="environment-popover"]')`);
  const environmentIcons = await cdp.eval(`(()=>{const popover=document.querySelector('[data-testid="environment-popover"]');const rows=[...popover.querySelectorAll(':scope > button')];return{review:rows.find((row)=>row.innerText.includes('变更'))?.querySelector('.shell-icon')?.dataset.icon,local:rows.find((row)=>row.innerText.includes('本地'))?.querySelector('.shell-icon')?.dataset.icon,reviewRects:rows.find((row)=>row.innerText.includes('变更'))?.querySelectorAll('rect').length};})()`);
  assert.equal(environmentIcons.review, 'diff');
  assert.equal(environmentIcons.local, 'computer');
  assert.ok(environmentIcons.reviewRects >= 1, JSON.stringify(environmentIcons));
  await screenshot(cdp, '06-environment-semantic-icons.png');
  await cdp.eval(`document.querySelector('[data-testid="environment-menu-toggle"]').click()`);

  await cdp.eval(`document.querySelector('[data-testid="project-open-menu-toggle"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="project-open-menu"]')`);
  const applicationIcons = await cdp.eval(`(()=>{const menu=document.querySelector('[data-testid="project-open-menu"]');const external=[...menu.querySelectorAll(':scope > button')].filter((button)=>button.querySelector('[data-app-icon]'));return{count:external.length,targets:external.map((button)=>button.querySelector('[data-app-icon]').dataset.appIcon),labels:external.map((button)=>button.innerText.trim()),textBadges:external.filter((button)=>button.querySelector('.workspace-app-badge')).length};})()`);
  assert.ok(applicationIcons.count >= 1, JSON.stringify(applicationIcons));
  assert.equal(applicationIcons.textBadges, 0);
  assert.ok(applicationIcons.targets.includes('FILE_EXPLORER'), JSON.stringify(applicationIcons));
  await screenshot(cdp, '07-system-application-icons.png');
  await cdp.eval(`document.querySelector('[data-testid="project-open-menu-toggle"]').click()`);

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'DIFF'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-review"]')`);
  const tabLayout = await cdp.eval(`(()=>{const tab=document.querySelector('[data-testid="right-dock-tab-review"]').closest('.right-dock-tab');const add=document.querySelector('[data-testid="right-dock-add"]');const t=tab.getBoundingClientRect();const a=add.getBoundingClientRect();const style=getComputedStyle(tab);return{tabRight:t.right,addLeft:a.left,gap:a.left-t.right,radius:style.borderRadius,background:style.backgroundColor,reviewIcon:tab.querySelector('.shell-icon').dataset.icon};})()`);
  assert.ok(tabLayout.gap >= 0 && tabLayout.gap <= 8, JSON.stringify(tabLayout));
  assert.equal(tabLayout.radius, '9px');
  assert.equal(tabLayout.reviewIcon, 'diff');
  await screenshot(cdp, '08-soft-review-tab-plus.png');

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('WORKSPACE_HEADER_ICONS_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
