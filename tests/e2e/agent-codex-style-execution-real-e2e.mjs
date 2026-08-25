import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

if (process.env.FIELORA_REAL_CODEX_STYLE_EXECUTION !== '1') {
  throw new Error('Set FIELORA_REAL_CODEX_STYLE_EXECUTION=1 for real Production acceptance.');
}

const root = path.resolve(import.meta.dirname, '..', '..');
const evidence = process.env.FIELORA_CODEX_STYLE_EVIDENCE_DIR
  ? path.resolve(process.env.FIELORA_CODEX_STYLE_EVIDENCE_DIR)
  : path.join(root, 'artifacts', 'agentic-codex-style-execution');
const canonicalDatabase = path.join(process.env.LOCALAPPDATA ?? '', 'Fielora', 'data', 'fielora.db');
const suffix = Date.now().toString(36);
const acceptanceFile = `fielora-codex-execution-${suffix}.js`;
const task = [
  `在当前 web Project 根目录新建 ${acceptanceFile}。`,
  '先确认当前项目根目录，并确认没有同名文件。',
  '文件内容仅为：export const fieloraCodexExecution = true;',
  '不要修改其他现有文件。',
  `创建后运行 node --check ${acceptanceFile}。`,
  '最后核对本次只新增了这一个文件。',
].join('\n');
const steering = `完成后再确认 ${acceptanceFile} 已通过语法检查；只回答确认结果，不要继续修改文件。`;
const screenshotNames = [
  '01-thinking-only.png',
  '02-conversation-activity-stream.png',
  '03-activity-evidence.png',
  '04-activity-completion-hover.png',
  '05-scroll-to-latest.png',
  '06-running-steering.png',
  '07-result-changed-files.png',
  '08-inline-files-expanded.png',
];
const liveEditedScreenshotNames = [
  '09-live-edited-files.png',
  '10-live-edited-files-popover.png',
  '11-final-inline-changed-files.png',
];

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }
  async open() {
    if (this.socket.readyState !== WebSocket.OPEN) await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const value = JSON.parse(String(event.data));
      if (value.method) for (const handler of this.handlers.get(value.method) ?? []) handler(value.params ?? {});
      const pending = this.pending.get(value.id);
      if (!pending) return;
      this.pending.delete(value.id);
      value.error ? pending.reject(new Error(value.error.message)) : pending.resolve(value.result);
    });
  }
  on(method, handler) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (reason) => { clearTimeout(timer); reject(reason); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((reason) => reason ? reject(reason) : resolve(port));
    });
  });
}

