import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

if (process.env.FIELORA_REAL_PLAN_MULTIMODAL !== '1') throw new Error('Set FIELORA_REAL_PLAN_MULTIMODAL=1 for real Production acceptance.');

const root = path.resolve(import.meta.dirname, '..', '..');
const planEvidence = path.join(root, 'artifacts', 'agentic-plan-result-review-convergence');
const imageEvidence = path.join(root, 'artifacts', 'multimodal-attachment-fix');
const savedImagePath = process.env.FIELORA_E2E_ATTACHMENT_SAVE_PATH ?? path.join(imageEvidence, 'saved-image.png');
const port = Number(process.env.FIELORA_E2E_DEBUG_PORT ?? 9334);
const scope = process.env.FIELORA_REAL_PLAN_MULTIMODAL_SCOPE ?? 'ALL';
const answerTask = '请用一句话概括当前 web Project 的用途和主要前端技术栈；只回答，不修改文件。';
const suffix = Date.now().toString(36);
const acceptanceFile = `fielora-plan-review-${suffix}.js`;
const createTask = `在当前 web Project 根目录新建 ${acceptanceFile}，内容仅为 export const fieloraPlanReview = true;，不要修改其他文件；完成后运行 node --check ${acceptanceFile} 验证。`;
const modifyTask = `仅修改当前 web Project 根目录的 ${acceptanceFile}：把 export const fieloraPlanReview = true; 改为 export const fieloraPlanReview = { complete: true };，不要修改其他文件；完成后运行 node --check ${acceptanceFile} 验证。`;
const visionTask = '请告诉我图片里主要显示了什么，并明确写出你在图中看到的产品名或界面类型。只回答，不修改文件。';

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
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30_000); this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (reason) => { clearTimeout(timer); reject(reason); } }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

async function connect() {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find((item) => item.type === 'page' && item.url.includes('main_window'));
      if (target) { const cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.open(); await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Page.bringToFront'); return cdp; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Production Fielora Electron target not found.');
}

async function wait(cdp, expression, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await cdp.eval(`(async()=>Boolean(await (${expression})))()`)) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

function setValue(selector, value) {
  return `(()=>{const element=document.querySelector(${JSON.stringify(selector)});const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value');descriptor.set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`;
}

async function capture(cdp, directory, name) {
  await cdp.eval('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const output = path.join(directory, name);
  await writeFile(output, Buffer.from(image.data, 'base64'));
  return output;
}

function powershell(source, env = {}) {
  const encoded = Buffer.from(source, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', encoded], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`PowerShell failed: ${result.stderr || result.stdout}`);
}

function setClipboardImage(imagePath) {
  powershell("Add-Type -AssemblyName System.Drawing; Add-Type -AssemblyName System.Windows.Forms; $image=[Drawing.Image]::FromFile($env:FIELORA_SOURCE_IMAGE); [Windows.Forms.Clipboard]::SetImage($image); $image.Dispose()", { FIELORA_SOURCE_IMAGE: imagePath });
}

async function nativePaste(cdp) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, modifiers: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, modifiers: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17 });
}

async function resize(cdp, width, height) {
  void cdp;
  powershell(`Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class FieloraWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder value, int count);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int width, int height, uint flags);
  public static IntPtr Find() { IntPtr found=IntPtr.Zero; EnumWindows((h,p)=>{var title=new StringBuilder(256);GetWindowText(h,title,256);if(IsWindowVisible(h)&&title.ToString()=="Fielora")found=h;return true;},IntPtr.Zero);return found; }
}
'@; $handle=[FieloraWindow]::Find(); if($handle -eq [IntPtr]::Zero){throw 'Fielora window not found'}; [FieloraWindow]::ShowWindow($handle,9)|Out-Null; [FieloraWindow]::SetWindowPos($handle,[IntPtr]::Zero,30,20,[int]$env:FIELORA_WIDTH,[int]$env:FIELORA_HEIGHT,64)|Out-Null`, { FIELORA_WIDTH: String(width), FIELORA_HEIGHT: String(height) });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

async function selectConversation(cdp, projectId, conversationId) {
  await cdp.send('Page.reload');
  await wait(cdp, `document.querySelector('[data-testid="project-${projectId}"]')`, 60_000);
  await cdp.eval(`document.querySelector('[data-testid="project-${projectId}"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-${conversationId}"]')`, 30_000);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${conversationId}"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-composer"]')`);
}

