import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-content-viewers-'));
const projectRoot = path.join(dataRoot, 'project');
const evidenceDir = path.join(root, 'artifacts', 'workspace-content-viewers');
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
  const longToken = 'responsive_content_'.repeat(34);
  await writeFile(path.join(projectRoot, 'README.md'), `# 自适应 Markdown\n\n正文应该跟随右侧展示宽度自动换行。\n\n${longToken}\n\n\`\`\`ts\nexport const markdownPreviewHasNoHorizontalScrollbar = '${longToken}';\n\`\`\`\n\n| 文件 | 说明 |\n| --- | --- |\n| README.md | ${longToken} |\n`);
  await writeFile(path.join(projectRoot, 'src', 'responsive.ts'), `export const responsiveSource = '${longToken}';\n`);
  await writeFile(path.join(projectRoot, 'preview.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nfsAAAAASUVORK5CYII=', 'base64'));

  port = await freePort();
  const env = { ...process.env, Path: `${path.dirname(runtimeNode)};${process.env.Path ?? process.env.PATH ?? ''}`, APPDATA: path.join(dataRoot, 'roaming'), LOCALAPPDATA: dataRoot, FIELORA_E2E: '1', FIELORA_E2E_DEBUG_PORT: String(port), ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' };
  child = packagedApp
    ? spawn(packagedApp, [], { cwd: path.dirname(packagedApp), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(runtimeNode, [forgeEntry, 'start'], { cwd: path.join(root, 'apps', 'desktop'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  const cdp = await connect();
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]') && window.fieloraTest`);
  await wait(cdp, `window.fielora.project.list().then(()=>true).catch(()=>false)`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Viewer 定向验收',goal:'Focused viewer verification',root_path:${JSON.stringify(projectRoot)}})`);
  const conversation = await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'Viewer 与项目层级',provider_config_id:null,model_id:null})`);
  await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(conversation.id)},role:'USER',content:'验证 Workspace Viewer。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null})`);
  await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(conversation.id)},role:'ASSISTANT',content:'只验证本轮相关界面。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null})`);
  await wait(cdp, `window.fielora.project.list().then((items)=>items.some((item)=>item.field_id===${JSON.stringify(project.field_id)})).catch(()=>false)`);
  await cdp.eval(`document.querySelector('[data-testid="now-nav"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="now-screen"]')`);
  await cdp.eval(`document.querySelector('[data-testid="projects-nav"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid^="project-row-"]')`);
  await wait(cdp, `document.querySelector('[data-testid^="project-conversations-"]') && document.querySelector('.conversation-composer')`);

  const projectState = await cdp.eval(`(()=>{const row=document.querySelector('[data-testid^="project-row-"]');const button=row.querySelector('.project-item');return{label:button.innerText.trim(),title:button.title,expanded:button.getAttribute('aria-expanded'),conversation:Boolean(document.querySelector('[data-testid^="project-conversations-"]')),active:row.classList.contains('active')};})()`);
  assert.equal(projectState.label.includes(projectRoot), false, JSON.stringify(projectState));
  assert.equal(projectState.title, projectRoot);
  assert.equal(projectState.expanded, 'true');
  assert.equal(projectState.conversation, true);
  await cdp.eval(`document.querySelector('[data-testid^="project-row-"] .project-item').click()`);
  await wait(cdp, `!document.querySelector('[data-testid^="project-conversations-"]')`);
  const collapsed = await cdp.eval(`(()=>{const row=document.querySelector('[data-testid^="project-row-"]');return{expanded:row.querySelector('.project-item').getAttribute('aria-expanded'),active:row.classList.contains('active'),conversationTitle:document.querySelector('.conversation-header h2')?.textContent};})()`);
  assert.deepEqual(collapsed, { expanded: 'false', active: true, conversationTitle: 'Viewer 与项目层级' });
  await cdp.eval(`document.querySelector('[data-testid^="project-row-"] .project-item').click()`);
  await wait(cdp, `document.querySelector('[data-testid^="project-conversations-"]')`);
  const navLabels = await cdp.eval(`[...document.querySelectorAll('.project-global-nav span')].map((item)=>item.textContent)`);
  assert.deepEqual(navLabels, ['现在', '浏览器', '空间', '收件箱']);

  const conversationLayout = await cdp.eval(`(()=>{const pane=document.querySelector('.conversation-column').getBoundingClientRect();const list=document.querySelector('.message-list');const listRect=list.getBoundingClientRect();const composer=document.querySelector('.conversation-composer').getBoundingClientRect();return{paneBottom:Math.round(pane.bottom),listBottom:Math.round(listRect.bottom),paddingBottom:parseFloat(getComputedStyle(list).paddingBottom),composerHeight:Math.round(composer.height)};})()`);
  assert.ok(Math.abs(conversationLayout.paneBottom - conversationLayout.listBottom) <= 1, JSON.stringify(conversationLayout));
  assert.ok(conversationLayout.paddingBottom > conversationLayout.composerHeight, JSON.stringify(conversationLayout));

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(cdp, `document.querySelector('[data-testid="workspace-file"]')`);
  await cdp.eval(`[...document.querySelectorAll('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')].find((row)=>row.textContent.includes('README.md')).click()`);
  await wait(cdp, `document.querySelector('[data-testid="markdown-preview"]')`);
  const markdownPreview = await cdp.eval(`(()=>{const root=document.querySelector('[data-testid="markdown-preview"]');const code=root.querySelector('.markdown-code-block pre');const codeText=code.querySelector('code');const tableWrap=root.querySelector('.markdown-table-wrap');const cell=tableWrap.querySelector('tbody td:last-child');return{hasHeading:Boolean(root.querySelector('h1')),hasSourceSymbols:root.innerText.includes('# 自适应 Markdown'),rootOverflow:getComputedStyle(root).overflowX,rootScroll:Math.ceil(root.scrollWidth-root.clientWidth),codeOverflow:getComputedStyle(code).overflowX,codeWrapped:codeText.getBoundingClientRect().height>parseFloat(getComputedStyle(codeText).lineHeight)*2,tableOverflow:getComputedStyle(tableWrap).overflowX,tableWrapped:cell.getBoundingClientRect().height>parseFloat(getComputedStyle(cell).lineHeight)*2};})()`);
  assert.equal(markdownPreview.hasHeading, true, JSON.stringify(markdownPreview));
  assert.equal(markdownPreview.hasSourceSymbols, false, JSON.stringify(markdownPreview));
  assert.equal(markdownPreview.rootOverflow, 'hidden');
  assert.ok(markdownPreview.rootScroll <= 1, JSON.stringify(markdownPreview));
  assert.equal(markdownPreview.codeOverflow, 'hidden');
  assert.equal(markdownPreview.codeWrapped, true, JSON.stringify(markdownPreview));
  assert.equal(markdownPreview.tableOverflow, 'hidden');
  assert.equal(markdownPreview.tableWrapped, true, JSON.stringify(markdownPreview));
  await screenshot(cdp, '01-markdown-responsive-preview.png');

  await cdp.eval(`document.querySelector('[data-testid="markdown-source-toggle"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="syntax-code-editor"]') && !document.querySelector('[data-testid="markdown-preview"]')`);
  const markdownSource = await cdp.eval(`(()=>{const editor=document.querySelector('.right-dock-view:not([hidden]) [data-testid="file-editor"]');return{wrap:editor.getAttribute('wrap'),overflow:getComputedStyle(editor).overflowX,scroll:Math.ceil(editor.scrollWidth-editor.clientWidth)};})()`);
  assert.equal(markdownSource.wrap, 'soft');
  assert.equal(markdownSource.overflow, 'hidden');
  assert.ok(markdownSource.scroll <= 1, JSON.stringify(markdownSource));

  await cdp.eval(`[...document.querySelectorAll('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')].find((row)=>row.textContent.includes('responsive.ts')).click()`);
  await wait(cdp, `document.querySelector('.right-dock-view:not([hidden]) [data-testid="syntax-code-editor"][data-language="script"]')`);
  const source = await cdp.eval(`(()=>{const editor=document.querySelector('.right-dock-view:not([hidden]) [data-testid="file-editor"]');const surface=document.querySelector('.right-dock-view:not([hidden]) [data-testid="syntax-code-editor"]');return{wrap:editor.getAttribute('wrap'),overflow:getComputedStyle(editor).overflowX,scroll:Math.ceil(editor.scrollWidth-editor.clientWidth),surfaceWidth:Math.round(surface.getBoundingClientRect().width)};})()`);
  assert.equal(source.wrap, 'soft');
  assert.equal(source.overflow, 'hidden');
  assert.ok(source.scroll <= 1, JSON.stringify(source));
  await cdp.eval(setValue('.right-dock-view:not([hidden]) [data-testid="file-editor"]', `export const responsiveSource = true;\n`));
  await wait(cdp, `document.querySelector('[data-testid="review-change"]')`);
  await cdp.eval(`document.querySelector('[data-testid="review-change"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="diff-view"]') && document.querySelector('[data-testid="right-dock-tab-review"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="right-dock-active-view"] [data-testid="diff-view"]') !== null`), true);
  await screenshot(cdp, '02-shared-diff-tab.png');

  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-files"]').click()`);
  await cdp.eval(`[...document.querySelectorAll('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')].find((row)=>row.textContent.includes('preview.png')).click()`);
  await wait(cdp, `document.querySelector('[data-testid="file-image-preview"] img')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="file-image-preview"] img').naturalWidth > 0`), true);

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('WORKSPACE_CONTENT_VIEWERS_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
