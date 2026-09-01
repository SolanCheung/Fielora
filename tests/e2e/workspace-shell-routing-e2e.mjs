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
  const conversation = await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'自然对话工作面',provider_config_id:null,model_id:null})`);
  await cdp.eval(`(()=>{localStorage.setItem('fielora:workspace-navigation-width','190');localStorage.setItem('fielora:project-workspace-width','360');})()`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('.conversation-context-header')`);

  assert.equal(await cdp.eval(`document.querySelector('.conversation-tab-strip') === null && document.querySelector('[data-testid="conversation-tabs"]') === null`), true);
  assert.equal(await cdp.eval(`document.querySelectorAll('.conversation-context-header').length`), 1);
  await screenshot(cdp, '01-natural-conversation-header.png');

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-files"]') && document.querySelector('[data-testid="workspace-file"]') && document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  const managedFileIcon = await cdp.eval(`(()=>{const icon=document.querySelector('[data-testid="workspace-file"] .file-type-icon');return{hasIcon:Boolean(icon),kind:icon?.getAttribute('data-file-kind'),isSvg:icon?.tagName==='svg'};})()`);
  assert.deepEqual(managedFileIcon, { hasIcon: true, kind: 'typescript', isSvg: true });
  await cdp.eval(`document.querySelector('[data-testid="right-dock-close-files"]').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  await new Promise((resolve) => setTimeout(resolve, 320));
  const closedDock = await cdp.eval(`(()=>{const dock=document.querySelector('[data-testid="right-workspace-dock"]');const style=getComputedStyle(dock);return{opacity:style.opacity,pointerEvents:style.pointerEvents,width:dock.getBoundingClientRect().width};})()`);
  assert.deepEqual(closedDock, { opacity: '0', pointerEvents: 'none', width: 0 });

  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-home"]') && document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  const launcher = await cdp.eval(`(()=>{const buttons=[...document.querySelectorAll('[data-testid="right-dock-home"] button')];return{labels:buttons.map((button)=>button.querySelector('span')?.textContent),shortcuts:buttons.map((button)=>button.querySelector('kbd')?.textContent??null),count:buttons.length};})()`);
  assert.deepEqual(launcher.labels, ['工作对象', '审阅', 'PowerShell', '浏览器', '文件', '侧边聊天']);
  assert.deepEqual(launcher.shortcuts, [null, 'Ctrl+Shift+G', 'Ctrl+`', 'Ctrl+T', 'Ctrl+P', 'Ctrl+Alt+S']);
  assert.equal(launcher.count, 6);
  await wait(cdp, `document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect().width >= 634.5`);
  const workbenchGeometry = await cdp.eval(`(()=>{const navigation=document.querySelector('[data-testid="project-navigation"]').getBoundingClientRect();const conversation=document.querySelector('.conversation-column').getBoundingClientRect();const dock=document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect();const composer=document.querySelector('[data-testid="conversation-composer"]').getBoundingClientRect();return{navigationWidth:navigation.width,conversationWidth:conversation.width,dockWidth:dock.width,composerWidth:composer.width,composerInsideConversation:composer.left>=conversation.left&&composer.right<=conversation.right};})()`);
  assert.equal(Math.abs(workbenchGeometry.navigationWidth - 304) <= 0.5, true, JSON.stringify(workbenchGeometry));
  assert.equal(Math.abs(workbenchGeometry.dockWidth - 635) <= 0.5, true, JSON.stringify(workbenchGeometry));
  assert.equal(workbenchGeometry.conversationWidth >= 379.5, true, JSON.stringify(workbenchGeometry));
  assert.equal(workbenchGeometry.composerWidth <= 920.5, true, JSON.stringify(workbenchGeometry));
  assert.equal(workbenchGeometry.composerInsideConversation, true, JSON.stringify(workbenchGeometry));
  const launcherIcons = await cdp.eval(`(()=>{const parse=(value)=>{const match=value.match(/[\\d.]+/g);return match?.slice(0,3).map(Number)??[0,0,0]};const luminance=(rgb)=>{const values=rgb.map((value)=>{const channel=value/255;return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4});return .2126*values[0]+.7152*values[1]+.0722*values[2]};const contrast=(foreground,background)=>{const a=luminance(parse(foreground));const b=luminance(parse(background));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};const home=document.querySelector('[data-testid="right-dock-home"]');const background=getComputedStyle(home).backgroundColor;return[...home.querySelectorAll('button .app-icon')].map((icon)=>{const glyph=icon.querySelector('path,rect,circle,line,polyline,polygon');const iconStyle=getComputedStyle(icon);const glyphStyle=glyph?getComputedStyle(glyph):null;return{opacity:iconStyle.opacity,color:iconStyle.color,fill:glyphStyle?.fill??'none',stroke:glyphStyle?.stroke??'none',contrast:contrast(iconStyle.color,background)};});})()`);
  assert.equal(launcherIcons.length, 6);
  assert.equal(launcherIcons.every((icon) => icon.opacity === '1' && (icon.fill !== 'none' || icon.stroke !== 'none') && icon.contrast >= 3), true, JSON.stringify(launcherIcons));
  await new Promise((resolve) => setTimeout(resolve, 360));
  await screenshot(cdp, '02-right-workspace-launcher.png');

  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-home"]')`);
  await cdp.eval(`document.querySelector('[data-testid="right-dock-add"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tool-menu"]')`);
  await cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await wait(cdp, `!document.querySelector('[data-testid="right-dock-tool-menu"]')`);
  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);

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

  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-home"]')`);
  await cdp.eval(`document.querySelector('[data-testid="right-dock-home-terminal"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-terminal"]') && document.querySelector('[data-testid="terminal-session"]')`);
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

  await cdp.eval(`(async()=>{
    await window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(conversation.id)},role:'USER',content:'请保持现有工作区结构，只恢复与 Codex 一致的布局比例。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    await window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(conversation.id)},role:'ASSISTANT',content:${JSON.stringify('已恢复工作区比例。\n\n左侧项目导航与右侧 Workspace Dock 已回到稳定默认宽度；Conversation、文件和工具继续共享同一工作面。')},status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
  })()`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="message-user"]') && document.querySelector('[data-testid="message-assistant"]')`);
  await cdp.eval(`document.querySelector('[data-testid="chrome-tools"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-home"]')`);
  await cdp.eval(`(()=>{const list=document.querySelector('.message-list');list.scrollTop=list.scrollHeight;})()`);
  await new Promise((resolve) => setTimeout(resolve, 360));
  await screenshot(cdp, '05-active-conversation-workbench.png');

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('WORKSPACE_SHELL_ROUTING_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