async function fullControl(cdp) {
  await cdp.eval(`document.querySelector('[data-testid="composer-permission"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')`);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')?.click()`);
}

async function createConversation(cdp, project, provider, title) {
  const conversation = await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:${JSON.stringify(title)},provider_config_id:${JSON.stringify(provider.id)},model_id:${JSON.stringify(provider.default_model)}})`);
  await selectConversation(cdp, project.field_id, conversation.id);
  return conversation;
}

async function send(cdp, task) {
  await cdp.eval(setValue('.conversation-composer textarea', task));
  await cdp.eval(`document.querySelector('[data-testid="send-message"]')?.click()`);
}

async function latestRun(cdp, conversationId) {
  return cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(conversationId)}}).then((runs)=>runs[0])`);
}

async function waitTerminal(cdp, conversationId, timeout = 240_000) {
  await wait(cdp, `window.fielora.agent.list({conversation_id:${JSON.stringify(conversationId)}}).then((runs)=>runs[0]&&['COMPLETED','FAILED','CANCELLED'].includes(runs[0].status))`, timeout);
  const run = await latestRun(cdp, conversationId);
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(run.id)}]')`, 30_000);
  return run;
}

await Promise.all([mkdir(planEvidence, { recursive: true }), mkdir(imageEvidence, { recursive: true })]);
const cdp = await connect();
const planScreenshots = [];
const imageScreenshots = [];

