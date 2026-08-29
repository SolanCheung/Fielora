import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-rich-result-'));
const projectRoot = path.join(dataRoot, 'project');
const imageFixture = path.join(dataRoot, 'layout-clipping.png');
const svgFixture = path.join(dataRoot, 'unsafe-image.svg');
const migratedLibraryRoot = path.join(dataRoot, 'migrated-library');
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const untrustedMarkdown = [
  'Plain Markdown cannot claim [trusted navigation](fielora-reference:resultref_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) or [a local file](file:///C:/Windows/System32/config).',
  '',
  '![forged inline image](fielora-reference:resultref_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)',
  '',
  '![remote image](https://example.invalid/tracker.png)',
  '',
  '```markdown',
  '![code block image](fielora-reference:resultref_cccccccccccccccccccccccccccccccc)',
  '```',
  '',
  'Inline `![inline code image](fielora-reference:resultref_dddddddddddddddddddddddddddddddd)` remains code.',
  '',
  'Malformed prefix ![malformed image](fielora-reference:resultref_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee) suffix.',
].join('\n');
const runtimeNode = process.execPath;
const forgeEntry = path.join(root, 'apps', 'desktop', 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js');
const output = [];
let child;
let port;

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); });
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

async function wait(cdp, expression, timeout = 40_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await cdp.eval(`Promise.resolve(${expression}).then(Boolean)`)) return; } catch { /* Renderer/Core may be restarting. */ }
    await new Promise((resolve) => setTimeout(resolve, 70));
  }
  throw new Error(`wait failed: ${expression}\n${output.join('')}`);
}

