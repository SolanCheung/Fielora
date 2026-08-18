import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const mode = process.argv[2] ?? 'dev';
const packaged = mode === 'packaged' || mode === 'portable';
const appPath = process.env.FIELORA_PACKAGED_APP ?? path.join(root, 'apps', 'desktop', 'out', 'Fielora-win32-x64', 'Fielora.exe');
let port = 9400 + Math.floor(Math.random() * 300);
const localAppData = await mkdtemp(path.join(tmpdir(), `fielora-${mode}-e2e-`));
const evidenceDir = path.join(root, 'artifacts', 'phase01');
const title = packaged ? 'Fielora / Build V0.1' : 'Phase 01 Test';
const focus = packaged ? 'Architecture' : 'Persistence';
const output = [];
const ownedCorePids = new Set();
let launched;

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }
  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) { this.events.push(message); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

function launch() {
  port += 1;
  const env = { ...process.env, LOCALAPPDATA: localAppData, FIELORA_E2E: '1', ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' };
  const child = packaged
    ? spawn(appPath, [`--remote-debugging-port=${port}`], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `pnpm --filter @fielora/desktop start -- --remote-debugging-port=${port}`], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  return child;
}

async function waitForTarget(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find((item) => item.type === 'page' && (item.url.startsWith('fielora://app') || item.url.includes('main_window')));
      if (target) return target;
    } catch { /* Electron is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Electron target did not appear.\n${output.join('')}`);
}

async function connect() {
  const target = await waitForTarget();
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  return cdp;
}

async function waitExpression(cdp, expression, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if (await cdp.evaluate(`Boolean(${expression})`)) return; }
    catch { /* Renderer may be reloading. */ }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  let diagnostics = {};
  try {
    diagnostics = await cdp.evaluate(`(async () => ({ href: location.href, html: document.body?.innerHTML, hasBridge: typeof window.fielora !== 'undefined', health: typeof window.fielora !== 'undefined' ? await window.fielora.core.getHealth() : null, scripts: [...document.scripts].map((script) => script.src), resources: performance.getEntriesByType('resource').map((entry) => entry.name) }))()`);
  } catch (error) { diagnostics = { diagnosticError: String(error) }; }
  throw new Error(`Timed out waiting for: ${expression}\nDiagnostics: ${JSON.stringify(diagnostics)}\nCDP events: ${JSON.stringify(cdp.events.slice(-30))}\nProcess output:\n${output.join('')}`);
}

function setValue(selector, value) {
  return `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;
}

function click(selector) {
  return `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`;
}

async function waitExit(child, timeoutMs = 8_000) {
  if (child.exitCode !== null) return child.exitCode;
  return Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Electron did not exit')), timeoutMs)),
  ]);
}

async function createAndResume(cdp) {
  await waitExpression(cdp, `document.querySelector('[data-testid="project-workspace"]')`);
  await cdp.evaluate(click('[data-testid="now-nav"]'));
  await waitExpression(cdp, `document.querySelector('[data-testid="now-screen"]')`);
  ownedCorePids.add((await cdp.evaluate('window.fielora.core.getHealth()')).pid);
  await cdp.evaluate(setValue('[data-testid="create-title"]', title));
  await cdp.evaluate(setValue('[data-testid="create-goal"]', 'Ship a runnable Fielora V0.1'));
  await cdp.evaluate(click('[data-testid="create-field"]'));
  await waitExpression(cdp, `document.querySelector(${JSON.stringify(`[data-testid="field-${title}"]`)})`);
  await cdp.evaluate(click(`[data-testid="field-${title}"]`));
  await waitExpression(cdp, `document.querySelector('[data-testid="field-screen"]')`);
  await cdp.evaluate(setValue('[data-testid="focus-input"]', focus));
  await cdp.evaluate(click('[data-testid="save-focus"]'));
  await waitExpression(cdp, `document.querySelector('[data-testid="current-focus"]')?.textContent === ${JSON.stringify(focus)}`);
}

async function assertResume(cdp) {
  await waitExpression(cdp, `document.querySelector('[data-testid="project-workspace"]')`);
  await cdp.evaluate(click('[data-testid="now-nav"]'));
  await waitExpression(cdp, `document.querySelector('[data-testid="now-screen"]')`);
  const field = await cdp.evaluate(`window.fielora.field.list().then((fields) => fields.find((field) => field.title === ${JSON.stringify(title)}))`);
  assert.equal(field.current_focus, focus);
  const resume = await cdp.evaluate(`window.fielora.surface.latestSnapshot({ field_id: ${JSON.stringify(field.id)} })`);
  assert.equal(resume.field.current_focus, focus);
  assert.equal(resume.snapshot.observed_field_revision, resume.field.revision);
  assert.equal(await cdp.evaluate(click(`[data-testid="field-${title}"]`)), true);
  await waitExpression(cdp, `document.querySelector('[data-testid="current-focus"]')?.textContent === ${JSON.stringify(focus)}`);
}

try {
  launched = launch();
  let cdp = await connect();
  await createAndResume(cdp);
  const origin = await cdp.evaluate('location.origin');
  if (packaged) assert.equal(origin, 'fielora://app');
  else {
    const parsedOrigin = new URL(origin);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname));
    assert.ok(parsedOrigin.port);
  }
  assert.equal(await cdp.evaluate(`typeof process === 'undefined' && typeof require === 'undefined'`), true);
  assert.equal(await cdp.evaluate(`new Promise((resolve) => { const frame = document.createElement('iframe'); frame.src = location.href; frame.onload = async () => { try { if (!frame.contentWindow.fielora) return resolve(true); await frame.contentWindow.fielora.core.getHealth(); resolve(false); } catch { resolve(true); } finally { frame.remove(); } }; document.body.append(frame); })`), true);
  const beforeNavigation = await cdp.evaluate('location.href');
  await cdp.evaluate(`void (location.href = 'https://example.com/')`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await cdp.evaluate('location.href'), beforeNavigation);
  await cdp.evaluate('void window.fielora.core.quit()', false);
  cdp.close();
  assert.equal(await waitExit(launched), 0);

  launched = launch();
  cdp = await connect();
  await assertResume(cdp);
  const health = await cdp.evaluate('window.fielora.core.getHealth()');
  ownedCorePids.add(health.pid);
  assert.equal(health.state, 'READY');
  assert.equal(health.schema_version, 1);
  assert.ok(health.db_path.startsWith(path.join(localAppData, 'Fielora', 'data')));
  if (packaged) {
    const processPath = spawnSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${health.pid}).Path`], { encoding: 'utf8' }).stdout.trim();
    assert.equal(path.normalize(processPath), path.join(path.dirname(appPath), 'resources', 'fielora-core.exe'));
  }

  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, `${mode}-resume.png`), Buffer.from(screenshot.data, 'base64'));

  await cdp.evaluate('window.fieloraTest.killCore()');
  await waitExpression(cdp, `document.querySelector('[data-testid="startup-screen"]')`, 5_000);
  await waitExpression(cdp, `document.querySelector('[data-testid="field-screen"]')`, 10_000);
  const afterCrash = await cdp.evaluate('window.fielora.core.getHealth()');
  ownedCorePids.add(afterCrash.pid);
  assert.equal(afterCrash.state, 'READY');
  assert.equal((await cdp.evaluate(`window.fielora.field.list()`)).find((field) => field.title === title).current_focus, focus);

  if (packaged) {
    const acceptanceName = mode === 'portable' ? 'PORTABLE_ACCEPTANCE.json' : 'PACKAGED_ACCEPTANCE.json';
    await writeFile(path.join(evidenceDir, acceptanceName), `${JSON.stringify({
      status: 'PASS',
      application: appPath,
      trusted_origin: origin,
      core_path: path.join(path.dirname(appPath), 'resources', 'fielora-core.exe'),
      database_path: health.db_path,
      field: title,
      focus,
      schema_version: health.schema_version,
      checks: ['secure_renderer', 'subframe_bridge_denied', 'external_navigation_denied', 'create', 'focus_update', 'graceful_close', 'packaged_restart_resume', 'core_crash_restart_requery'],
      captured_at: new Date().toISOString(),
    }, null, 2)}\n`);
  }
  await cdp.evaluate('void window.fielora.core.quit()', false);
  cdp.close();
  assert.equal(await waitExit(launched), 0);
  console.log(`Desktop E2E (${mode}): PASS`);
} finally {
  for (const corePid of ownedCorePids) {
    try { process.kill(corePid, 'SIGKILL'); } catch { /* The owned Core already exited. */ }
  }
  if (launched && launched.exitCode === null) {
    spawnSync('taskkill.exe', ['/PID', String(launched.pid), '/T', '/F'], { windowsHide: true });
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  try { await rm(localAppData, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
  catch (cleanupError) { console.warn(`E2E cleanup warning: ${cleanupError}`); }
}