async function connect(port, output) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find((item) => item.type === 'page' && item.url.includes('main_window'));
      if (target) {
        const cdp = new Cdp(target.webSocketDebuggerUrl);
        await cdp.open();
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Page.bringToFront');
        return cdp;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Production Fielora Electron target not found.\n${output.slice(-30).join('')}`);
}

async function wait(cdp, expression, timeout = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await cdp.eval(`(async()=>Boolean(await (${expression})))()`)) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

function setValue(selector, value) {
  return `(()=>{const element=document.querySelector(${JSON.stringify(selector)});const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value');descriptor.set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`;
}

async function capture(cdp, name) {
  await cdp.eval('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const output = path.join(evidence, name);
  await writeFile(output, Buffer.from(image.data, 'base64'));
  return output;
}

async function clickCenter(cdp, selector) {
  const point = await cdp.eval(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return null;const rect=element.getBoundingClientRect();const x=rect.left+rect.width/2;const y=rect.top+rect.height/2;const hit=document.elementFromPoint(x,y);return{x,y,inside:Boolean(hit&&(hit===element||element.contains(hit))),hit:hit?.className||hit?.tagName||''};})()`);
  assert.ok(point, `Clickable element not found: ${selector}`);
  assert.equal(point.inside, true, `Click was intercepted by ${String(point.hit)} at ${point.x},${point.y}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

async function selectConversation(cdp, projectId, conversationId) {
  await cdp.send('Page.reload');
  await wait(cdp, `document.querySelector('[data-testid="project-${projectId}"]')`, 90_000);
  await cdp.eval(`document.querySelector('[data-testid="project-${projectId}"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-${conversationId}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${conversationId}"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-composer"]')`);
}

function powershell(source, extraEnv = {}) {
  const encoded = Buffer.from(source, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) throw new Error(`PowerShell failed: ${result.stderr || result.stdout}`);
}

async function resize(cdp, width, height) {
  void cdp;
  powershell(`Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class FieloraCodexWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder value, int count);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int width, int height, uint flags);
  public static IntPtr Find() { IntPtr found=IntPtr.Zero; EnumWindows((h,p)=>{var title=new StringBuilder(256);GetWindowText(h,title,256);if(IsWindowVisible(h)&&title.ToString()=="Fielora")found=h;return true;},IntPtr.Zero);return found; }
}
'@; $handle=[FieloraCodexWindow]::Find(); if($handle -eq [IntPtr]::Zero){throw 'Fielora window not found'}; [FieloraCodexWindow]::ShowWindow($handle,9)|Out-Null; [FieloraCodexWindow]::SetWindowPos($handle,[IntPtr]::Zero,24,18,[int]$env:FIELORA_WIDTH,[int]$env:FIELORA_HEIGHT,64)|Out-Null`, {
    FIELORA_WIDTH: String(width), FIELORA_HEIGHT: String(height),
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
}

await mkdir(evidence, { recursive: true });
const isolatedRoot = await mkdtemp(path.join(tmpdir(), 'fielora-codex-style-'));
const isolatedLocal = path.join(isolatedRoot, 'local');
const isolatedRoaming = path.join(isolatedRoot, 'roaming');
const isolatedDatabase = path.join(isolatedLocal, 'Fielora', 'data', 'fielora.db');
await mkdir(path.dirname(isolatedDatabase), { recursive: true });
const source = new DatabaseSync(canonicalDatabase, { readOnly: true });
const canonicalWeb = source.prepare("SELECT f.title,b.local_locator AS root_path FROM fields f JOIN device_bindings b ON b.object_id=f.id AND b.binding_kind='PROJECT_ROOT' WHERE f.title='web' AND f.lifecycle_status='ACTIVE' ORDER BY f.updated_at DESC LIMIT 1").get();
assert.equal(canonicalWeb?.title, 'web');
assert.ok(path.isAbsolute(canonicalWeb?.root_path ?? ''));
await writeFile(isolatedDatabase, source.serialize());
source.close();

const port = await freePort();
const runtimePath = [path.dirname(process.execPath), process.env.Path ?? process.env.PATH ?? ''].filter(Boolean).join(path.delimiter);
const env = {
  ...process.env,
  Path: runtimePath,
  PATH: runtimePath,
  APPDATA: isolatedRoaming,
  LOCALAPPDATA: isolatedLocal,
  FIELORA_E2E: '1',
  FIELORA_E2E_DEBUG_PORT: String(port),
};
delete env.ELECTRON_RUN_AS_NODE;
const output = [];
const child = spawn(process.execPath, [path.join(root, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js'), 'start'], {
  cwd: path.join(root, 'apps', 'desktop'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (chunk) => output.push(String(chunk)));
child.stderr.on('data', (chunk) => output.push(String(chunk)));

let cdp;
let recording = false;
const screencastFrames = [];
const screenshots = [];
const attachScreencast = (client) => client.on('Page.screencastFrame', ({ data, sessionId }) => {
  if (screencastFrames.length < 300) screencastFrames.push(Buffer.from(data, 'base64'));
  void client.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
});
try {
  cdp = await connect(port, output);
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`, 120_000);
  await resize(cdp, 1600, 600);
  const acceptance = await cdp.eval(`(async()=>{const projects=await window.fielora.project.list();const providers=await window.fielora.provider.list();const project=projects.find((item)=>item.title==='web')??await window.fieloraTest.createProject({title:'web',goal:'Real Production Codex-style execution acceptance',root_path:${JSON.stringify(canonicalWeb.root_path)}});return{project,provider:providers.find((item)=>item.default_model==='qwen3.7-plus'&&item.lifecycle_status==='ACTIVE'&&item.credential_present)}})()`);
  assert.equal(acceptance.project?.title, 'web');
  assert.equal(acceptance.provider?.default_model, 'qwen3.7-plus');
  assert.equal(acceptance.provider?.credential_present, true);

  const conversation = await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(acceptance.project.field_id)},title:${JSON.stringify(`Codex Style Execution 验收 ${suffix}`)},provider_config_id:${JSON.stringify(acceptance.provider.id)},model_id:'qwen3.7-plus'})`);
  await selectConversation(cdp, acceptance.project.field_id, conversation.id);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')`);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')?.click()`);

  attachScreencast(cdp);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 58, everyNthFrame: 3 });
  recording = true;

  await cdp.eval(setValue('.conversation-composer textarea', task));
  await cdp.eval(`document.querySelector('[data-testid="send-message"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="agent-execution-status"][data-execution-stage="THINKING"]')`, 30_000);
  const thinking = await cdp.eval(`(()=>{const status=document.querySelector('[data-testid="agent-execution-status"]');const turn=status?.closest('[data-agent-turn="true"]');const statusRect=status?.getBoundingClientRect();const turnRect=turn?.getBoundingClientRect();return{text:status?.querySelector('[data-testid="agent-progress-summary"]')?.innerText??'',steps:status?.querySelectorAll('[data-step-state]').length??0,narrative:Boolean(turn?.querySelector('[data-testid="agent-narrative"]')),insideTurn:Boolean(turn),activity:Boolean(turn?.querySelector('[data-testid="conversation-activity-stream"]')),details:Boolean(status?.querySelector('[data-testid="agent-run-details"]')),leftOffset:Math.abs((statusRect?.left??0)-(turnRect?.left??0))};})()`);
  assert.match(thinking.text, /正在思考/);
  assert.equal(thinking.steps, 0);
  assert.equal(thinking.narrative, false);
  assert.equal(thinking.insideTurn, true);
  assert.equal(thinking.activity, true);
  assert.equal(thinking.details, false);
  assert.ok(thinking.leftOffset < 2, JSON.stringify(thinking));
  assert.equal(await cdp.eval(`Boolean(document.querySelector('[data-testid="agent-live-edited-files"]'))`), false);
  screenshots.push(await capture(cdp, screenshotNames[0]));

  const firstRun = await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(conversation.id)}}).then((runs)=>runs[0])`);
  await wait(cdp, `document.querySelector('[data-testid="agent-execution-status"][data-execution-stage="ACTIVE"]')||window.fielora.agent.get({run_id:${JSON.stringify(firstRun.id)}}).then((run)=>['COMPLETED','FAILED','CANCELLED'].includes(run.status))`, 300_000);
  const preDockRun = await cdp.eval(`window.fielora.agent.get({run_id:${JSON.stringify(firstRun.id)}})`);
  assert.equal(['COMPLETED', 'FAILED', 'CANCELLED'].includes(preDockRun.status), false, `Run reached ${preDockRun.status} before producing execution evidence: ${JSON.stringify(preDockRun)}`);
  const dockMetrics = await cdp.eval(`(()=>{const status=document.querySelector('[data-testid="agent-execution-status"]');const trigger=status.querySelector('[data-testid="agent-progress-summary"]');const activity=document.querySelector('[data-testid="conversation-activity-stream"]');const stop=document.querySelector('[data-testid="stop-agent"]');const probe=document.createElement('i');probe.style.color='var(--fl-color-accent)';const glyphProbe=document.createElement('i');glyphProbe.style.color='var(--fl-color-accent-foreground)';document.body.append(probe,glyphProbe);const value={insideTurn:Boolean(status.closest('[data-agent-turn="true"]')),layout:status.dataset.layout,text:trigger?.innerText??'',activityPosition:getComputedStyle(activity).position,details:Boolean(status.querySelector('[data-testid="agent-run-details"]')),stopColor:getComputedStyle(stop).backgroundColor,accentColor:getComputedStyle(probe).color,stopGlyph:getComputedStyle(stop.querySelector('rect')).fill,glyphColor:getComputedStyle(glyphProbe).color,legacy:document.querySelectorAll('[data-testid="agent-live-activity"],[data-testid="agent-execution-inline"]').length};probe.remove();glyphProbe.remove();return value;})()`);
  assert.equal(dockMetrics.insideTurn, true);
  assert.equal(dockMetrics.layout, 'conversation-stream');
  assert.match(dockMetrics.text, /正在执行/);
  assert.match(dockMetrics.text, /第 \d+ \/ \d+ 步/);
  assert.equal(dockMetrics.activityPosition, 'static');
  assert.equal(dockMetrics.details, false);
  assert.equal(dockMetrics.stopColor, dockMetrics.accentColor);
  assert.equal(dockMetrics.stopGlyph, dockMetrics.glyphColor);
  assert.equal(dockMetrics.legacy, 0);
  screenshots.push(await capture(cdp, screenshotNames[1]));

  await wait(cdp, `document.querySelector('[data-testid="conversation-activity-stream"] [data-activity-entry]')`);
  const hover = await cdp.eval(`(()=>{const activity=document.querySelector('[data-testid="conversation-activity-stream"]');const entries=[...activity.querySelectorAll('[data-activity-entry]')];const sequences=entries.map((entry)=>Number(entry.dataset.activitySequence));return{groups:activity.querySelectorAll('[data-testid="conversation-activity-group"]').length,entries:entries.length,chronological:sequences.every((sequence,index)=>index===0||sequence>=sequences[index-1]),details:Boolean(document.querySelector('[data-testid="agent-run-details"]'))};})()`);
  assert.ok(hover.groups > 0, JSON.stringify(hover));
  assert.ok(hover.entries > 0, JSON.stringify(hover));
  assert.equal(hover.chronological, true);
  assert.equal(hover.details, false);
  screenshots.push(await capture(cdp, screenshotNames[2]));

  await cdp.eval(`document.querySelector('[data-testid="agent-progress-summary"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="agent-run-details"]')`);
  const detail = await cdp.eval(`(()=>{const detail=document.querySelector('[data-testid="agent-execution-status"] [data-testid="agent-execution-detail"]');return{text:detail?.innerText??'',privateThink:(detail?.innerText??'').toLowerCase().includes('<think'),operations:detail?.querySelectorAll('.agent-operation-timeline li').length??0};})()`);
  assert.match(detail.text, /操作记录/);
  assert.match(detail.text, /步骤/);
  assert.equal(detail.privateThink, false);
  assert.ok(detail.operations > 0);
  await cdp.eval(`document.querySelector('[data-testid="agent-progress-summary"]')?.click()`);
  const completedSegment = await cdp.eval(`(()=>{const segment=document.querySelector('[data-activity-entry][data-completed-at]');if(!segment)return null;const box=segment.getBoundingClientRect();return{title:segment.title,completedAt:Number(segment.dataset.completedAt),x:box.left+Math.min(box.width-12,Math.max(12,box.width/2)),y:box.top+box.height/2};})()`);
  assert.ok(completedSegment?.completedAt > 0, JSON.stringify(completedSegment));
  assert.match(completedSegment.title, /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: completedSegment.x, y: completedSegment.y });
  await wait(cdp, `getComputedStyle(document.querySelector('[data-activity-entry][data-completed-at] > .agent-completion-time')).visibility==='visible'`);
  assert.equal(await cdp.eval(`document.querySelector('[data-activity-entry][data-completed-at] > .agent-completion-time').innerText`), completedSegment.title);
  screenshots.push(await capture(cdp, screenshotNames[3]));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });

  await cdp.eval(setValue('.conversation-composer textarea', steering));
  await wait(cdp, `document.querySelector('[data-testid="send-steering"]')`);
  await cdp.eval(`document.querySelector('[data-testid="send-steering"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="queued-follow-up-status"]')`);
  const queued = await cdp.eval(`(()=>{const status=document.querySelector('[data-testid="queued-follow-up-status"]');const turn=status?.closest('[data-testid="message-user"]');const style=getComputedStyle(status);return{text:status?.innerText??'',afterRunId:status?.dataset.afterRunId,userText:turn?.querySelector('.message-content')?.innerText??'',size:style.fontSize,weight:style.fontWeight,stop:Boolean(document.querySelector('[data-testid="stop-agent"]'))};})()`);
  assert.equal(queued.afterRunId, firstRun.id);
  assert.match(queued.text, /完成后继续处理/);
  assert.match(queued.userText, new RegExp(acceptanceFile.replaceAll('.', '\\.')));
  assert.deepEqual({ size: queued.size, weight: queued.weight }, { size: '12.5px', weight: '400' });
  screenshots.push(await capture(cdp, screenshotNames[5]));

  const scrollMetrics = await cdp.eval(`(()=>{const list=document.querySelector('.message-list');return{scrollHeight:list.scrollHeight,clientHeight:list.clientHeight};})()`);
  assert.ok(scrollMetrics.scrollHeight > scrollMetrics.clientHeight + 80, JSON.stringify(scrollMetrics));
  await cdp.eval(`(()=>{const list=document.querySelector('.message-list');list.scrollTop=0;list.dispatchEvent(new Event('scroll'));})()`);
  await wait(cdp, `document.querySelector('[data-testid="jump-to-latest"]')`);
  const away = await cdp.eval(`(()=>{const button=document.querySelector('[data-testid="jump-to-latest"]');return{label:button?.getAttribute('aria-label')??'',unseen:button?.classList.contains('has-unseen'),dots:button?.querySelectorAll('.latest-answer-ellipsis i').length??0,arrow:Boolean(button?.querySelector('.shell-icon'))};})()`);
  assert.match(away.label, /跳转到当前任务底部/);
  assert.equal(away.dots, 3);
  assert.equal(away.arrow, false);
  screenshots.push(await capture(cdp, screenshotNames[4]));
  const scrollFrame = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 58 });
  for (let index = 0; index < 8; index += 1) screencastFrames.push(Buffer.from(scrollFrame.data, 'base64'));
  await cdp.eval(`document.querySelector('[data-testid="jump-to-latest"]')?.click()`);
  await wait(cdp, `!document.querySelector('[data-testid="jump-to-latest"]')`);
  await wait(cdp, `(()=>{const list=document.querySelector('.message-list');return list.scrollHeight-list.scrollTop-list.clientHeight<8;})()`);

  await cdp.eval(`document.querySelector('[data-testid="agent-progress-summary"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="agent-live-edited-files"]')||window.fielora.agent.get({run_id:${JSON.stringify(firstRun.id)}}).then((run)=>['COMPLETED','FAILED','CANCELLED'].includes(run.status))`, 180_000);
  const liveRun = await cdp.eval(`window.fielora.agent.get({run_id:${JSON.stringify(firstRun.id)}})`);
  assert.equal(['COMPLETED', 'FAILED', 'CANCELLED'].includes(liveRun.status), false, `Run reached ${liveRun.status} before the live edited-files summary was observable.`);
  const liveStats = await cdp.eval(`(()=>{const root=document.querySelector('[data-testid="agent-live-edited-files"]');const trigger=document.querySelector('[data-testid="agent-progress-summary"]');return{count:Number(root?.dataset.fileCount??0),additions:Number(root?.dataset.additions??0),deletions:Number(root?.dataset.deletions??0),paths:[...root.querySelectorAll('[data-live-review-path]')].map((item)=>item.dataset.liveReviewPath),summary:trigger?.innerText??''};})()`);
  assert.ok(liveStats.count > 0, JSON.stringify(liveStats));
  assert.match(liveStats.summary, new RegExp(`${liveStats.count} 个文件已更改`));
  assert.ok(liveStats.paths.includes(acceptanceFile), JSON.stringify(liveStats));
  screenshots.push(await capture(cdp, liveEditedScreenshotNames[0]));

  const livePopover = await cdp.eval(`(()=>{const root=document.querySelector('[data-testid="agent-live-edited-files"]');const file=root?.querySelector('[data-live-review-path]');const add=getComputedStyle(file.querySelector('b')).color;const del=getComputedStyle(file.querySelector('i')).color;return{path:file?.dataset.liveReviewPath??'',disabled:file?.disabled,add,del};})()`);
  assert.equal(livePopover.path, acceptanceFile);
  assert.notEqual(livePopover.add, livePopover.del);
  screenshots.push(await capture(cdp, liveEditedScreenshotNames[1]));
  assert.equal(livePopover.disabled, false);
  await cdp.eval(`document.querySelector('[data-testid="agent-progress-summary"]')?.click()`);

  await wait(cdp, `window.fielora.agent.get({run_id:${JSON.stringify(firstRun.id)}}).then((run)=>['COMPLETED','FAILED','CANCELLED'].includes(run.status))`, 300_000);
  const firstTerminal = await cdp.eval(`window.fielora.agent.get({run_id:${JSON.stringify(firstRun.id)}})`);
  assert.equal(firstTerminal.status, 'COMPLETED', JSON.stringify(firstTerminal));
  await wait(cdp, `window.fielora.agent.list({conversation_id:${JSON.stringify(conversation.id)}}).then((runs)=>runs.some((run)=>run.id!==${JSON.stringify(firstRun.id)}&&['COMPLETED','FAILED','CANCELLED'].includes(run.status)))`, 240_000);
  await selectConversation(cdp, acceptance.project.field_id, conversation.id);
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}] [data-testid="agent-result-changed-files"]')&&document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}] .agent-terminal-result h2')&&document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}] .agent-terminal-body')`, 90_000);
  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}]')?.scrollIntoView({block:'center'})`);
  const result = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}]');const runtime=turn?.querySelector('.agent-terminal-runtime');const title=turn?.querySelector('.agent-terminal-result h2');const body=turn?.querySelector('.agent-terminal-body');const changed=turn?.querySelector('[data-testid="agent-result-changed-files"]');if(!runtime||!title||!body||!changed)return null;const titleStyle=getComputedStyle(title);const bodyStyle=getComputedStyle(body);return{runtime:runtime.innerText,runtimeBeforeTitle:Boolean(runtime.compareDocumentPosition(title)&Node.DOCUMENT_POSITION_FOLLOWING),title:title.innerText,body:body.innerText,changed:changed.innerText,count:Number(changed.dataset.fileCount??0),additions:Number(changed.dataset.additions??0),deletions:Number(changed.dataset.deletions??0),titleSize:titleStyle.fontSize,titleWeight:titleStyle.fontWeight,bodySize:bodyStyle.fontSize,bodyWeight:bodyStyle.fontWeight};})()`);
  assert.ok(result, 'Terminal result was replaced during the computed-style sample.');
  assert.match(result.runtime, /^耗时 /);
  assert.equal(result.runtimeBeforeTitle, true);
  assert.match(result.title, new RegExp(acceptanceFile.replaceAll('.', '\\.')));
  assert.match(result.changed, /已编辑 1 个文件/);
  assert.deepEqual({ count: result.count, additions: result.additions, deletions: result.deletions }, { count: liveStats.count, additions: liveStats.additions, deletions: liveStats.deletions });
  assert.deepEqual({ size: result.titleSize, weight: result.titleWeight }, { size: '16px', weight: '600' });
  assert.deepEqual({ size: result.bodySize, weight: result.bodyWeight }, { size: '15px', weight: '400' });
  screenshots.push(await capture(cdp, screenshotNames[6]));

  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}] [data-testid="agent-execution-detail-toggle"]')`, 90_000);
  const terminalDisclosure = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}]');const toggle=turn?.querySelector('[data-testid="agent-execution-detail-toggle"]');return{tag:toggle?.tagName??'',parent:toggle?.parentElement?.tagName??'',inline:Boolean(turn?.querySelector('.agent-execution-detail.is-inline'))};})()`);
  assert.deepEqual(terminalDisclosure, { tag: 'BUTTON', parent: 'DIV', inline: false });
  await clickCenter(cdp, `[data-agent-run-id=${JSON.stringify(firstRun.id)}] [data-testid="agent-execution-detail-toggle"]`);
  await cdp.eval('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const terminalClickState = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}]');const toggle=turn?.querySelector('[data-testid="agent-execution-detail-toggle"]');return{expanded:toggle?.getAttribute('aria-expanded')??'',history:Boolean(turn?.querySelector('.agent-execution-detail.is-history [data-testid="conversation-activity-stream"]')),active:document.activeElement===toggle};})()`);
  assert.deepEqual(terminalClickState, { expanded: 'true', history: true, active: true });
  const terminalDetailBeforeTitle = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}]');const detail=turn?.querySelector('.agent-execution-detail.is-history');const title=turn?.querySelector('.agent-terminal-result h2');return Boolean(detail&&title&&(detail.compareDocumentPosition(title)&Node.DOCUMENT_POSITION_FOLLOWING));})()`);
  assert.equal(terminalDetailBeforeTitle, true);
  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}] [data-testid="agent-execution-detail-toggle"]')?.click()`);

  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}] [data-testid="agent-inline-files-expanded"]')`);
  const expanded = await cdp.eval(`(()=>{const summary=document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}] [data-testid="agent-result-changed-files"]');const root=summary?.querySelector('[data-testid="agent-inline-files-expanded"]');const file=root?.querySelector('[data-review-path]');return{text:summary?.innerText??'',path:file?.dataset.reviewPath??'',fullReview:Boolean(summary?.querySelector('.agent-full-review-action'))};})()`);
  assert.equal(expanded.path, acceptanceFile);
  assert.equal(expanded.fullReview, true);
  screenshots.push(await capture(cdp, screenshotNames[7]));
  screenshots.push(await capture(cdp, liveEditedScreenshotNames[2]));

  await cdp.eval(`(()=>{const list=document.querySelector('.message-list');list.scrollTop=0;list.dispatchEvent(new Event('scroll'));})()`);
  await cdp.eval('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const terminalJump = await cdp.eval(`(()=>{const button=document.querySelector('[data-testid="jump-to-latest"]');return{label:button?.getAttribute('aria-label')??'',dots:button?.querySelectorAll('.latest-answer-ellipsis i').length??0,arrow:Boolean(button?.querySelector('.shell-icon'))};})()`);
  assert.match(terminalJump.label, /跳转到最新消息/);
  assert.equal(terminalJump.dots, 0);
  assert.equal(terminalJump.arrow, true);
  await cdp.eval(`document.querySelector('[data-testid="jump-to-latest"]')?.click()`);
  await cdp.eval('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await cdp.eval(`!document.querySelector('[data-testid="jump-to-latest"]')`), true);

  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(firstRun.id)}] [data-review-path=${JSON.stringify(acceptanceFile)}]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="agent-review"]')?.dataset.agentRunId===${JSON.stringify(firstRun.id)}`);
  const review = await cdp.eval(`(()=>{const review=document.querySelector('[data-testid="agent-review"]');return{runId:review?.dataset.agentRunId,text:review?.textContent??'',count:Number(review?.dataset.fileCount??0),additions:Number(review?.dataset.additions??0),deletions:Number(review?.dataset.deletions??0)};})()`);
  assert.equal(review.runId, firstRun.id);
  assert.match(review.text, new RegExp(acceptanceFile.replaceAll('.', '\\.')));
  assert.deepEqual({ count: review.count, additions: review.additions, deletions: review.deletions }, { count: liveStats.count, additions: liveStats.additions, deletions: liveStats.deletions });

  await cdp.send('Page.stopScreencast');
  recording = false;

  const framesDirectory = path.join(isolatedRoot, 'recording-frames');
  await mkdir(framesDirectory, { recursive: true });
  await Promise.all(screencastFrames.map((frame, index) => writeFile(path.join(framesDirectory, `${String(index).padStart(4, '0')}.jpg`), frame)));
  const gif = path.join(evidence, '12-production-execution-flow.gif');
  const python = process.env.FIELORA_PYTHON ?? 'python';
  const composed = spawnSync(python, [path.join(root, 'scripts', 'compose-evidence-gif.py'), framesDirectory, gif], { encoding: 'utf8', windowsHide: true });
  const composedGif = composed.status === 0 ? gif : null;

  process.stdout.write(`${JSON.stringify({
    project: acceptance.project.title,
    model: acceptance.provider.default_model,
    run_id: firstRun.id,
    queued_after_run_id: queued.afterRunId,
    screenshots,
    gif: composedGif,
    gif_warning: composedGif ? null : String(composed.stderr || composed.stdout || 'GIF composition unavailable').trim(),
    screencast_frames: screencastFrames.length,
    dock: dockMetrics,
    review,
  }, null, 2)}\n`);
} catch (reason) {
  process.stderr.write(`${reason instanceof Error ? reason.stack : String(reason)}\n${output.slice(-40).join('')}\n`);
  process.exitCode = 1;
} finally {
  if (cdp && recording) await cdp.send('Page.stopScreencast').catch(() => undefined);
  cdp?.close();
  if (child.exitCode === null) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const resolvedRoot = path.resolve(isolatedRoot);
  if (resolvedRoot.startsWith(path.resolve(tmpdir()) + path.sep)) await rm(resolvedRoot, { recursive: true, force: true }).catch(() => undefined);
}
