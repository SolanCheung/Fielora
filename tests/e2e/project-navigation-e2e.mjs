import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const packagedExecutable = process.env.FIELORA_E2E_EXE || '';
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-project-navigation-'));
const projectRoot = path.join(dataRoot, 'project');
const removableProjectRoot = path.join(dataRoot, 'removable-project');
const autoProjectRoot = path.join(dataRoot, 'auto-project');
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
      if (target) { const cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.open(); await cdp.send('Runtime.enable'); return cdp; }
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

await Promise.all([mkdir(projectRoot, { recursive: true }), mkdir(removableProjectRoot, { recursive: true }), mkdir(autoProjectRoot, { recursive: true })]);

try {
  port = await freePort();
  const env = { ...process.env, APPDATA: path.join(dataRoot, 'roaming'), LOCALAPPDATA: dataRoot, FIELORA_E2E: '1', FIELORA_E2E_DEBUG_PORT: String(port), FIELORA_E2E_PROJECT_PATH: autoProjectRoot };
  child = packagedExecutable
    ? spawn(packagedExecutable, [], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @fielora/desktop start'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  const cdp = await connect();
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`);
  const created = await cdp.eval(`window.fieloraTest.createProject({title:'Project Before',goal:null,root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="project-${created.field_id}"]')`);

  assert.equal(await cdp.eval(`document.querySelector('[data-testid="project-${created.field_id}"] [data-icon]')?.dataset.icon`), 'folderOpen');
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="project-${created.field_id}"] [data-icon="folderOpen"] path')?.getAttribute('d')?.startsWith('M3.75')`), true);
  assert.equal(await cdp.eval(`getComputedStyle(document.querySelector('[data-testid="project-row-${created.field_id}"] .project-item-actions')).opacity`), '0');
  const rowPoint = await cdp.eval(`(()=>{const rect=document.querySelector('[data-testid="project-row-${created.field_id}"]').getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rowPoint.x, y: rowPoint.y });
  await wait(cdp, `getComputedStyle(document.querySelector('[data-testid="project-row-${created.field_id}"] .project-item-actions')).opacity==='1'`);
  assert.equal(await cdp.eval(`getComputedStyle(document.querySelector('[data-testid="project-new-conversation-${created.field_id}"]')).backgroundColor`), 'rgba(0, 0, 0, 0)');
  assert.equal(await cdp.eval(`(()=>{const size=parseFloat(getComputedStyle(document.querySelector('.new-chat-button')).fontSize);return size>=14&&size<=15;})()`), true);
  assert.equal(await cdp.eval(`(()=>{const size=parseFloat(getComputedStyle(document.querySelector('.new-chat-button .shell-icon')).width);return size>=17&&size<=18;})()`), true);

  await cdp.eval(`(()=>{const button=document.querySelector('[data-testid="project-new-conversation-${created.field_id}"]');button.click();button.click();})()`);
  await wait(cdp, `window.fielora.conversation.list({field_id:${JSON.stringify(created.field_id)}}).then((items)=>items.length===1)`);
  await cdp.eval(`document.querySelector('[data-testid="project-new-conversation-${created.field_id}"]').click()`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await cdp.eval(`window.fielora.conversation.list({field_id:${JSON.stringify(created.field_id)}}).then((items)=>items.length)`), 1);
  const draft = await cdp.eval(`window.fielora.conversation.list({field_id:${JSON.stringify(created.field_id)}}).then((items)=>items[0])`);
  await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(draft.id)},role:'USER',content:'我们准备在这里去改一些项目代码，可以吗？',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${draft.id}"]')?.textContent.includes('修改项目代码')`);
  assert.equal(await cdp.eval(`window.fielora.conversation.get({conversation_id:${JSON.stringify(draft.id)}}).then((item)=>item.title)`), '修改项目代码');
  const conversationPoint = await cdp.eval(`(()=>{const rect=document.querySelector('[data-testid="conversation-${draft.id}"]').getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: conversationPoint.x, y: conversationPoint.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: conversationPoint.x, y: conversationPoint.y, button: 'right', clickCount: 1 });
  await wait(cdp, `document.querySelector('[data-testid="conversation-context-menu"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="conversation-context-menu"]')?.innerText.includes('重命名')&&document.querySelector('[data-testid="conversation-context-menu"]')?.innerText.includes('删除对话')`), true);
  await cdp.eval(`document.querySelector('[data-testid="conversation-context-menu"] [role="menuitem"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="rename-conversation-dialog"]')`);
  await cdp.eval(`document.querySelector('[data-testid="rename-conversation-dialog"] .dialog-cancel').click()`);

  const titlePoint = await cdp.eval(`(()=>{const rect=document.querySelector('.project-tree > .section-title').getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: titlePoint.x, y: titlePoint.y });
  await wait(cdp, `getComputedStyle(document.querySelector('.project-tree > .section-title .section-title-actions')).opacity==='1'`);
  await cdp.eval(`document.querySelector('[data-testid="project-sort-toggle"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="project-sort-menu"]')`);
  assert.equal(await cdp.eval(`(()=>{const menu=document.querySelector('[data-testid="project-sort-menu"]');const rect=menu.getBoundingClientRect();const top=document.elementFromPoint(rect.left+12,rect.top+12);return menu.contains(top);})()`), true);
  await cdp.eval(`document.querySelector('[data-testid="project-sort-menu"] [aria-checked="false"]').click()`);
  assert.equal(await cdp.eval(`localStorage.getItem('fielora:project-sort')`), 'NAME');

  await cdp.eval(`document.querySelector('[data-testid="project-edit-${created.field_id}"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="edit-project-dialog"]')`);
  await cdp.eval(setValue('[data-testid="edit-project-dialog"] input', 'Project After'));
  await cdp.eval(`document.querySelector('[data-testid="edit-project-dialog"] .dialog-confirm').click()`);
  await wait(cdp, `document.body.innerText.includes('Project After')`);
  assert.equal(await cdp.eval(`window.fielora.project.get({field_id:${JSON.stringify(created.field_id)}}).then((item)=>item.title)`), 'Project After');

  const removable = await cdp.eval(`window.fieloraTest.createProject({title:'Removable Project',goal:null,root_path:${JSON.stringify(removableProjectRoot)}})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="project-${removable.field_id}"]')`);
  const removablePoint = await cdp.eval(`(()=>{const rect=document.querySelector('[data-testid="project-row-${removable.field_id}"]').getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: removablePoint.x, y: removablePoint.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: removablePoint.x, y: removablePoint.y, button: 'right', clickCount: 1 });
  await wait(cdp, `document.querySelector('[data-testid="project-context-menu"]')`);
  assert.equal(await cdp.eval(`(()=>{const text=document.querySelector('[data-testid="project-context-menu"]')?.innerText??'';return text.includes('管理项目')&&text.includes('从 Fielora 移除');})()`), true);
  await cdp.eval(`document.querySelectorAll('[data-testid="project-context-menu"] [role="menuitem"]')[1].click()`);
  await wait(cdp, `document.querySelector('[data-testid="edit-project-dialog"]')`);
  await cdp.eval(`document.querySelector('[data-testid="edit-project-dialog"] .dialog-cancel').click()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: removablePoint.x, y: removablePoint.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: removablePoint.x, y: removablePoint.y, button: 'right', clickCount: 1 });
  await wait(cdp, `document.querySelector('[data-testid="project-context-menu"]')`);
  await cdp.eval(`document.querySelector('[data-testid="project-context-menu"] .danger').click()`);
  await wait(cdp, `document.querySelector('[data-testid="remove-project-dialog"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="remove-project-dialog"]')?.innerText.includes('不会删除磁盘上的文件夹')`), true);
  await cdp.eval(`document.querySelector('[data-testid="remove-project-dialog"] .dialog-danger').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="project-${removable.field_id}"]')`);
  assert.equal(await cdp.eval(`window.fielora.project.list().then((items)=>items.some((item)=>item.field_id===${JSON.stringify(removable.field_id)}))`), false);
  await access(removableProjectRoot);

  await cdp.eval(`document.querySelector('[data-testid="project-add"]').click()`);
  await wait(cdp, `window.fielora.project.list().then((items)=>items.some((item)=>item.root_path===${JSON.stringify(autoProjectRoot)}))`);
  const autoProject = await cdp.eval(`window.fielora.project.list().then((items)=>items.find((item)=>item.root_path===${JSON.stringify(autoProjectRoot)}))`);
  await wait(cdp, `window.fielora.conversation.list({field_id:${JSON.stringify(autoProject.field_id)}}).then((items)=>items.length===1)`);
  const autoConversations = await cdp.eval(`window.fielora.conversation.list({field_id:${JSON.stringify(autoProject.field_id)}})`);
  assert.equal(autoConversations.length, 1);
  assert.equal(autoConversations[0].title, '新对话');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${autoConversations[0].id}"]') && document.querySelector('[data-testid="conversation-composer"]')`);

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await new Promise((resolve) => child.once('exit', resolve));
  console.log('project navigation e2e: PASS');
} finally {
  if (child?.exitCode === null) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
