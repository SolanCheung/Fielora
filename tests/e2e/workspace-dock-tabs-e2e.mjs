import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-workspace-dock-'));
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
    await new Promise((resolve) => setTimeout(resolve, 80));
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
  await writeFile(path.join(projectRoot, 'src', 'workspace.ts'), 'export const workspaceDock = true;\n');
  await writeFile(path.join(projectRoot, 'README.md'), '# Workspace Dock\n\nFocused UI fixture.\n');
  await writeFile(path.join(projectRoot, 'package.json'), '{"name":"workspace-shell-fixture","private":true}\n');
  let imageBytes;
  let imageWidth = 1;
  let imageHeight = 1;
  try {
    imageBytes = await readFile('C:/Users/giants/AppData/Local/Temp/codex-clipboard-a1a545f9-596a-453e-9171-ec1379c8bd78.png');
    imageWidth = 1605;
    imageHeight = 828;
  } catch {
    imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=', 'base64');
  }
  await writeFile(path.join(projectRoot, 'preview.png'), imageBytes);
  const git = (args) => spawnSync('git.exe', args, { cwd: projectRoot, windowsHide: true, encoding: 'utf8' });
  assert.equal(git(['init']).status, 0, 'fixture git init failed');
  assert.equal(git(['config', 'user.email', 'workspace-shell@fielora.test']).status, 0);
  assert.equal(git(['config', 'user.name', 'Fielora Workspace Shell']).status, 0);
  assert.equal(git(['config', 'commit.gpgsign', 'false']).status, 0);
  assert.equal(git(['add', '.']).status, 0);
  assert.equal(git(['commit', '-m', 'fixture']).status, 0);
  await writeFile(path.join(projectRoot, 'README.md'), '# Workspace Dock\n\nFocused Production shell fixture.\n');
  await writeFile(path.join(projectRoot, 'untracked.json'), '{"workspace":true}\n');
  const imageDigest = createHash('sha256').update(imageBytes).digest('hex');
  const imageDataUrl = `data:image/png;base64,${imageBytes.toString('base64')}`;

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
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Workspace Dock 验收',goal:'Focused shell verification',root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="project-empty-conversation"]') && document.querySelector('[data-testid="project-${project.field_id}"]')`);
  assert.equal(await cdp.eval(`document.body.innerText.includes('正在准备新对话')`), false);

  for (const tool of ['FILES', 'BROWSER', 'TERMINAL', 'DIFF']) {
    await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:${JSON.stringify(tool)}}))`);
  }
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-files"]') && document.querySelector('[data-testid="right-dock-tab-browser"]') && document.querySelector('[data-testid="right-dock-tab-terminal"]') && document.querySelector('[data-testid="right-dock-tab-review"]')`);
  assert.equal(await cdp.eval(`document.body.innerText.includes('请先在当前 Project 新建一条对话')`), false);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="project-empty-conversation"]') !== null`), true);
  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-files"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="workspace-file-tool"]') && !document.querySelector('[data-testid="workspace-file-tool"]').closest('[hidden]')`);
  await screenshot(cdp, '01-empty-project-tools-available.png');
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:close-workspace-dock'))`);
  await wait(cdp, `!document.querySelector('[data-testid="right-workspace-dock"]')`);

  await cdp.eval(`document.querySelector('[data-testid="empty-conversation-create"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid^="conversation-tab-"]') && !document.querySelector('[data-testid="project-empty-conversation"]')`);
  let first = await cdp.eval(`window.fielora.conversation.list({field_id:${JSON.stringify(project.field_id)}}).then((items)=>items[0])`);
  first = await cdp.eval(`window.fielora.conversation.update({conversation_id:${JSON.stringify(first.id)},expected_revision:${first.revision},title:'图片分析任务',provider_config_id:null,model_id:null})`);
  const second = await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'Workspace Dock 实现',provider_config_id:null,model_id:null})`);
  const firstMessage = await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(first.id)},role:'USER',content:'请查看这张图片并说明它在项目中的位置。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null})`);
  await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(second.id)},role:'USER',content:'把右侧工具统一到 Workspace Dock，并保持对话滚动区域贯穿到底部。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null})`);
  await cdp.eval(`(async()=>{for(let index=1;index<=18;index+=1){await window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(second.id)},role:index%2?'ASSISTANT':'USER',content:'Workspace Dock 验收记录 '+index+'：Conversation 滚动区域保持全高，Composer 浮在内容之上且不会遮挡最后一条消息。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});}})()`);
  const attachment = await cdp.eval(`window.fielora.workspace.storeAttachment({id:${JSON.stringify(imageDigest)},name:'preview.png',size:${imageBytes.length},mime_type:'image/png',data_url:${JSON.stringify(imageDataUrl)},width:${imageWidth},height:${imageHeight},source:'file_picker'})`);
  await cdp.eval(`localStorage.setItem(${JSON.stringify(`fielora:conversation-message-attachments:${firstMessage.id}`)},JSON.stringify([{...${JSON.stringify(attachment)},data_url:null}]))`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${first.id}"]')`);

  await cdp.eval(`document.querySelector('[data-testid="conversation-${first.id}"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-tab-${first.id}"]') && document.querySelector('[data-testid="conversation-image-attachments"] img')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${second.id}"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-tab-${second.id}"]')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('[data-testid="conversation-tab-${first.id}"],[data-testid="conversation-tab-${second.id}"]').length`), 2);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${first.id}"]').click()`);
  assert.equal(await cdp.eval(`document.querySelectorAll('[data-testid="conversation-tab-${first.id}"]').length`), 1);
  await screenshot(cdp, '02-conversation-tabs.png');

  await cdp.eval(`document.querySelector('[data-testid="conversation-tab-close-${second.id}"]').click()`);
  assert.equal(await cdp.eval(`window.fielora.conversation.list({field_id:${JSON.stringify(project.field_id)}}).then((items)=>items.some((item)=>item.id===${JSON.stringify(second.id)}))`), true);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${second.id}"]').click()`);

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(cdp, `document.querySelector('[data-testid="workspace-file-tool"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="right-dock-toolbar"]').innerText.trim()`), 'Workspace Dock 验收');
  await screenshot(cdp, '03-files-tool-tab.png');
  await cdp.eval(`[...document.querySelectorAll('[data-testid="workspace-file"]')].find((item)=>item.title==='src/workspace.ts' || item.innerText.includes('workspace.ts')).click()`);
  await wait(cdp, `document.querySelector('[data-testid^="right-dock-tab-file:"]')`);
  const fileResourceLayout = await cdp.eval(`(()=>{const layout=document.querySelector('.right-dock-view-file:not([hidden]) [data-testid="dock-resource-layout"]').getBoundingClientRect();const content=document.querySelector('.right-dock-view-file:not([hidden]) .dock-resource-content').getBoundingClientRect();const tree=document.querySelector('.right-dock-view-file:not([hidden]) [data-testid="dock-resource-file-tree"]').getBoundingClientRect();return{layoutWidth:layout.width,contentWidth:content.width,contentRight:content.right,treeLeft:tree.left,treeWidth:tree.width};})()`);
  assert.ok(fileResourceLayout.contentWidth > 240 && fileResourceLayout.treeWidth >= 200, JSON.stringify(fileResourceLayout));
  assert.ok(Math.abs(fileResourceLayout.contentRight - fileResourceLayout.treeLeft) <= 1, JSON.stringify(fileResourceLayout));
  const fileKinds = await cdp.eval(`[...new Set([...document.querySelectorAll('.right-dock-view-file:not([hidden]) [data-file-kind]')].map((icon)=>icon.dataset.fileKind))]`);
  assert.ok(fileKinds.includes('typescript') && fileKinds.includes('json') && fileKinds.includes('markdown') && fileKinds.includes('image'), JSON.stringify(fileKinds));
  await screenshot(cdp, '04-file-content-tab.png');
  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-files"]').click()`);
  await cdp.eval(`[...document.querySelectorAll('[data-testid="workspace-file"]')].find((item)=>item.innerText.includes('preview.png')).click()`);
  await wait(cdp, `document.querySelector('.right-dock-view-image:not([hidden]) .dock-image-preview img')`);
  await screenshot(cdp, '05-image-tab.png');
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'BROWSER'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-browser"]')`);
  await cdp.eval(setValue('[data-testid="browser-address"]', 'https://example.com/workspace-state'));
  await screenshot(cdp, '06-browser-tool-tab.png');
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'TERMINAL'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-terminal"]')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'DIFF'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-review"]')`);
  await wait(cdp, `document.querySelectorAll('.right-dock-tab').length >= 6`);
  const headerControlLayout = await cdp.eval(`(()=>{const dock=document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect();const context=document.querySelector('[data-testid="project-context-controls"]').getBoundingClientRect();const rail=document.querySelector('[data-testid="utility-rail"]').getBoundingClientRect();const add=document.querySelector('[data-testid="right-dock-add"]').getBoundingClientRect();return{dockLeft:dock.left,dockRight:dock.right,contextRight:context.right,railLeft:rail.left,railRight:rail.right,addRight:add.right};})()`);
  assert.ok(headerControlLayout.contextRight <= headerControlLayout.dockLeft - 4, JSON.stringify(headerControlLayout));
  assert.ok(headerControlLayout.railLeft >= headerControlLayout.dockLeft, JSON.stringify(headerControlLayout));
  assert.ok(Math.abs(headerControlLayout.dockRight - headerControlLayout.railRight) <= 16, JSON.stringify(headerControlLayout));
  assert.ok(headerControlLayout.addRight < headerControlLayout.railLeft, JSON.stringify(headerControlLayout));
  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-terminal"]').click()`);
  await cdp.eval(setValue('[data-testid="terminal-command"]', 'git status --short'));
  await cdp.eval(`document.querySelector('[data-testid="terminal-run"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="terminal-message-projection"]')`, 30_000);
  const terminalProjection = await cdp.eval(`(()=>{const projection=document.querySelector('[data-testid="terminal-message-projection"]');const summary=projection.querySelector('[data-testid="terminal-message-summary"]');const technical=projection.querySelector('[data-testid="terminal-technical-output"]');return{summary:summary.innerText,raw:technical.textContent,open:technical.open};})()`);
  assert.ok(terminalProjection.summary.includes('检查了当前 Git 状态'), JSON.stringify(terminalProjection));
  assert.equal(terminalProjection.summary.includes('Terminal ·'), false);
  assert.equal(terminalProjection.open, false);
  assert.ok(terminalProjection.raw.includes('git status --short'));
  const terminalCanvas = await cdp.eval(`(()=>{const view=document.querySelector('.right-dock-view-terminal:not([hidden])');const terminal=document.querySelector('[data-testid="terminal-dock"]');const output=document.querySelector('[data-testid="terminal-output"]');return{view:getComputedStyle(view).backgroundColor,terminal:getComputedStyle(terminal).backgroundColor,output:getComputedStyle(output).backgroundColor,outputBorder:getComputedStyle(output).borderTopWidth};})()`);
  assert.equal(terminalCanvas.terminal, terminalCanvas.view);
  assert.equal(terminalCanvas.output, 'rgba(0, 0, 0, 0)');
  assert.equal(terminalCanvas.outputBorder, '0px');
  await screenshot(cdp, '10-terminal-shared-canvas.png');
  await screenshot(cdp, '07-multiple-tool-tabs.png');

  await cdp.eval(`document.querySelector('[data-testid="rail-focus"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('dock-focused')`);
  await cdp.eval(`document.querySelector('[data-testid="rail-focus"]').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('dock-focused')`);

  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-files"]').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="workspace-file-tool"]').closest('[hidden]')`);
  await cdp.eval(setValue('[data-testid="workspace-file-filter"]', 'workspace'));

  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-browser"]').click()`);
  await wait(cdp, `document.querySelector('.right-dock-view-browser:not([hidden]) .browse-panel')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="browser-address"]').value`), 'https://example.com/workspace-state');
  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-files"]').click()`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="workspace-file-filter"]').value`), 'workspace');
  await cdp.eval(setValue('[data-testid="workspace-file-filter"]', ''));

  const textTab = await cdp.eval(`[...document.querySelectorAll('.right-dock-tab')].find((item)=>item.dataset.tabId?.startsWith('file:'))?.dataset.tabId`);
  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-${textTab}"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="file-editor"]')`);
  await cdp.eval(setValue('[data-testid="file-editor"]', 'export const workspaceDock = true;\nexport const toolTabs = true;\n'));
  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-browser"]').click()`);
  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-${textTab}"]').click()`);
  assert.ok((await cdp.eval(`document.querySelector('[data-testid="file-editor"]').value`)).includes('toolTabs = true'));
  await cdp.eval(`document.querySelector('[data-testid="review-change"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="diff-view"]')`);

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:close-workspace-dock'))`);
  await wait(cdp, `!document.querySelector('[data-testid="right-workspace-dock"]')`);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="composer-permission-menu"]')`);
  const permissionIcons = await cdp.eval(`(()=>{const icons=[...document.querySelectorAll('[data-testid="composer-permission-menu"] [data-permission-icon]')];return icons.map((icon)=>({kind:icon.dataset.permissionIcon,viewBox:icon.getAttribute('viewBox'),color:getComputedStyle(icon).color,pathCount:icon.querySelectorAll('path,rect').length}));})()`);
  assert.deepEqual(permissionIcons.map((item)=>item.kind), ['READ_ONLY','REVIEW_CHANGES','FULL_CONTROL']);
  assert.ok(permissionIcons.every((item)=>item.viewBox === '0 0 20 20' && item.pathCount >= 1), JSON.stringify(permissionIcons));
  assert.equal(new Set(permissionIcons.map((item)=>item.color)).size, 3);
  await screenshot(cdp, '11-permission-icons.png');
  await cdp.eval(`document.querySelector('[data-testid="composer-permission"]').click()`);
  const scrollLayout = await cdp.eval(`(()=>{const listElement=document.querySelector('.message-list');listElement.scrollTop=Math.floor((listElement.scrollHeight-listElement.clientHeight)/2);const column=document.querySelector('.conversation-column').getBoundingClientRect();const list=listElement.getBoundingClientRect();const composer=document.querySelector('.conversation-composer').getBoundingClientRect();const style=getComputedStyle(listElement);return{columnBottom:Math.round(column.bottom),listBottom:Math.round(list.bottom),composerBottom:Math.round(composer.bottom),composerTop:Math.round(composer.top),paddingBottom:parseFloat(style.paddingBottom),position:getComputedStyle(document.querySelector('.conversation-composer')).position,scrollHeight:listElement.scrollHeight,clientHeight:listElement.clientHeight};})()`);
  assert.ok(Math.abs(scrollLayout.columnBottom - scrollLayout.listBottom) <= 1, JSON.stringify(scrollLayout));
  assert.equal(scrollLayout.position, 'absolute');
  assert.ok(scrollLayout.paddingBottom >= 220);
  assert.ok(scrollLayout.scrollHeight > scrollLayout.clientHeight);
  assert.ok(scrollLayout.composerTop < scrollLayout.listBottom && scrollLayout.composerBottom <= scrollLayout.listBottom);
  const lastMessageVisible = await cdp.eval(`(()=>{const list=document.querySelector('.message-list');list.scrollTop=list.scrollHeight;const last=[...list.querySelectorAll('.message')].at(-1).getBoundingClientRect();const composer=document.querySelector('.conversation-composer').getBoundingClientRect();return last.bottom <= composer.top - 8;})()`);
  assert.equal(lastMessageVisible, true);
  await cdp.eval(`(()=>{const list=document.querySelector('.message-list');list.scrollTop=Math.floor((list.scrollHeight-list.clientHeight)/2);})()`);
  await screenshot(cdp, '08-full-height-scrollbar.png');

  await cdp.eval(`document.querySelector('[data-testid="conversation-${first.id}"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-image-attachments"] img')`);
  const imagePoint = await cdp.eval(`(()=>{const rect=document.querySelector('[data-testid="conversation-image-attachments"] img').getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: imagePoint.x, y: imagePoint.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: imagePoint.x, y: imagePoint.y, button: 'right', clickCount: 1 });
  await wait(cdp, `document.querySelector('[data-testid="image-context-menu"]')`);
  assert.ok((await cdp.eval(`document.querySelector('[data-testid="image-context-menu"]').innerText`)).includes('Workspace Dock 验收 / 当前对话 / preview.png'));
  await cdp.eval(`document.querySelector('[data-testid="image-context-menu"] button').click()`);
  await wait(cdp, `document.querySelector('[data-testid^="right-dock-tab-image:"]') && document.querySelector('.dock-image-preview img')`);
  await cdp.eval(`document.querySelector('.dock-image-preview button').click()`);
  await wait(cdp, `document.querySelector('[data-testid="image-preview"]')`);
  await cdp.eval(`document.querySelector('[data-testid="image-preview"] button[aria-label="关闭图片预览"]').click()`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-files"]')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'BROWSER'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-browser"]')`);
  await cdp.eval(`document.querySelector('[data-testid^="right-dock-tab-image:"]').click()`);

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 760, deviceScaleFactor: 1, mobile: false });
  await wait(cdp, `getComputedStyle(document.querySelector('[data-testid="right-workspace-dock"]')).position==='absolute'`);
  const narrow = await cdp.eval(`(()=>{const dock=document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect();const conversation=document.querySelector('.conversation-column').getBoundingClientRect();return{dockWidth:dock.width,conversationWidth:conversation.width,resizer:getComputedStyle(document.querySelector('[data-testid="project-workspace-resizer"]')).display};})()`);
  assert.ok(narrow.dockWidth <= 560 && narrow.conversationWidth >= 320, JSON.stringify(narrow));
  assert.equal(narrow.resizer, 'none');
  await screenshot(cdp, '09-narrow-window-dock.png');

  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('WORKSPACE_DOCK_TABS_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
