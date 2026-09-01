import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-managed-tooltip-'));
const projectRoot = path.join(dataRoot, 'project');
const evidenceDir = path.join(root, 'artifacts', 'visual-golden-calibration');
const packagedApp = process.env.FIELORA_PACKAGED_APP;
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
      if (target) {
        const cdp = new Cdp(target.webSocketDebuggerUrl);
        await cdp.open();
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        return cdp;
      }
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

try {
  assert.ok(packagedApp, 'FIELORA_PACKAGED_APP is required');
  await mkdir(projectRoot, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(projectRoot, 'README.md'), '# Tooltip check\n');
  port = await freePort();
  const env = {
    ...process.env,
    APPDATA: path.join(dataRoot, 'roaming'),
    LOCALAPPDATA: dataRoot,
    FIELORA_E2E: '1',
    FIELORA_E2E_DEBUG_PORT: String(port),
  };
  child = spawn(packagedApp, [], { cwd: path.dirname(packagedApp), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  const cdp = await connect();
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]') && window.fieloraTest`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 816, deviceScaleFactor: 1, mobile: false });
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Tooltip Project',goal:'Targeted tooltip verification',root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'Tooltip verification',provider_config_id:null,model_id:null})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="chrome-tools"]') && document.querySelector('[data-testid="conversation-composer"]')`);

  const anchor = await cdp.eval(`(()=>{const value=document.querySelector('[data-testid="chrome-tools"]').getBoundingClientRect();return{x:value.x,y:value.y,width:value.width,height:value.height}})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 });
  await wait(cdp, `document.querySelector('[data-testid="ui-tooltip"]')`);
  const metrics = await cdp.eval(`(()=>{
    const anchor=document.querySelector('[data-testid="chrome-tools"]');
    const tooltip=document.querySelector('[data-testid="ui-tooltip"]');
    const anchorBounds=anchor.getBoundingClientRect();
    const tooltipBounds=tooltip.getBoundingClientRect();
    const tooltipStyle=getComputedStyle(tooltip);
    const chrome=document.querySelector('[data-testid="desktop-chrome"]').getBoundingClientRect();
    const composer=document.querySelector('[data-testid="conversation-composer"]').getBoundingClientRect();
    return{
      text:tooltip.textContent,
      nativeTitle:anchor.getAttribute('title'),
      background:tooltipStyle.backgroundColor,
      color:tooltipStyle.color,
      tooltipTop:tooltipBounds.top,
      tooltipBottom:tooltipBounds.bottom,
      anchorTop:anchorBounds.top,
      chromeBottom:chrome.bottom,
      viewportHeight:innerHeight,
      composerWidth:composer.width,
      composerBottomOffset:innerHeight-composer.bottom,
      horizontalOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
    };
  })()`);
  assert.equal(metrics.text, '展开右侧工具区');
  assert.equal(metrics.nativeTitle, null);
  assert.equal(metrics.background, 'rgb(32, 33, 36)');
  assert.equal(metrics.color, 'rgb(255, 255, 255)');
  assert.ok(metrics.tooltipTop >= metrics.chromeBottom + 7, 'tooltip must stay below the native window chrome');
  assert.ok(metrics.tooltipBottom <= metrics.viewportHeight - 8, 'tooltip must remain inside the visible viewport');
  assert.equal(metrics.composerWidth, 920);
  assert.equal(Math.round(metrics.composerBottomOffset), 12);
  assert.equal(metrics.horizontalOverflow, 0);
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(evidenceDir, '05-managed-tooltip-empty.png'), Buffer.from(image.data, 'base64'));
  console.log(`MANAGED_TOOLTIP_METRICS: ${JSON.stringify(metrics)}`);
  console.log('MANAGED_TOOLTIP_E2E: PASS');

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
