import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-visual-golden-'));
const projectRoot = path.join(dataRoot, 'project');
const evidenceDir = path.join(root, 'artifacts', 'visual-golden-calibration');
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
  await writeFile(path.join(projectRoot, 'README.md'), '# Visual Golden\n\nFielora 使用统一的视觉参数保持安静、紧凑且精确的桌面工作体验。\n');
  await writeFile(path.join(projectRoot, 'src', 'golden.ts'), 'export const visualGolden = true;\n');

  port = await freePort();
  const env = { ...process.env, Path: `${path.dirname(runtimeNode)};${process.env.Path ?? process.env.PATH ?? ''}`, APPDATA: path.join(dataRoot, 'roaming'), LOCALAPPDATA: dataRoot, FIELORA_E2E: '1', FIELORA_E2E_DEBUG_PORT: String(port), ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' };
  child = packagedApp
    ? spawn(packagedApp, [], { cwd: path.dirname(packagedApp), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(runtimeNode, [forgeEntry, 'start'], { cwd: path.join(root, 'apps', 'desktop'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  const cdp = await connect();
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]') && window.fieloraTest`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 816, deviceScaleFactor: 1, mobile: false });
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Visual Golden',goal:'Visual parameter calibration',root_path:${JSON.stringify(projectRoot)}})`);
  const conversation = await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'视觉校准工作面',provider_config_id:null,model_id:null})`);
  await cdp.eval(`(async()=>{
    await window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(conversation.id)},role:'USER',content:'校准当前工作区的字体、图标、密度与间距，不改变结构和功能。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    await window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(conversation.id)},role:'ASSISTANT',content:'已按现有结构检查视觉参数。普通信息保持安静且清晰，品牌紫只用于活动指示与焦点。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    await window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(conversation.id)},role:'USER',content:'继续保持 Sidebar、Composer 和 Workspace 的对齐与信息密度。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
  })()`);
  await cdp.eval(`(()=>{localStorage.removeItem('fielora:workspace-navigation-width');localStorage.removeItem('fielora:project-workspace-width');localStorage.removeItem('fielora:settings-navigation-width');})()`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-composer"]') && document.querySelector('[data-testid="message-assistant"]')`);
  await cdp.eval(`(()=>{const list=document.querySelector('.message-list');list.scrollTop=list.scrollHeight;})()`);
  await new Promise((resolve) => setTimeout(resolve, 280));

  const metrics = await cdp.eval(`(()=>{
    const rect=(selector)=>{const element=document.querySelector(selector);if(!element)return null;const value=element.getBoundingClientRect();return{x:value.x,y:value.y,width:value.width,height:value.height,right:value.right,bottom:value.bottom}};
    const style=(selector)=>{const element=document.querySelector(selector);if(!element)return null;const value=getComputedStyle(element);return{fontFamily:value.fontFamily,fontSize:value.fontSize,fontWeight:value.fontWeight,lineHeight:value.lineHeight,letterSpacing:value.letterSpacing,color:value.color,backgroundColor:value.backgroundColor,borderColor:value.borderColor,borderRadius:value.borderRadius,boxShadow:value.boxShadow,opacity:value.opacity}};
    const navigation=document.querySelector('[data-testid="project-navigation"]');
    const selected=document.querySelector('.conversation-item.active');
    const composer=document.querySelector('[data-testid="conversation-composer"]');
    const messageList=document.querySelector('.message-list');
    return{
      viewport:{width:innerWidth,height:innerHeight},
      sidebar:rect('[data-testid="project-navigation"]'),
      topChrome:rect('[data-testid="desktop-chrome"]'),
      navigationRow:rect('[data-testid="now-nav"]'),
      conversationRow:rect('.conversation-item.active'),
      iconGlyph:rect('[data-testid="now-nav"] .app-icon'),
      iconStyle:style('[data-testid="now-nav"] .app-icon'),
      navigationText:style('[data-testid="now-nav"] span'),
      metaText:style('.conversation-header small'),
      titleText:style('.conversation-header h2'),
      bodyText:style('[data-testid="message-assistant"] .message-content'),
      composer:rect('[data-testid="conversation-composer"]'),
      composerStyle:style('[data-testid="conversation-composer"]'),
      composerTextarea:rect('[data-testid="conversation-composer"] textarea'),
      composerBottomOffset:innerHeight-composer.getBoundingClientRect().bottom,
      toolbarButton:rect('[data-testid="project-open-default"]'),
      selectionStyle:style('.conversation-item.active'),
      dividerStyle:style('[data-testid="project-navigation-resizer"] span'),
      readableWidth:messageList.getBoundingClientRect().width,
      navigationBackground:getComputedStyle(navigation).backgroundColor,
      selectedBackground:getComputedStyle(selected).backgroundColor,
      horizontalOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
    };
  })()`);
  console.log(`FIELORA_GOLDEN_METRICS: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.viewport.width, 1600);
  assert.equal(metrics.viewport.height, 816);
  assert.equal(metrics.sidebar.width, 304);
  assert.equal(metrics.topChrome.height, 44);
  assert.equal(metrics.navigationRow.height, 38);
  assert.equal(metrics.conversationRow.height, 36);
  assert.equal(metrics.iconGlyph.width, 16);
  assert.equal(metrics.navigationText.fontSize, '14px');
  assert.equal(metrics.metaText.fontSize, '13px');
  assert.equal(metrics.titleText.fontSize, '17px');
  assert.equal(metrics.titleText.fontWeight, '600');
  assert.equal(metrics.bodyText.fontSize, '15px');
  assert.equal(metrics.composer.width, 920);
  assert.equal(Math.round(metrics.composer.height), 108);
  assert.equal(Math.round(metrics.composerBottomOffset), 12);
  assert.equal(metrics.toolbarButton.width, 34);
  assert.equal(metrics.toolbarButton.height, 30);
  assert.equal(metrics.horizontalOverflow, 0);
  await screenshot(cdp, '01-sidebar-conversation.png');

  await cdp.eval(setValue('[data-testid="conversation-composer"] textarea', '继续只校准可量化的视觉参数：字体层级、图标灰度、选中状态、控件体积与间距节奏。'));
  await new Promise((resolve) => setTimeout(resolve, 180));
  await screenshot(cdp, '02-conversation-composer.png');
  await cdp.eval(setValue('[data-testid="conversation-composer"] textarea', ''));

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-files"]') && document.querySelector('[data-testid="workspace-file"]')`);
  await cdp.eval(`document.querySelector('[data-testid="workspace-file"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="markdown-preview"]') || document.querySelector('[data-testid="file-editor"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`), true);
  assert.equal(await cdp.eval(`document.documentElement.scrollWidth === document.documentElement.clientWidth`), true);
  const workspaceMetrics = await cdp.eval(`(()=>{
    const value=(selector)=>{const bounds=document.querySelector(selector).getBoundingClientRect();return{width:bounds.width,left:bounds.left,right:bounds.right}};
    return{conversation:value('.conversation-column'),dock:value('[data-testid="right-workspace-dock"]'),composer:value('[data-testid="conversation-composer"]')};
  })()`);
  console.log(`FIELORA_WORKSPACE_GOLDEN_METRICS: ${JSON.stringify(workspaceMetrics)}`);
  assert.equal(workspaceMetrics.dock.width, 635);
  assert.equal(Math.round(workspaceMetrics.conversation.width), 653);
  assert.equal(Math.round(workspaceMetrics.composer.width), 613);
  await new Promise((resolve) => setTimeout(resolve, 220));
  await screenshot(cdp, '03-workspace-open.png');

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-settings',{detail:'APPEARANCE'}))`);
  await wait(cdp, `document.querySelector('[data-testid="settings-appearance"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="settings-screen"]') !== null`), true);
  assert.equal(await cdp.eval(`document.documentElement.scrollWidth === document.documentElement.clientWidth`), true);
  await new Promise((resolve) => setTimeout(resolve, 220));
  await screenshot(cdp, '04-settings.png');

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('VISUAL_GOLDEN_CALIBRATION_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