try {
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`, 90_000);
  await resize(cdp, 1600, 920);
  const acceptance = await cdp.eval(`(async()=>{const projects=await window.fielora.project.list();const providers=await window.fielora.provider.list();return{project:projects.find((item)=>item.title==='web'),provider:providers.find((item)=>item.default_model==='qwen3.7-plus'&&item.lifecycle_status==='ACTIVE'&&item.credential_present)}})()`);
  assert.equal(acceptance.project?.title, 'web');
  assert.equal(acceptance.provider?.default_model, 'qwen3.7-plus');
  assert.equal(acceptance.provider?.credential_present, true);

  if (scope === 'MODIFY_ONLY') {
    console.error('modify-only: start');
    const file = process.env.FIELORA_REVIEW_FILE ?? 'fielora-plan-review-mt3u1bn8.js';
    const conversation = await createConversation(cdp, acceptance.project, acceptance.provider, `Plan MODIFY Review 验收 ${suffix}`);
    await fullControl(cdp);
    await send(cdp, `仅修改当前 web Project 根目录的 ${file}：把 export const fieloraPlanReview = { complete: true }; 改为 export const fieloraPlanReview = { complete: true, reviewed: true };，不要修改其他文件；完成后运行 node --check ${file} 验证。`);
    const run = await waitTerminal(cdp, conversation.id, 240_000);
    assert.equal(run.status, 'COMPLETED', JSON.stringify(run));
    await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(run.id)}] [data-testid="agent-change-review"]')`, 60_000);
    await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(run.id)}] [data-testid="agent-change-review"]')?.click()`);
    await wait(cdp, `document.querySelector('[data-testid="agent-review-human-diff"][data-human-diff-kind="structured"]')`, 30_000);
    const review = await cdp.eval(`(()=>{const root=document.querySelector('[data-testid="agent-review"]');return{runId:root?.dataset.agentRunId,type:root?.querySelector('[data-testid="agent-review-file"]')?.dataset.changeType,visual:Boolean(root?.querySelector('[data-testid="agent-review-human-diff"]')),raw:Boolean(root?.querySelector('[data-testid="agent-review-diff"]')),text:root?.innerText??''};})()`);
    assert.equal(review.runId, run.id); assert.equal(review.type, 'MODIFY'); assert.equal(review.visual, true); assert.equal(review.raw, false); assert.match(review.text, /修改前.*修改后/s);
    await resize(cdp, 1600, 920);
    planScreenshots.push(await capture(cdp, planEvidence, '06-modify-review.png'));
    planScreenshots.push(await capture(cdp, planEvidence, '08-review-wide-window.png'));
    await resize(cdp, 1200, 760);
    await wait(cdp, `getComputedStyle(document.querySelector('.workspace-panel')).position==='absolute'`);
    const narrow = await cdp.eval(`(()=>{const conversation=document.querySelector('.conversation-column').getBoundingClientRect();const composer=document.querySelector('.conversation-composer').getBoundingClientRect();const panel=document.querySelector('.workspace-panel').getBoundingClientRect();return{conversation:conversation.width,composer:composer.width,review:panel.width,reviewLeft:panel.left,reviewRight:panel.right,viewport:innerWidth};})()`);
    assert.ok(narrow.conversation >= 640, JSON.stringify(narrow)); assert.ok(narrow.composer >= 600, JSON.stringify(narrow)); assert.ok(narrow.reviewLeft < narrow.viewport && narrow.reviewRight <= narrow.viewport + 1, JSON.stringify(narrow));
    planScreenshots.push(await capture(cdp, planEvidence, '07-review-narrow-window.png'));
    process.stdout.write(`${JSON.stringify({ project: acceptance.project.title, model: acceptance.provider.default_model, run_id: run.id, review, narrow, planScreenshots }, null, 2)}\n`);
    cdp.close();
    process.exit(0);
  }

  if (scope === 'MULTIMODAL_ONLY' || scope === 'NARROW_ONLY' || scope === 'REVIEW_ONLY') {
    console.error('resume: narrow review');
    const recentModify = process.env.FIELORA_REVIEW_CONVERSATION_ID
      ? { id: process.env.FIELORA_REVIEW_CONVERSATION_ID }
      : await cdp.eval(`window.fielora.conversation.list({field_id:${JSON.stringify(acceptance.project.field_id)}}).then((items)=>items.find((item)=>item.title.startsWith('Plan MODIFY 验收'))) `);
    assert.ok(recentModify?.id);
    await selectConversation(cdp, acceptance.project.field_id, recentModify.id);
    const recentRun = process.env.FIELORA_REVIEW_RUN_ID
      ? { id: process.env.FIELORA_REVIEW_RUN_ID, status: 'COMPLETED' }
      : await latestRun(cdp, recentModify.id);
    assert.equal(recentRun.status, 'COMPLETED');
    await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(recentRun.id)}] [data-testid="agent-change-review"]')`, 60_000);
    await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(recentRun.id)}] [data-testid="agent-change-review"]')?.click()`);
    await wait(cdp, `document.querySelector('[data-testid="agent-review"]')`);
    if (scope === 'REVIEW_ONLY') {
      await resize(cdp, 1600, 920);
      await wait(cdp, `document.querySelector('[data-testid="agent-review-human-diff"][data-human-diff-kind="structured"]')`);
      const review = await cdp.eval(`(()=>{const root=document.querySelector('[data-testid="agent-review"]');return{runId:root?.dataset.agentRunId,type:root?.querySelector('[data-testid="agent-review-file"]')?.dataset.changeType,visual:Boolean(root?.querySelector('[data-testid="agent-review-human-diff"]')),raw:Boolean(root?.querySelector('[data-testid="agent-review-diff"]')),text:root?.innerText??''};})()`);
      assert.equal(review.runId, recentRun.id); assert.equal(review.type, 'MODIFY'); assert.equal(review.visual, true); assert.equal(review.raw, false); assert.match(review.text, /修改前.*修改后/s);
      planScreenshots.push(await capture(cdp, planEvidence, '06-modify-review.png'));
      planScreenshots.push(await capture(cdp, planEvidence, '08-review-wide-window.png'));
    }
    await resize(cdp, 1200, 760);
    await wait(cdp, `getComputedStyle(document.querySelector('.workspace-panel')).position==='absolute'`);
    const narrow = await cdp.eval(`(()=>{const conversation=document.querySelector('.conversation-column').getBoundingClientRect();const composer=document.querySelector('.conversation-composer').getBoundingClientRect();const review=document.querySelector('.workspace-panel').getBoundingClientRect();return{conversation:conversation.width,composer:composer.width,review:review.width,reviewLeft:review.left,reviewRight:review.right,viewport:innerWidth};})()`);
    assert.ok(narrow.conversation >= 640, JSON.stringify(narrow)); assert.ok(narrow.composer >= 600, JSON.stringify(narrow)); assert.ok(narrow.review <= 560, JSON.stringify(narrow)); assert.ok(narrow.reviewLeft < narrow.viewport && narrow.reviewRight <= narrow.viewport + 1, JSON.stringify(narrow));
    planScreenshots.push(await capture(cdp, planEvidence, '07-review-narrow-window.png'));
    if (scope === 'NARROW_ONLY' || scope === 'REVIEW_ONLY') {
      process.stdout.write(`${JSON.stringify({ project: acceptance.project.title, model: acceptance.provider.default_model, narrow, planScreenshots }, null, 2)}\n`);
      cdp.close();
      process.exit(0);
    }
  }

  if (scope !== 'MULTIMODAL_ONLY') {
  console.error('plan: answer');
  const answerConversation = await createConversation(cdp, acceptance.project, acceptance.provider, `Plan Answer 验收 ${suffix}`);
  await send(cdp, answerTask);
  const answerRun = await waitTerminal(cdp, answerConversation.id);
  assert.equal(answerRun.status, 'COMPLETED');
  const answer = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(answerRun.id)}]');turn?.scrollIntoView({block:'center'});return{kind:turn?.dataset.agentKind,answer:Boolean(turn?.querySelector('[data-testid="agent-answer"]')),plan:turn?.querySelectorAll('[data-testid="agent-live-activity"],[data-testid="agent-terminal-result"],[data-testid="agent-steps-toggle"]').length,text:turn?.innerText??''};})()`);
  assert.equal(answer.kind, 'ANSWER'); assert.equal(answer.answer, true); assert.equal(answer.plan, 0);
  planScreenshots.push(await capture(cdp, planEvidence, '01-answer.png'));

  const createConversationView = await createConversation(cdp, acceptance.project, acceptance.provider, `Plan CREATE 验收 ${suffix}`);
  await fullControl(cdp);
  await send(cdp, createTask);
  await wait(cdp, `window.fielora.agent.list({conversation_id:${JSON.stringify(createConversationView.id)}}).then((runs)=>runs[0]&&['QUEUED','RUNNING','WAITING_APPROVAL'].includes(runs[0].status))&&document.querySelector('[data-testid="agent-live-activity"]')`, 30_000);
  const createRun = await latestRun(cdp, createConversationView.id);
  const running = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(createRun.id)}]');turn?.scrollIntoView({block:'center'});const toggle=turn?.querySelector('[data-testid="agent-steps-toggle"]');return{narrative:Boolean(turn?.querySelector('[data-testid="agent-narrative"]')),activity:Boolean(turn?.querySelector('[data-testid="agent-live-activity"]')),current:Number(toggle?.dataset.stepCurrent),total:Number(toggle?.dataset.stepTotal),runId:turn?.dataset.agentRunId,userMessageId:turn?.dataset.userMessageId};})()`);
  assert.equal(running.narrative && running.activity, true); assert.ok(running.total >= 3 && running.total <= 6); assert.equal(running.runId, createRun.id); assert.ok(running.userMessageId);
  planScreenshots.push(await capture(cdp, planEvidence, '02-action-plan-running.png'));
  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(createRun.id)}] [data-testid="agent-steps-toggle"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(createRun.id)}] [data-testid="agent-inline-steps"]')`);
  const plan = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(createRun.id)}]');return{steps:turn?.querySelectorAll('[data-step-state]').length,checkmarks:/[✓✔✅]/u.test(turn?.innerText??''),states:[...turn.querySelectorAll('[data-step-state]')].map((item)=>item.dataset.stepState)};})()`);
  assert.equal(plan.steps, running.total); assert.equal(plan.checkmarks, false); assert.ok(plan.states.includes('active') || plan.states.includes('completed'));
  planScreenshots.push(await capture(cdp, planEvidence, '03-action-plan-expanded.png'));

  const createTerminal = await waitTerminal(cdp, createConversationView.id);
  assert.equal(createTerminal.status, 'COMPLETED', JSON.stringify(createTerminal));
  const result = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(createTerminal.id)}]');turn?.scrollIntoView({block:'center'});const title=turn?.querySelector('.agent-terminal-result h2');const body=turn?.querySelector('.agent-terminal-body');const meta=turn?.querySelector('.agent-terminal-meta');const action=turn?.querySelector('.agent-terminal-actions button');const style=(element)=>{const value=getComputedStyle(element);return{size:value.fontSize,weight:value.fontWeight,line:value.lineHeight};};return{live:Boolean(turn?.querySelector('[data-testid="agent-live-activity"]')),terminal:Boolean(turn?.querySelector('[data-testid="agent-terminal-result"]')),review:Boolean(turn?.querySelector('[data-testid="agent-change-review"]')),steps:Boolean(turn?.querySelector('[data-testid="agent-steps-toggle"]')),title:title?.innerText??'',body:body?.innerText??'',titleStyle:style(title),bodyStyle:style(body),metaStyle:style(meta),actionStyle:style(action)};})()`);
  assert.equal(result.terminal && !result.live && result.review && result.steps, true);
  assert.deepEqual({ size: result.titleStyle.size, weight: result.titleStyle.weight }, { size: '17px', weight: '600' });
  assert.deepEqual({ size: result.bodyStyle.size, weight: result.bodyStyle.weight }, { size: '15px', weight: '400' });
  assert.deepEqual({ size: result.metaStyle.size, weight: result.metaStyle.weight }, { size: '13px', weight: '400' });
  assert.deepEqual({ size: result.actionStyle.size, weight: result.actionStyle.weight }, { size: '13px', weight: '500' });
  assert.doesNotMatch(result.body, /变更：|验证：|[✅]/u);
  planScreenshots.push(await capture(cdp, planEvidence, '04-action-result.png'));

  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(createTerminal.id)}] [data-testid="agent-change-review"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="agent-review"]')`);
  const createReview = await cdp.eval(`(()=>{const review=document.querySelector('[data-testid="agent-review"]');return{runId:review?.dataset.agentRunId,type:review?.querySelector('[data-testid="agent-review-file"]')?.dataset.changeType,text:review?.innerText??'',kind:review?.querySelector('[data-human-diff-kind]')?.dataset.humanDiffKind};})()`);
  assert.equal(createReview.runId, createTerminal.id); assert.equal(createReview.type, 'CREATE'); assert.equal(createReview.kind, 'create'); assert.doesNotMatch(createReview.text, /修改前\s*无/);
  planScreenshots.push(await capture(cdp, planEvidence, '05-create-review.png'));
  await cdp.eval(`document.querySelector('[data-testid="workspace-close"]')?.click()`);

  const modifyConversationView = await createConversation(cdp, acceptance.project, acceptance.provider, `Plan MODIFY 验收 ${suffix}`);
  await fullControl(cdp); await send(cdp, modifyTask);
  const modifyRun = await waitTerminal(cdp, modifyConversationView.id);
  assert.equal(modifyRun.status, 'COMPLETED', JSON.stringify(modifyRun));
  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(modifyRun.id)}] [data-testid="agent-change-review"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="agent-review"]')`);
  const modifyReview = await cdp.eval(`(()=>{const review=document.querySelector('[data-testid="agent-review"]');return{runId:review?.dataset.agentRunId,type:review?.querySelector('[data-testid="agent-review-file"]')?.dataset.changeType,visual:Boolean(review?.querySelector('[data-testid="agent-review-human-diff"]')),raw:Boolean(review?.querySelector('[data-testid="agent-review-diff"]')),unsafe:(review?.innerText??'').includes('修改前内容请查看原始 Diff')};})()`);
  assert.equal(modifyReview.runId, modifyRun.id); assert.equal(modifyReview.type, 'MODIFY'); assert.equal(modifyReview.visual, true); assert.equal(modifyReview.raw, false); assert.equal(modifyReview.unsafe, false);
  planScreenshots.push(await capture(cdp, planEvidence, '06-modify-review.png'));
  planScreenshots.push(await capture(cdp, planEvidence, '08-review-wide-window.png'));
  await resize(cdp, 1200, 760);
  await wait(cdp, `getComputedStyle(document.querySelector('.workspace-panel')).position==='absolute'`);
  const narrow = await cdp.eval(`(()=>{const conversation=document.querySelector('.conversation-column').getBoundingClientRect();const composer=document.querySelector('.conversation-composer').getBoundingClientRect();const review=document.querySelector('.workspace-panel').getBoundingClientRect();return{conversation:conversation.width,composer:composer.width,review:review.width,viewport:innerWidth};})()`);
  assert.ok(narrow.conversation >= 640, JSON.stringify(narrow)); assert.ok(narrow.composer >= 600, JSON.stringify(narrow)); assert.ok(narrow.review <= 560, JSON.stringify(narrow));
  planScreenshots.push(await capture(cdp, planEvidence, '07-review-narrow-window.png'));
  }

  console.error('multimodal: prepare');
  await resize(cdp, 1500, 900);
  const visionConversation = await createConversation(cdp, acceptance.project, acceptance.provider, `Qwen Vision 验收 ${suffix}`);
  const sourceScreenshot = await capture(cdp, imageEvidence, 'recognizable-fielora-source.png');
  setClipboardImage(sourceScreenshot);
  await cdp.eval(`document.querySelector('.conversation-composer textarea')?.focus()`);
  await nativePaste(cdp);
  console.error('multimodal: pasted');
  await wait(cdp, `document.querySelector('[data-testid="attachment-thumbnail-composer"] img[src^="data:image/png"]')`, 30_000);
  const composerImage = await cdp.eval(`(()=>{const root=document.querySelector('[data-testid="attachment-thumbnail-composer"]');const image=root?.querySelector('img');return{model:document.querySelector('.composer-model-label')?.innerText??'',source:image?.src.slice(0,22),width:image?.naturalWidth,height:image?.naturalHeight,toast:document.querySelector('.project-toast')?.innerText??'',remove:Boolean(root?.querySelector('button[aria-label^="移除"]'))};})()`);
  assert.equal(composerImage.model, 'qwen3.7-plus'); assert.match(composerImage.source, /^data:image\/png;base64/); assert.ok(composerImage.width > 0 && composerImage.height > 0); assert.doesNotMatch(composerImage.toast, /不支持图片|尚未启用图片/);
  imageScreenshots.push(await capture(cdp, imageEvidence, '01-qwen-image-capability.png'));
  imageScreenshots.push(await capture(cdp, imageEvidence, '02-composer-image-thumbnail.png'));
  await cdp.eval(`document.querySelector('[data-testid="attachment-thumbnail-composer"] .attachment-thumbnail-image')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="image-preview"]')`);
  imageScreenshots.push(await capture(cdp, imageEvidence, '03-image-lightbox.png'));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await wait(cdp, `!document.querySelector('[data-testid="image-preview"]')`);

  await send(cdp, visionTask);
  console.error('multimodal: sent');
  await wait(cdp, `document.querySelector('[data-testid="conversation-image-attachments"] img[src^="data:image/png"]')`, 30_000);
  imageScreenshots.push(await capture(cdp, imageEvidence, '04-sent-image-in-conversation.png'));
  await cdp.eval(`(()=>{const image=document.querySelector('[data-testid="conversation-image-attachments"] img');const rect=image.getBoundingClientRect();image.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:rect.left+20,clientY:rect.top+20,button:2}));})()`);
  await wait(cdp, `document.querySelector('[data-testid="image-context-menu"]')`);
  imageScreenshots.push(await capture(cdp, imageEvidence, '05-image-context-menu.png'));
  const sentAttachment = await cdp.eval(`(()=>{const message=document.querySelector('[data-testid="conversation-image-attachments"]')?.closest('[data-message-id]');const key='fielora:conversation-message-attachments:'+message.dataset.messageId;return JSON.parse(localStorage.getItem(key))[0];})()`);
  const original = await cdp.eval(`window.fielora.workspace.readAttachment({content_ref:${JSON.stringify(sentAttachment.content_ref)}})`);
  const copied = await cdp.eval(`window.fielora.workspace.copyAttachment({content_ref:${JSON.stringify(sentAttachment.content_ref)}})`);
  assert.equal(copied.copied, true);
  assert.equal(copied.width, sentAttachment.width);
  assert.equal(copied.height, sentAttachment.height);
  await cdp.eval(`document.querySelector('[data-testid="image-context-menu"] [role="menuitem"]')?.click()`);
  await wait(cdp, `!document.querySelector('[data-testid="image-context-menu"]')`);
  await cdp.eval(`(()=>{const image=document.querySelector('[data-testid="conversation-image-attachments"] img');const rect=image.getBoundingClientRect();image.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:rect.left+20,clientY:rect.top+20,button:2}));})()`);
  await wait(cdp, `document.querySelectorAll('[data-testid="image-context-menu"] [role="menuitem"]').length===2`);
  await cdp.eval(`document.querySelectorAll('[data-testid="image-context-menu"] [role="menuitem"]')[1]?.click()`);
  await wait(cdp, `window.fielora.agent.list({conversation_id:${JSON.stringify(visionConversation.id)}}).then((runs)=>runs[0])`, 30_000);
  const visionRun = await waitTerminal(cdp, visionConversation.id, 240_000);
  console.error(`multimodal: terminal ${visionRun.status}`);
  assert.equal(visionRun.status, 'COMPLETED', JSON.stringify(visionRun));
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(visionRun.id)}]')?.innerText.trim().length>0`, 30_000);
  const vision = await cdp.eval(`(()=>{const turn=document.querySelector('[data-agent-run-id=${JSON.stringify(visionRun.id)}]');turn?.scrollIntoView({block:'center'});const image=document.querySelector('[data-testid="conversation-image-attachments"] img');return{model:${JSON.stringify(visionRun.model_id)},answer:turn?.innerText??'',imageVisible:Boolean(image),imageOpens:(image?.closest('button')?.disabled===false)};})()`);
  assert.equal(vision.model, 'qwen3.7-plus'); assert.equal(vision.imageVisible && vision.imageOpens, true); assert.match(vision.answer, /Fielora|项目|对话|工作区|桌面|开发|编程/i);
  imageScreenshots.push(await capture(cdp, imageEvidence, '06-qwen-image-response.png'));

  const expectedBytes = Buffer.from(original.data_url.slice(original.data_url.indexOf(',') + 1), 'base64');
  const savedBytes = await readFile(savedImagePath);
  assert.deepEqual(savedBytes, expectedBytes);
  assert.equal((await stat(savedImagePath)).size, sentAttachment.size);

  process.stdout.write(`${JSON.stringify({
    project: acceptance.project.title,
    model: acceptance.provider.default_model,
    ...(scope === 'MULTIMODAL_ONLY' ? {} : {
      answer: { run_id: answerRun.id, ...answer },
      action: { create_run_id: createTerminal.id, modify_run_id: modifyRun.id, running, result, createReview, modifyReview, narrow },
    }),
    multimodal: { run_id: visionRun.id, composerImage, sentAttachment, answer: vision.answer, savedImagePath },
    planScreenshots,
    imageScreenshots,
  }, null, 2)}\n`);
} finally {
  cdp.close();
}
