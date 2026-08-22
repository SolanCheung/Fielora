import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-appearance-'));
const evidence = path.join(root, 'artifacts', 'appearance');
let child;
let port;
const output = [];

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); }
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
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Electron target timeout\n${output.join('')}`);
}

async function wait(cdp, expression, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await cdp.eval(`Boolean(${expression})`)) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`wait failed: ${expression}\n${output.join('')}`);
}

function setValue(selector, value) {
  return `(()=>{const element=document.querySelector(${JSON.stringify(selector)});const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value');descriptor.set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));})()`;
}

async function screenshot(cdp, name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(evidence, name), Buffer.from(shot.data, 'base64'));
}

try {
  await mkdir(evidence, { recursive: true });
  port = await freePort();
  const env = { ...process.env, APPDATA: path.join(dataRoot, 'roaming'), LOCALAPPDATA: dataRoot, FIELORA_E2E: '1', FIELORA_E2E_DEBUG_PORT: String(port) };
  child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @fielora/desktop start'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  const cdp = await connect();
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`);
  assert.equal(await cdp.eval(`Boolean(document.documentElement.dataset.resolvedTheme)`), true);

  await cdp.eval(`document.querySelector('[data-testid="settings-nav"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-screen"]')`);
  assert.equal(await cdp.eval(`Boolean(document.querySelector('[data-testid="settings-category-appearance"]'))`), true);
  await cdp.eval(`document.querySelector('[data-testid="settings-category-appearance"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-appearance"]')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('.theme-preview-card').length`), 3);
  await screenshot(cdp, 'appearance-system.png');

  const lightColors = await cdp.eval(`(()=>{document.querySelector('[data-testid="appearance-theme-light"]').click();const content=getComputedStyle(document.querySelector('.settings-content'));const navigation=getComputedStyle(document.querySelector('.settings-navigation'));return{content:content.backgroundColor,navigation:navigation.backgroundColor};})()`);
  await wait(cdp, `document.documentElement.dataset.resolvedTheme==='light'`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="appearance-theme-light"]').getAttribute('aria-pressed')`), 'true');

  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-dark"]').click()`);
  await wait(cdp, `document.documentElement.dataset.resolvedTheme==='dark'`);
  const darkColors = await cdp.eval(`(()=>{const content=getComputedStyle(document.querySelector('.settings-content'));const navigation=getComputedStyle(document.querySelector('.settings-navigation'));return{content:content.backgroundColor,navigation:navigation.backgroundColor,card:getComputedStyle(document.querySelector('.appearance-card')).backgroundColor,color:getComputedStyle(document.body).color};})()`);
  assert.notDeepEqual(darkColors.content, lightColors.content);
  assert.notDeepEqual(darkColors.navigation, lightColors.navigation);
  assert.match(darkColors.content, /^rgb\((?:1[0-9]|2[0-9]|3[0-9]),/);
  await screenshot(cdp, 'appearance-dark.png');

  await cdp.eval(`[...document.querySelectorAll('.accent-options button')].find((item)=>item.title==='蓝色').click()`);
  await wait(cdp, `getComputedStyle(document.documentElement).getPropertyValue('--fl-color-accent').trim().toUpperCase()==='#326BCB'`);
  await cdp.eval(`[...document.querySelectorAll('[role="radiogroup"][aria-label="界面密度"] button')].find((item)=>item.textContent==='紧凑').click()`);
  await wait(cdp, `document.documentElement.dataset.uiDensity==='compact'`);
  await cdp.eval(`[...document.querySelectorAll('[role="radiogroup"][aria-label="界面圆角"] button')].find((item)=>item.textContent==='大').click()`);
  await wait(cdp, `document.documentElement.dataset.uiRadius==='large'`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-translucent-sidebar"]').click()`);
  await wait(cdp, `document.documentElement.dataset.translucentSidebar==='true'`);
  assert.match(await cdp.eval(`getComputedStyle(document.querySelector('.settings-navigation')).backdropFilter`), /blur/);

  await cdp.eval(`document.querySelector('[data-testid="appearance-reduced-motion"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-reduced-motion-option-REDUCE"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reduced-motion-option-REDUCE"]').click()`);
  await wait(cdp, `document.documentElement.dataset.reduceMotion==='true'`);
  const persisted = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2'))`);
  assert.equal(persisted.appearance.themePreference, 'DARK');
  assert.equal(persisted.appearance.accentPreset, 'BLUE');
  assert.equal(persisted.appearance.density, 'COMPACT');
  assert.equal(persisted.appearance.radius, 'LARGE');

  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`);
  assert.equal(await cdp.eval(`document.documentElement.dataset.resolvedTheme`), 'dark');
  assert.equal(await cdp.eval(`document.documentElement.dataset.uiDensity`), 'compact');

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-settings',{detail:'APPEARANCE'}))`);
  await wait(cdp, `document.querySelector('[data-testid="settings-appearance"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-system"]').click()`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await wait(cdp, `document.documentElement.dataset.resolvedTheme==='light'`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await wait(cdp, `document.documentElement.dataset.resolvedTheme==='dark'`);
  assert.equal(await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2')).appearance.themePreference`), 'SYSTEM');

  await cdp.eval(`document.querySelector('[data-testid="appearance-import-theme"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-import-dialog"]')`);
  await cdp.eval(setValue('[data-testid="appearance-import-dialog"] textarea', '{"version":1,"executable":"alert(1)"}'));
  await cdp.eval(`document.querySelector('[data-testid="appearance-import-dialog"] .dialog-confirm').click()`);
  await wait(cdp, `document.body.innerText.includes('主题格式无效')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-import-dialog"] [aria-label="关闭"]').click()`);

  await cdp.eval(`document.querySelector('[data-testid="settings-category-general"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-general"]')`);
  await cdp.eval(`document.querySelector('[data-testid="startup-destination"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="startup-destination-option-NOW"]')`);
  await cdp.eval(`document.querySelector('[data-testid="startup-destination-option-NOW"]').click()`);
  await cdp.eval(`document.querySelector('[data-testid="settings-category-appearance"]').click()`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reset"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-reset-dialog"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reset-dialog"] .dialog-danger').click()`);
  await wait(cdp, `document.documentElement.dataset.themePreference==='system'&&document.documentElement.dataset.uiDensity==='standard'`);
  const reset = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2'))`);
  assert.equal(reset.startupDestination, 'NOW');
  assert.equal(reset.appearance.accentPreset, 'FIELORA');
  assert.equal(reset.appearance.advancedColorOverrides && Object.keys(reset.appearance.advancedColorOverrides).length, 0);

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await new Promise((resolve) => child.once('exit', resolve));
  console.log('appearance settings e2e: PASS');
} finally {
  if (child?.exitCode === null) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
}
