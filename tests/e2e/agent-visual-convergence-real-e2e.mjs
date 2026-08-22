import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

if (process.env.FIELORA_REAL_QWEN_UX !== '1') {
  throw new Error('Set FIELORA_REAL_QWEN_UX=1 to authorize this real Project / real provider acceptance run.');
}

const root = path.resolve(import.meta.dirname, '..', '..');
const evidence = process.env.FIELORA_REAL_QWEN_UX_EVIDENCE_DIR
  ?? path.join(root, 'artifacts', 'agentic-ux-visual-convergence');
const port = Number(process.env.FIELORA_E2E_DEBUG_PORT ?? 9334);
const requestedTask = process.env.FIELORA_REAL_QWEN_UX_TASK ?? [
  '只检查 finance-add.controller.js 中“用户”字段的三处规则：',
  'oContacterVld.check 是否为 false，oSuccessRequired 和 oInvoiceRequired 中 iContacter 是否都为 0。',
  '如果三处已经满足，就直接报告无需修改；不要更改其他文件或运行全仓库命令。',
].join('');

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
  }
  async open() {
    if (this.socket.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        this.socket.addEventListener('open', resolve, { once: true });
        this.socket.addEventListener('error', reject, { once: true });
      });
    }
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

async function connect() {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Fielora Electron target not found on port ${port}.`);
}

async function wait(cdp, expression, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await cdp.eval(`(async()=>Boolean(await (${expression})))()`)) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

function setValue(selector, value) {
  return `(()=>{const element=document.querySelector(${JSON.stringify(selector)});const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value');descriptor.set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`;
}

async function capture(cdp, name) {
  await cdp.eval('new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const output = path.join(evidence, name);
  await writeFile(output, Buffer.from(screenshot.data, 'base64'));
  return output;
}

await mkdir(evidence, { recursive: true });
const cdp = await connect();

try {
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`, 60_000);
  const acceptance = await cdp.eval(`(async()=>{
    const projects=await window.fielora.project.list();
    const project=projects.find((item)=>item.title==='web');
    const providers=await window.fielora.provider.list();
    const provider=providers.find((item)=>item.default_model==='qwen3.7-plus'&&item.lifecycle_status==='ACTIVE'&&item.credential_present);
    if(!project||!provider)return{project:null,provider:null,conversation:null};
    const conversations=await window.fielora.conversation.list({field_id:project.field_id});
    const withRuns=await Promise.all(conversations.map(async(item)=>({item,runs:await window.fielora.agent.list({conversation_id:item.id})})));
    const failed=withRuns.find(({item,runs})=>item.model_id==='qwen3.7-plus'&&runs.some((run)=>run.status==='FAILED'));
    const selected=failed?.item??conversations.find((item)=>item.model_id==='qwen3.7-plus')??await window.fielora.conversation.create({field_id:project.field_id,title:'Agentic UX 真实验收',provider_config_id:provider.id,model_id:provider.default_model});
    return{project,provider,conversation:selected};
  })()`);
  assert.equal(acceptance.project?.title, 'web');
  assert.equal(acceptance.provider?.default_model, 'qwen3.7-plus');
  assert.equal(acceptance.provider?.credential_present, true);

  const projectId = acceptance.project.field_id;
  const conversationId = acceptance.conversation.id;
  await cdp.eval(`document.querySelector('[data-testid="project-${projectId}"]')?.click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-${conversationId}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${conversationId}"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-composer"]')&&window.fielora.conversation.get({conversation_id:${JSON.stringify(conversationId)}}).then((item)=>item.model_id==='qwen3.7-plus')`);

  const failedTurn = await cdp.eval(`(()=>{const turns=[...document.querySelectorAll('[data-agent-turn="true"].is-terminal')];const turn=[...turns].reverse().find((item)=>item.dataset.agentState==='FAILED'||item.innerText.includes('这次没有完成'));turn?.scrollIntoView({block:'center'});return Boolean(turn);})()`);
  assert.equal(failedTurn, true, 'a real historical failed Qwen turn is required for the failure visual');
  await capture(cdp, '03-real-failed-or-partial.png');

  const initialReviewAvailable = await cdp.eval(`(()=>{const turns=[...document.querySelectorAll('[data-agent-turn="true"].is-terminal')];const turn=[...turns].reverse().find((item)=>item.querySelector('[data-testid="agent-change-review"]'));turn?.querySelector('[data-testid="agent-change-review"]')?.click();return Boolean(turn);})()`);
  if (initialReviewAvailable) {
    await wait(cdp, `document.querySelector('[data-testid="agent-review"]')`);
    await cdp.eval(`document.querySelector('[data-testid="agent-review-human"]')?.click()`);
    await wait(cdp, `document.querySelector('[data-testid="agent-review"]')?.dataset.reviewMode==='HUMAN'&&document.querySelector('[data-testid="agent-review-human-diff"]')`);
    const humanReview = await cdp.eval(`(()=>{const root=document.querySelector('[data-testid="agent-review"]');return{mode:root.dataset.reviewMode,hasHuman:Boolean(root.querySelector('[data-testid="agent-review-human-diff"]')),hasRaw:Boolean(root.querySelector('[data-testid="agent-review-diff"]')),summary:root.innerText,files:root.querySelectorAll('[data-testid="agent-review-file"]').length};})()`);
    assert.equal(humanReview.mode, 'HUMAN');
    assert.equal(humanReview.hasHuman && !humanReview.hasRaw && humanReview.files > 0, true);
    assert.match(humanReview.summary, /本次任务|修改目标|已修改文件|可视化|原始 Diff/);
    await capture(cdp, '05-real-human-review.png');
    await cdp.eval(`document.querySelector('[data-testid="agent-review-raw"]').click()`);
    await wait(cdp, `document.querySelector('[data-testid="agent-review"]')?.dataset.reviewMode==='RAW'&&document.querySelector('[data-testid="agent-review-diff"]')`);
    const rawReview = await cdp.eval(`(()=>{const diff=document.querySelector('[data-testid="agent-review-diff"]');return{content:diff.innerText,font:getComputedStyle(diff).fontFamily,human:document.querySelectorAll('[data-testid="agent-review-human-diff"]').length};})()`);
    assert.match(rawReview.content, /^--- a\//);
    assert.match(rawReview.content, /^@@/m);
    assert.match(rawReview.content, /^-/m);
    assert.match(rawReview.content, /^\+/m);
    assert.equal(rawReview.font, '"Cascadia Code", Consolas, monospace');
    assert.equal(rawReview.human, 0);
    await capture(cdp, '06-real-raw-diff.png');
    await cdp.eval(`document.querySelector('[data-testid="workspace-close"]').click()`);
    await wait(cdp, `document.querySelector('[data-testid="workspace-panel"]')?.getAttribute('aria-hidden')==='true'`);
  }

  await cdp.eval(`document.querySelector('[data-testid="composer-permission"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]')`);
  await cdp.eval(`document.querySelector('[data-testid="composer-permission-option-FULL_CONTROL"]').click()`);
  await cdp.eval(setValue('.conversation-composer textarea', requestedTask));
  await cdp.eval(`document.querySelector('[data-testid="send-message"]').click()`);
  await wait(cdp, `window.fielora.agent.list({conversation_id:${JSON.stringify(conversationId)}}).then((runs)=>runs[0]?.model_id==='qwen3.7-plus'&&['RUNNING','WAITING_APPROVAL'].includes(runs[0]?.status))&&document.querySelector('[data-agent-state="RUNNING"],[data-agent-state="WAITING_APPROVAL"]')`, 30_000);

  const running = await cdp.eval(`(async()=>{const run=(await window.fielora.agent.list({conversation_id:${JSON.stringify(conversationId)}}))[0];const turn=document.querySelector('[data-agent-run-id="'+run.id+'"]');const user=document.querySelector('[data-message-id="'+turn?.dataset.userMessageId+'"]');turn?.scrollIntoView({block:'center'});const narrative=turn?.querySelector('[data-testid="agent-narrative"]')?.innerText.trim()??'';const activity=turn?.querySelector('[data-testid="agent-live-activity"]')?.innerText.trim()??'';return{runId:run.id,status:run.status,model:run.model_id,turnRunId:turn?.dataset.agentRunId,userMessageId:turn?.dataset.userMessageId,userBeforeTurn:Boolean(user&&turn&&(user.compareDocumentPosition(turn)&Node.DOCUMENT_POSITION_FOLLOWING)),liveInside:Boolean(turn?.querySelector('[data-testid="agent-live-activity"]')),terminalInside:Boolean(turn?.querySelector('[data-testid="agent-terminal-result"]')),narrative,activity,legacy:document.querySelectorAll('[data-testid="agent-run-card"],[data-testid="agent-process-toggle"],[data-testid="agent-change-summary"],[data-testid="agent-activity-body"]').length};})()`);
  assert.equal(running.model, 'qwen3.7-plus');
  assert.equal(running.turnRunId, running.runId);
  assert.equal(running.userBeforeTurn && running.liveInside && !running.terminalInside, true);
  assert.equal(running.legacy, 0);
  assert.notEqual(running.narrative, running.activity);
  assert.equal(running.activity.includes(running.narrative), false);
  await capture(cdp, '01-real-running.png');

  const twoTurns = await cdp.eval(`(()=>{const active=document.querySelector('[data-agent-run-id="${running.runId}"]');const user=document.querySelector('[data-message-id="'+active.dataset.userMessageId+'"]');const previous=[...document.querySelectorAll('[data-agent-turn="true"].is-terminal')].findLast((item)=>item!==active);previous?.scrollIntoView({block:'start'});return{previousTerminal:Boolean(previous?.querySelector('[data-testid="agent-terminal-result"]')),previousBeforeUser:Boolean(previous&&user&&(previous.compareDocumentPosition(user)&Node.DOCUMENT_POSITION_FOLLOWING)),userBeforeActivity:Boolean(user&&active&&(user.compareDocumentPosition(active)&Node.DOCUMENT_POSITION_FOLLOWING)),liveInside:Boolean(active.querySelector('[data-testid="agent-live-activity"]'))};})()`);
  assert.equal(Object.values(twoTurns).every(Boolean), true);
  await capture(cdp, '04-real-two-turns.png');

  await wait(cdp, `window.fielora.agent.get({run_id:${JSON.stringify(running.runId)}}).then((run)=>['COMPLETED','FAILED','CANCELLED'].includes(run.status))&&document.querySelector('[data-agent-run-id="${running.runId}"] [data-testid="agent-terminal-result"]')`, 180_000);
  const terminal = await cdp.eval(`(async()=>{const run=await window.fielora.agent.get({run_id:${JSON.stringify(running.runId)}});const turn=document.querySelector('[data-agent-run-id="'+run.id+'"]');turn.scrollIntoView({block:'center'});const title=turn.querySelector('.agent-terminal-result > h2');const body=turn.querySelector('.agent-terminal-body .markdown-body');const meta=turn.querySelector('.agent-terminal-meta');const action=turn.querySelector('.agent-terminal-actions button');const style=(element)=>{if(!element)return null;const value=getComputedStyle(element);return{family:value.fontFamily,size:value.fontSize,weight:value.fontWeight,line:value.lineHeight};};return{status:run.status,errorCode:run.error_code,terminalInside:Boolean(turn.querySelector('[data-testid="agent-terminal-result"]')),liveInside:Boolean(turn.querySelector('[data-testid="agent-live-activity"]')),review:Boolean(turn.querySelector('[data-testid="agent-change-review"]')),title:title?.innerText??'',text:turn.innerText,titleStyle:style(title),bodyStyle:style(body),metaStyle:style(meta),actionStyle:style(action),legacy:document.querySelectorAll('[data-testid="agent-run-card"],[data-testid="agent-process-toggle"],[data-testid="agent-change-summary"],[data-testid="agent-activity-body"]').length};})()`);
  assert.equal(terminal.status, 'COMPLETED', `real Qwen task did not complete: ${terminal.errorCode ?? terminal.status}`);
  assert.equal(terminal.terminalInside && !terminal.liveInside, true);
  assert.equal(terminal.legacy, 0);
  assert.match(terminal.title, /^(已经改好了|已经完成|无需修改)$/);
  assert.deepEqual({ size: terminal.titleStyle.size, weight: terminal.titleStyle.weight, line: terminal.titleStyle.line }, { size: '18px', weight: '650', line: '26.1px' });
  assert.deepEqual({ size: terminal.bodyStyle.size, weight: terminal.bodyStyle.weight, line: terminal.bodyStyle.line }, { size: '15px', weight: '400', line: '25.5px' });
  if (terminal.metaStyle) assert.deepEqual({ size: terminal.metaStyle.size, weight: terminal.metaStyle.weight }, { size: '12.5px', weight: '400' });
  if (terminal.actionStyle) assert.deepEqual({ size: terminal.actionStyle.size, weight: terminal.actionStyle.weight }, { size: '13.5px', weight: '550' });
  assert.equal(/模型响应失败|已处理|已完成搜索代码|Standalone Tool|Job Runner/.test(terminal.text), false);
  await capture(cdp, '02-real-success.png');

  process.stdout.write(`${JSON.stringify({ project: acceptance.project.title, model: acceptance.provider.default_model, run_id: running.runId, status: terminal.status, screenshots: [
    '01-real-running.png', '02-real-success.png', '03-real-failed-or-partial.png', '04-real-two-turns.png', '05-real-human-review.png', '06-real-raw-diff.png',
  ].map((name) => path.join(evidence, name)) }, null, 2)}\n`);
} finally {
  cdp.close();
}
