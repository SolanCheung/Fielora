import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-permission-icons-'));
const projectRoot = path.join(dataRoot, 'sample-project');
const evidenceDir = path.join(root, 'artifacts', 'agent-turn-production');
const runtimeNode = process.execPath;
const forgeEntry = path.join(root, 'apps', 'desktop', 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const packagedApp = process.env.FIELORA_PACKAGED_APP ?? '';
const output = [];
let child;
let port;

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
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
    } catch { /* Electron is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Electron target timeout\n${output.join('')}`);
}

async function wait(cdp, expression, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await cdp.eval(`Boolean(${expression})`)) return; } catch { /* Renderer may be reloading. */ }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`wait failed: ${expression}\n${output.join('')}`);
}

try {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(projectRoot, 'README.md'), '# Permission icon fixture\n');
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
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Permission Icon Fixture',goal:'Verify narrow composer permission control',root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="project-new-conversation-${project.field_id}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="project-new-conversation-${project.field_id}"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-composer"]')`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 720, deviceScaleFactor: 1, mobile: false });
  await wait(cdp, `document.querySelector('.conversation-column').getBoundingClientRect().width <= 560`);

  const narrow = await cdp.eval(`(() => {
    const root = document.querySelector('.permission-picker');
    const trigger = document.querySelector('[data-testid="composer-permission"]');
    return {
      width: root.getBoundingClientRect().width,
      labelDisplay: getComputedStyle(trigger.querySelector('.ui-select-value')).display,
      hasChevron: Boolean(trigger.querySelector('.ui-chevron')),
      permissionIcon: trigger.querySelector('[data-permission-icon]')?.dataset.permissionIcon,
    };
  })()`);
  assert.equal(narrow.width, 34);
  assert.equal(narrow.labelDisplay, 'none');
  assert.equal(narrow.hasChevron, false);
  assert.equal(narrow.permissionIcon, 'REVIEW_CHANGES');

  await cdp.eval(`document.querySelector('[data-testid="composer-permission"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="composer-permission-menu"]')`);
  assert.deepEqual(await cdp.eval(`[...document.querySelectorAll('[data-testid^="composer-permission-option-"] [data-permission-icon]')].map((icon) => icon.dataset.permissionIcon)`), ['READ_ONLY', 'REVIEW_CHANGES', 'FULL_CONTROL']);
  const typography = await cdp.eval(`(() => {
    const trigger = document.querySelector('[data-testid="composer-permission"]');
    const regular = document.querySelector('[data-testid="composer-permission-option-READ_ONLY"]');
    const warning = document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]');
    const triggerStyle = getComputedStyle(trigger);
    const titleStyle = getComputedStyle(regular.querySelector('strong'));
    const detailStyle = getComputedStyle(regular.querySelector('small'));
    const warningStyle = getComputedStyle(warning.querySelector('strong'));
    const probe = document.createElement('span');
    probe.style.color = 'var(--fl-color-permission-warning)';
    document.body.append(probe);
    const expectedWarning = getComputedStyle(probe).color;
    probe.remove();
    return {
      triggerSize: triggerStyle.fontSize,
      triggerWeight: triggerStyle.fontWeight,
      titleSize: titleStyle.fontSize,
      titleWeight: titleStyle.fontWeight,
      detailSize: detailStyle.fontSize,
      detailWeight: detailStyle.fontWeight,
      titleColor: titleStyle.color,
      detailColor: detailStyle.color,
      warningColor: warningStyle.color,
      expectedWarning,
    };
  })()`);
  assert.equal(typography.triggerSize, '14px');
  assert.equal(typography.triggerWeight, '500');
  assert.equal(typography.titleSize, '15px');
  assert.equal(typography.titleWeight, '500');
  assert.equal(typography.detailSize, '13.5px');
  assert.equal(typography.detailWeight, '400');
  assert.notEqual(typography.titleColor, typography.detailColor);
  assert.equal(typography.warningColor, typography.expectedWarning);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="composer-permission"] [data-permission-icon="FULL_CONTROL"]')`);
  await new Promise((resolve) => setTimeout(resolve, 220));

  const warning = await cdp.eval(`(() => {
    const trigger = document.querySelector('[data-testid="composer-permission"]');
    const root = trigger.closest('.permission-picker');
    const icon = trigger.querySelector('.permission-icon');
    const probe = document.createElement('span');
    probe.style.color = 'var(--fl-color-permission-warning)';
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { icon: getComputedStyle(icon).stroke, expected, value: root.dataset.value };
  })()`);
  assert.equal(warning.value, 'FULL_CONTROL');
  assert.equal(warning.icon, warning.expected);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="composer-permission-menu"]')`);
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(evidenceDir, 'permission-icons-narrow.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('COMPOSER_PERMISSION_ICONS_E2E: PASS');

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