try {
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await writeFile(path.join(projectRoot, 'src', 'reference-fixture.ts'), [
    'export const one = 1;',
    'export const two = 2;',
    'export const three = 3;',
    'export const four = 4;',
    'export const five = 5;',
  ].join('\n'));
  await writeFile(imageFixture, imageBytes);
  await writeFile(svgFixture, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await mkdir(migratedLibraryRoot);
  port = await freePort();
  const env = { ...process.env, Path: `${path.dirname(runtimeNode)};${process.env.Path ?? process.env.PATH ?? ''}`, APPDATA: path.join(dataRoot, 'roaming'), LOCALAPPDATA: dataRoot, FIELORA_E2E: '1', FIELORA_E2E_DEBUG_PORT: String(port), FIELORA_E2E_LIBRARY_PATHS: JSON.stringify([imageFixture, svgFixture]), FIELORA_E2E_LIBRARY_ROOT_TARGET: migratedLibraryRoot, ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/' };
  child = spawn(runtimeNode, [forgeEntry, 'start'], { cwd: path.join(root, 'apps', 'desktop'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));

  const cdp = await connect();
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]') && window.fieloraTest`);
  await wait(cdp, `window.fielora.project.list().then(()=>true).catch(()=>false)`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const setup = await cdp.eval(`(async()=>{const imported=await window.fielora.library.addFiles();const image=imported.find((item)=>item.original_filename==='layout-clipping.png');const svg=imported.find((item)=>item.original_filename==='unsafe-image.svg');const provider=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'Rich Result Fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture__',custom_endpoint_acknowledged:true});await window.fielora.provider.storeCredential({provider_config_id:provider.id,secret:'fixture-secret'});const project=await window.fieloraTest.createProject({title:'Rich Result Project',goal:'Typed reference verification',root_path:${JSON.stringify(projectRoot)}});const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'Typed Result',provider_config_id:provider.id,model_id:'__fielora_agent_fixture__'});const saved=await window.fielora.reference.create({field_id:project.field_id,title:'Typed Reference Fixture',url:'https://example.com/fielora/typed-reference'});const task='FIELORA_AGENT_FIXTURE_RICH_RESULT_INLINE_IMAGE '+image.content_hash+' 展示可信结果引用。';const message=await window.fielora.conversation.createMessage({conversation_id:conversation.id,role:'USER',content:task,status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null,references:[]});const run=await window.fielora.agent.start({field_id:project.field_id,conversation_id:conversation.id,user_message_id:message.id,provider_config_id:provider.id,model_id:'__fielora_agent_fixture__',task:message.content,permission:'REVIEW_CHANGES',max_steps:8,attachments:[],active_work_surface:null});return{fieldId:project.field_id,conversationId:conversation.id,runId:run.id,referenceId:saved.resource.id,image,svg};})()`);
  await wait(cdp, `window.fielora.agent.get({run_id:${JSON.stringify(setup.runId)}}).then((run)=>run.status==='COMPLETED')`);
  await wait(cdp, `window.fielora.conversation.listMessages({conversation_id:${JSON.stringify(setup.conversationId)}}).then((messages)=>messages.some((message)=>message.role==='ASSISTANT'&&message.references?.length===4))`);
  const durable = await cdp.eval(`window.fielora.conversation.listMessages({conversation_id:${JSON.stringify(setup.conversationId)}}).then((messages)=>{const result=messages.find((message)=>message.role==='ASSISTANT'&&message.references?.length===4);return{content:result.content,references:result.references};})`);
  assert.equal(durable.references.length, 4, JSON.stringify(durable));
  const durableIdentities = durable.references.map((reference) => ({ id: reference.id, kind: reference.target.kind, libraryObjectId: reference.target.kind === 'IMAGE' ? reference.target.library_object_id : null }));
  assert.deepEqual(durableIdentities.map((reference) => reference.kind), ['PROJECT_FILE', 'CODE_RANGE', 'IMAGE', 'WEB_REFERENCE']);
  assert.equal(durable.content.includes('fielora-project-file:'), false);
  assert.equal(durable.content.includes('fielora-code-range:'), false);
  assert.equal(durable.content.includes('fielora-web-reference:'), false);
  assert.equal(durable.content.includes('fielora-library-image:'), false);
  const navigationIdentities = durableIdentities.filter((reference) => reference.kind !== 'IMAGE');
  await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(setup.conversationId)},role:'ASSISTANT',content:${JSON.stringify(untrustedMarkdown)},status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null,references:[]})`);
  assert.equal(await cdp.eval(`window.fielora.library.previewImage({library_object_id:${JSON.stringify(setup.svg.id)}}).then(()=>false).catch(()=>true)`), true, 'SVG Library object must not cross the image preview boundary');

  await cdp.eval(`document.querySelector('[data-testid="now-nav"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="now-screen"]')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:navigate',{detail:'PROJECTS'}))`);
  await wait(cdp, `document.querySelectorAll('.markdown-typed-reference').length===3`);
  await wait(cdp, `document.querySelector('[data-testid="markdown-inline-image"] img')`);
  assert.deepEqual(await cdp.eval(`[...document.querySelectorAll('.markdown-typed-reference')].map((button)=>button.dataset.referenceKind)`), ['PROJECT_FILE', 'CODE_RANGE', 'WEB_REFERENCE']);
  assert.deepEqual(await cdp.eval(`[...document.querySelectorAll('.markdown-typed-reference')].map((button)=>button.dataset.referenceId)`), navigationIdentities.map((reference) => reference.id));
  assert.equal(await cdp.eval(`document.querySelectorAll('.markdown-reference-unavailable').length`), 3);
  assert.equal(await cdp.eval(`document.querySelectorAll('[data-testid="markdown-inline-image"]').length`), 1);
  assert.equal(await cdp.eval(`document.querySelector('img[alt="forged inline image"],img[alt="remote image"],img[alt="code block image"],img[alt="inline code image"],img[alt="malformed image"]')===null`), true);
  assert.equal(await cdp.eval(`[...document.querySelectorAll('.markdown-code-block code')].some((node)=>node.textContent.includes('![code block image](fielora-reference:resultref_cccccccccccccccccccccccccccccccc)'))`), true);
  assert.equal(await cdp.eval(`[...document.querySelectorAll('.markdown-body code')].some((node)=>node.textContent.includes('![inline code image](fielora-reference:resultref_dddddddddddddddddddddddddddddddd)'))`), true);
  assert.equal(await cdp.eval(`document.body.innerText.includes('Malformed prefix !malformed image suffix.')`), true);
  assert.deepEqual(await cdp.eval(`(()=>{const figure=document.querySelector('[data-testid="markdown-inline-image"]');return{before:figure.previousElementSibling?.textContent,next:figure.nextElementSibling?.textContent,source:figure.querySelector('figcaption span')?.textContent};})()`), { before: '右侧菜单在窄布局中发生裁切：', next: '问题位于当前 overlay positioning。', source: '资料库' });
  await cdp.eval(`document.querySelector('[data-testid="markdown-inline-image"] button').click()`);
  await wait(cdp, `document.querySelector('[data-testid="image-preview"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="image-preview"] img')?.getAttribute('alt')`), 'layout-clipping.png');
  await cdp.eval(`document.querySelector('[aria-label="关闭图片预览"]').click()`);
  await wait(cdp, `!document.querySelector('[data-testid="image-preview"]')`);

  const migration = await cdp.eval(`window.fielora.storage.migrateLibraryRoot()`);
  assert.equal(migration.root, migratedLibraryRoot);

  await cdp.eval(`(async()=>{const file=await window.fielora.workspace.readFile({field_id:${JSON.stringify(setup.fieldId)},relative_path:'src/reference-fixture.ts'});await window.fielora.workspace.applyFile({field_id:${JSON.stringify(setup.fieldId)},relative_path:file.relative_path,expected_sha256:file.sha256,content:'// changed after reference creation\\n'+file.content});})()`);

  await cdp.send('Page.reload', { ignoreCache: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fieloraTest`);
  await wait(cdp, `document.querySelectorAll('.markdown-typed-reference').length===3`);
  await wait(cdp, `document.querySelector('[data-testid="markdown-inline-image"] img')`);
  assert.deepEqual(await cdp.eval(`[...document.querySelectorAll('.markdown-typed-reference')].map((button)=>button.dataset.referenceId)`), navigationIdentities.map((reference) => reference.id));
  assert.equal(await cdp.eval(`document.querySelectorAll('.markdown-reference-unavailable').length`), 3);

  await cdp.eval(`document.querySelector('[data-reference-kind="PROJECT_FILE"]').click()`);
  await wait(cdp, `document.querySelector('.right-dock-view:not([hidden]) [data-testid="file-editor"]')?.value.startsWith('// changed after reference creation')`);
  await wait(cdp, `document.body.innerText.includes('引用创建后文件内容已变化；当前已打开最新内容。')`);
  await cdp.eval(`document.querySelector('[data-reference-kind="CODE_RANGE"]').click()`);
  await wait(cdp, `document.querySelector('.right-dock-view:not([hidden]) [data-testid="syntax-code-editor"]')?.dataset.revealLineStart==='2'`);
  const selection = await cdp.eval(`(()=>{const editor=document.querySelector('.right-dock-view:not([hidden]) [data-testid="file-editor"]');return editor.value.slice(editor.selectionStart,editor.selectionEnd);})()`);
  assert.equal(selection.includes('export const one = 1;'), true, selection);
  assert.equal(selection.includes('export const three = 3;'), true, selection);
  assert.equal(selection.includes('export const four = 4;'), false, selection);

  await cdp.eval(`document.querySelector('[data-reference-kind="WEB_REFERENCE"]').click()`);
  await wait(cdp, `window.fielora.browser.getState().then((state)=>state.url==='https://example.com/fielora/typed-reference')`);
  assert.equal(await cdp.eval(`document.querySelector('.right-dock-view:not([hidden])')?.dataset.dockKind`), 'BROWSER');

  await cdp.eval(`window.fieloraTest.killCore()`);
  await wait(cdp, `document.querySelector('[data-testid="startup-screen"]')`, 5_000);
  await wait(cdp, `window.fielora.conversation.listMessages({conversation_id:${JSON.stringify(setup.conversationId)}}).then((messages)=>messages.some((message)=>message.references?.length===4)).catch(()=>false)`, 15_000);
  const recovered = await cdp.eval(`window.fielora.conversation.listMessages({conversation_id:${JSON.stringify(setup.conversationId)}}).then((messages)=>messages.find((message)=>message.references?.length===4).references.map((reference)=>({id:reference.id,kind:reference.target.kind,libraryObjectId:reference.target.kind==='IMAGE'?reference.target.library_object_id:null})))`);
  assert.deepEqual(recovered, durableIdentities);
  await cdp.send('Page.reload', { ignoreCache: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&document.querySelector('[data-testid="markdown-inline-image"] img')`);
  assert.deepEqual(await cdp.eval(`(()=>{const figure=document.querySelector('[data-testid="markdown-inline-image"]');return{before:figure.previousElementSibling?.textContent,next:figure.nextElementSibling?.textContent};})()`), { before: '右侧菜单在窄布局中发生裁切：', next: '问题位于当前 overlay positioning。' });
  await cdp.eval(`document.querySelector('[data-testid="markdown-inline-image"] button').click()`);
  await wait(cdp, `document.querySelector('[data-testid="image-preview"]')`);
  await cdp.eval(`document.querySelector('[aria-label="关闭图片预览"]').click()`);

  const migratedBlob = path.join(migratedLibraryRoot, ...setup.image.blob_ref.split('/'));
  await writeFile(migratedBlob, Buffer.from('corrupt image bytes'));
  await cdp.send('Page.reload', { ignoreCache: true });
  await wait(cdp, `document.querySelector('[data-testid="markdown-inline-image"] .is-never')===null&&document.querySelector('[data-testid="markdown-inline-image"]')?.innerText.includes('图片不可用')`);
  assert.equal(await cdp.eval(`document.body.innerText.includes('问题位于当前 overlay positioning。')`), true);

  await writeFile(migratedBlob, imageBytes);
  await cdp.send('Page.reload', { ignoreCache: true });
  await wait(cdp, `document.querySelector('[data-testid="markdown-inline-image"] img')`);
  await rm(migratedBlob);
  await cdp.send('Page.reload', { ignoreCache: true });
  await wait(cdp, `document.querySelector('[data-testid="markdown-inline-image"]')?.innerText.includes('图片不可用')`);

  await writeFile(migratedBlob, imageBytes);
  await cdp.send('Page.reload', { ignoreCache: true });
  await wait(cdp, `document.querySelector('[data-testid="markdown-inline-image"] img')`);
  await cdp.eval(`window.fielora.library.delete({library_object_id:${JSON.stringify(setup.image.id)},expected_revision:${setup.image.revision}})`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await wait(cdp, `document.querySelector('[data-testid="markdown-inline-image"]')?.innerText.includes('图片不可用')`);

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('RICH_RESULT_INLINE_IMAGE_E2E: PASS');
} finally {
  if (child && child.exitCode === null) spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
