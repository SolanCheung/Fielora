import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-workspace-type-'));
const projectRoot = path.join(dataRoot, 'workspace-project');
const evidenceDir = path.join(root, 'artifacts', 'workspace-dock');
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

async function wait(cdp, expression, timeout = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await cdp.eval(`Boolean(${expression})`)) return; } catch { /* Renderer may be reloading. */ }
    await new Promise((resolve) => setTimeout(resolve, 70));
  }
  throw new Error(`wait failed: ${expression}\n${output.join('')}`);
}

async function screenshot(cdp, name, selector) {
  let clip;
  if (selector) {
    clip = await cdp.eval(`(()=>{const rect=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:rect.left,y:rect.top,width:rect.width,height:rect.height,scale:1};})()`);
  }
  const image = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
  await writeFile(path.join(evidenceDir, name), Buffer.from(image.data, 'base64'));
}

try {
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(projectRoot, 'src', 'workspace.ts'), 'export const workspaceDock = true;\nconst product = "Fielora";\n// Shared workspace motion\n');
  await writeFile(path.join(projectRoot, 'package.json'), '{"name":"workspace-typography-fixture","private":true}\n');

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
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Workspace Typography',goal:'Focused visual verification',root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'统一工作区字体',provider_config_id:null,model_id:null})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid^="conversation-tab-"]')`);

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(cdp, `[...document.querySelectorAll('[data-testid="workspace-file"]')].some((item)=>item.innerText.includes('workspace.ts'))`);
  await cdp.eval(`[...document.querySelectorAll('[data-testid="workspace-file"]')].find((item)=>item.innerText.includes('workspace.ts')).click()`);
  await wait(cdp, `document.querySelector('[data-testid="syntax-code-editor"]') && document.querySelector('.syntax-keyword')`);

  const typography = await cdp.eval(`(()=>{const context=getComputedStyle(document.querySelector('.conversation-context-path'));const breadcrumb=getComputedStyle(document.querySelector('.right-dock-breadcrumb'));const code=getComputedStyle(document.querySelector('.cm-scroller'));const colors=[...document.querySelectorAll('.syntax-keyword,.syntax-string,.syntax-literal,.syntax-comment')].map((node)=>getComputedStyle(node).color);return{contextFont:context.fontFamily,breadcrumbFont:breadcrumb.fontFamily,contextSize:context.fontSize,breadcrumbSize:breadcrumb.fontSize,codeFont:code.fontFamily,codeSize:code.fontSize,colorCount:new Set(colors).size,lineNumbers:document.querySelectorAll('.cm-lineNumbers .cm-gutterElement:not(:first-child)').length};})()`);
  assert.equal(typography.contextFont, typography.breadcrumbFont, JSON.stringify(typography));
  assert.equal(typography.contextSize, '12.5px');
  assert.equal(typography.breadcrumbSize, '12.5px');
  assert.match(typography.contextFont, /Segoe UI/);
  assert.match(typography.codeFont, /Cascadia Code|Consolas/);
  assert.equal(typography.codeSize, '13px');
  assert.ok(typography.colorCount >= 4, JSON.stringify(typography));
  assert.equal(typography.lineNumbers, 4);
  await screenshot(cdp, '12-unified-workspace-typography.png');
  await screenshot(cdp, '13-syntax-highlighted-file.png', '.right-dock-view-file:not([hidden])');

  const motionTokens = await cdp.eval(`(()=>{const style=getComputedStyle(document.documentElement);return{panel:style.getPropertyValue('--fl-motion-distance-panel').trim(),surface:style.getPropertyValue('--fl-motion-distance-surface').trim(),popover:style.getPropertyValue('--fl-motion-offset-popover').trim()};})()`);
  assert.deepEqual(motionTokens, { panel: '14px', surface: '8px', popover: '-4px' });
  await cdp.eval(`document.querySelector('[data-testid="right-dock-add"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tool-menu"]')`);
  assert.equal(await cdp.eval(`getComputedStyle(document.querySelector('[data-testid="right-dock-tool-menu"]')).animationName`), 'popover-enter');
  await cdp.eval(`document.querySelector('[data-testid="right-dock-add"]').click()`);

  const terminalTransition = await cdp.eval(`(()=>{const layer=document.querySelector('[data-testid="desktop-terminal-layer"]');return{height:layer.getBoundingClientRect().height,duration:getComputedStyle(layer).transitionDuration,button:Boolean(document.querySelector('[data-testid="rail-terminal"]'))};})()`);
  assert.equal(terminalTransition.height, 0);
  assert.equal(terminalTransition.button, true);
  assert.notEqual(terminalTransition.duration, '0s');
  await cdp.eval(`document.documentElement.dataset.reduceMotion='false'`);
  await cdp.eval(`document.querySelector('[data-testid="rail-terminal"]').click()`);
  await new Promise((resolve) => setTimeout(resolve, 70));
  const openingHeight = await cdp.eval(`document.querySelector('[data-testid="desktop-terminal-layer"]').getBoundingClientRect().height`);
  assert.ok(openingHeight > 0 && openingHeight < 250, `opening height ${openingHeight}`);
  await wait(cdp, `document.querySelector('[data-testid="bottom-terminal-dock"]')?.getAttribute('aria-hidden')==='false' && document.querySelector('[data-testid="desktop-terminal-layer"]').getBoundingClientRect().height >= 249`);
  const terminalLayout = await cdp.eval(`(()=>{const layer=document.querySelector('[data-testid="desktop-terminal-layer"]').getBoundingClientRect();const conversation=document.querySelector('.conversation-column').getBoundingClientRect();const dock=document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect();const panel=document.querySelector('[data-testid="bottom-terminal-dock"]').getBoundingClientRect();return{layerLeft:Math.round(layer.left),layerRight:Math.round(layer.right),conversationLeft:Math.round(conversation.left),dockRight:Math.round(dock.right),conversationBottom:Math.round(conversation.bottom),dockBottom:Math.round(dock.bottom),panelTop:Math.round(panel.top)};})()`);
  assert.ok(Math.abs(terminalLayout.layerLeft - terminalLayout.conversationLeft) <= 1, JSON.stringify(terminalLayout));
  assert.ok(Math.abs(terminalLayout.layerRight - terminalLayout.dockRight) <= 1, JSON.stringify(terminalLayout));
  assert.ok(Math.abs(terminalLayout.conversationBottom - terminalLayout.panelTop) <= 5, JSON.stringify(terminalLayout));
  assert.ok(Math.abs(terminalLayout.dockBottom - terminalLayout.panelTop) <= 5, JSON.stringify(terminalLayout));
  await screenshot(cdp, '14-bottom-terminal.png');

  await cdp.eval(`document.querySelector('[data-testid="rail-terminal"]').click()`);
  await new Promise((resolve) => setTimeout(resolve, 70));
  const closingHeight = await cdp.eval(`document.querySelector('[data-testid="desktop-terminal-layer"]').getBoundingClientRect().height`);
  assert.ok(closingHeight > 0 && closingHeight < 250, `closing height ${closingHeight}`);
  await wait(cdp, `document.querySelector('[data-testid="desktop-terminal-layer"]').getBoundingClientRect().height === 0`);

  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('WORKSPACE_TYPOGRAPHY_TERMINAL_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
