import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';

// Durable fixtures exercise the real renderer/Core projections. No model request,
// credential, production database, or DOM replacement is used by this UI test.
const root = path.resolve(import.meta.dirname, '../..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-conversation-disclosure-'));
const projectRoot = path.join(dataRoot, 'project');
const evidence = path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR ?? path.join(root, 'artifacts/conversation-disclosure'));
const output = [];
let child;
let cdp;
let db;
const fixtureId = () => { const id = randomUUID(); return `${id.slice(0, 14)}7${id.slice(15)}`; };
const runId = fixtureId();
const now = Date.now() - 100_000;
const file = 'export const loginReady = true;\n';
const hash = createHash('sha256').update(file).digest('hex');
const pause = () => new Promise((resolve) => setTimeout(resolve, 350));
const wait = (expression) => waitForExpression(cdp, expression, { output });
const metrics = [];

async function click(selector) {
  await cdp.eval(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
  await pause();
  const point = await cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};})()`);
  assert.ok(point.hit, `Click target obscured: ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await pause();
}

function seedRun(fieldId, conversationId, providerId, userMessageId, runId, running = false) {
  db ??= new DatabaseSync(path.join(dataRoot, 'Fielora/data/fielora.db'));
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.prepare(`INSERT INTO agent_runs(id,field_id,conversation_id,provider_config_id,model_id,task,permission,status,current_step,max_steps,next_sequence,error_code,created_at,updated_at,finished_at) VALUES(?,?,?,?,?,?,?,'FAILED',24,24,100,'AGENT_MAX_STEPS_REACHED',?,?,?)`)
    .run(runId, fieldId, conversationId, providerId, 'presentation-fixture', '修复登录后一直加载的问题', 'FULL_CONTROL', now, now + 99_000, now + 99_000);
  let seq = 0;
  const event = (kind, payload) => db.prepare('INSERT INTO agent_events VALUES(?,?,?,?,?,?,?)').run(randomUUID(), runId, ++seq, 1, kind, JSON.stringify(payload), now + seq * 1000);
  const tool = (name, args, status = 'COMPLETED', error = null) => {
    const id = randomUUID();
    const effect = name === 'run_command' ? 'PROCESS' : name === 'replace_text' ? 'WORKSPACE_WRITE' : 'OBSERVE';
    db.prepare('INSERT INTO agent_tool_calls VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, runId, name, effect, status, 'ALLOW', JSON.stringify(args), JSON.stringify(name === 'read_file' ? {kind:'FILE_READ',path:args.path,sha256:hash} : {}), error, now + seq * 1000, now + (seq+1)*1000, now + (seq+1)*1000);
    event('TOOL_PROPOSED', { tool_call_id: id });
    event(status === 'FAILED' ? 'TOOL_FAILED' : 'TOOL_COMPLETED', { tool_call_id: id });
  };
  event('RUN_CREATED', { user_message_id: userMessageId });
  event('RUN_STARTED', { task_class: 'GENERAL' });
  event('ASSISTANT_NARRATIVE', { step: 1, text: '我会先检查登录成功后的初始化与跳转流程，再验证可能的阻塞点。' });
  tool('read_file', { path: 'src/login.js', line_start: 1, line_end: 20 });
  tool('read_file', { path: 'src/login.js', line_start: 21, line_end: 40 });
  tool('search_text', { path: 'src', query: 'initData' });
  event('ASSISTANT_NARRATIVE', { step: 4, text: '已找到初始化入口，正在核对加载状态的结束条件。\n\n这是待验证的假设，尚未确认根因。\n\n[src/login.js](fielora-project-file:src/login.js#L1-L1)\n\n```javascript\n' + 'const ready = await initialize();\n'.repeat(18) + '```' });
  tool('run_command', { program: 'bash', argv: ['-c', 'grep -n initialize src/login.js | head -20'] }, 'FAILED', 'AGENT_IO_FAILED');
  event('ASSISTANT_NARRATIVE', { step: 23, text: '接下来核对待替换片段，并在修改成功后运行针对性验证。' });
  tool('replace_text', { path: 'src/login.js' }, 'FAILED', 'AGENT_TEXT_MATCH_FAILED');
  tool('read_file', { path: 'src/login.js', line_start: 1, line_end: 20 });
  if (!running) event('RUN_FAILED', { error_code: 'AGENT_MAX_STEPS_REACHED' });
  if (running) db.prepare("UPDATE agent_runs SET status='RUNNING',error_code=NULL,finished_at=NULL WHERE id=?").run(runId);
}

try {
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await mkdir(evidence, { recursive: true });
  await writeFile(path.join(projectRoot, 'src/login.js'), file);
  const launched = await launchElectron({ root, dataRoot, output, executablePath: process.env.FIELORA_PACKAGED_EXE ?? '' });
  child = launched.child;
  cdp = await connectToFieloraApp({ port: launched.port, output, enablePage: true, timeoutMs: 120_000 });
  await wait('window.fieloraTest && document.querySelector("[data-testid=project-workspace]")');
  const ids = await cdp.eval(`(async()=>{
    const p=await window.fieloraTest.createProject({title:'登录流程',goal:'Conversation presentation fixture',root_path:${JSON.stringify(projectRoot)}});
    const provider=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'UI fixture',base_url:'https://example.com/v1',default_model:'presentation-fixture',custom_endpoint_acknowledged:true});
    const c=await window.fielora.conversation.create({field_id:p.field_id,title:'检查登录后一直加载且未进入首页的问题，并验证修复结果',provider_config_id:provider.id,model_id:'presentation-fixture'});
    const u=await window.fielora.conversation.createMessage({conversation_id:c.id,role:'USER',content:'检查登录后一直加载的问题，并修复和验证。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    return{fieldId:p.field_id,providerId:provider.id,conversationId:c.id,userMessageId:u.id};
  })()`);
  seedRun(ids.fieldId, ids.conversationId, ids.providerId, ids.userMessageId, runId);
  const finalText = '## 这次没有完成\n\n本轮**修改没有生效**，尚未运行验证。\n\n| 阶段 | 结果 |\n|---|---|\n| 检查 | 已读取相关代码 |\n| 修改 | 文本匹配失败 |\n| 验证 | 尚未执行 |\n\n接下来应重新读取待替换片段，确认文件内容。\n\n修改成功后，运行登录流程的针对性验证。\n\n检查加载状态能否结束，并确认首页跳转。\n\n验证完成前，不把问题标记为已修复。';
  await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(ids.conversationId)},role:'ASSISTANT',content:${JSON.stringify(finalText)},status:'FAILED',provider_config_id:${JSON.stringify(ids.providerId)},model_id:'presentation-fixture',invocation_id:${JSON.stringify(runId)}})`);
  await cdp.send('Page.reload');
  await wait(`document.querySelector('[data-testid="project-${ids.fieldId}"]')`);
  await cdp.eval(`(()=>{const project=document.querySelector('[data-testid="project-${ids.fieldId}"]');if(project.getAttribute('aria-expanded')!=='true')project.click();})()`);
  await wait(`document.querySelector('[data-testid="conversation-${ids.conversationId}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${ids.conversationId}"]').click()`);
  await wait('document.querySelector("[data-testid=agent-failure-reason]")');
  await click('[data-testid="environment-menu-toggle"]');
  await wait('document.querySelector("[data-testid=environment-popover]")');
  await click('[data-testid="environment-menu-toggle"]');
  await click('[data-testid="settings-nav"]');
  await wait('document.querySelector("[data-testid=settings-screen]")');
  assert.equal(await cdp.eval('getComputedStyle(document.querySelector("[data-testid=project-context-controls]")).display'), 'none');
  await click('[data-testid="settings-back"]');
  await wait('document.querySelector("[data-testid=agent-failure-reason]")');
  assert.equal(await cdp.eval('Boolean(document.querySelector("[data-testid=environment-menu-toggle]"))'), true, 'Summary control must survive Settings → Conversation navigation');
  await click('[data-testid="environment-menu-toggle"]');
  await wait('document.querySelector("[data-testid=environment-popover]")');
  await click('[data-testid="environment-menu-toggle"]');
  for (const route of ['LIBRARY', 'NOW']) {
    await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:navigate', {detail:${JSON.stringify(route)}}))`);
    await wait('!document.querySelector("[data-testid=project-workspace]")');
    await click('[data-testid="chrome-back"]');
    await wait('document.querySelector("[data-testid=agent-failure-reason]")');
    await click('[data-testid="environment-menu-toggle"]');
    await wait('document.querySelector("[data-testid=environment-popover]")');
    await click('[data-testid="environment-menu-toggle"]');
  }
  assert.equal(await cdp.eval('document.querySelector("[data-testid=conversation-turn-navigation]")'), null, 'A single turn must not show navigation');
  assert.match(await cdp.eval('document.querySelector("[data-testid=agent-failure-reason]").innerText'), /步数已用尽.*24\/24/);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 816, deviceScaleFactor: 1, mobile: false });
  await cdp.eval('document.querySelector(".message-list").scrollTop=0');
  await pause();
  await captureScreenshot(cdp, path.join(evidence, '01-result.png'));
  await click('[data-testid="agent-execution-detail-toggle"]');
  assert.equal(await cdp.eval('document.querySelectorAll(".conversation-activity-group[open]").length'), 0);
  assert.equal(await cdp.eval('Math.round(document.querySelector(".agent-execution-detail.is-history").getBoundingClientRect().width)'), await cdp.eval('Math.round(document.querySelector(".agent-terminal-body").getBoundingClientRect().width)'));
  await captureScreenshot(cdp, path.join(evidence, '02-compact-history.png'));
  await click('[data-testid="activity-group-toggle"]');
  assert.equal(await cdp.eval('document.querySelector(".conversation-activity-group").open'), true);
  const rows = await cdp.eval('[...document.querySelectorAll(".conversation-activity-group[open] .conversation-tool-summary")].map(e=>e.innerText)');
  assert.equal(await cdp.eval('Math.round(document.querySelector(".conversation-activity-group").getBoundingClientRect().width)'), await cdp.eval('Math.round(document.querySelector(".agent-terminal-body").getBoundingClientRect().width)'));
  assert.match(rows[0], /1–20/);
  assert.match(rows[1], /21–40/);
  assert.match(rows[2], /initData/);
  await click('[data-testid="activity-tool-toggle"]');
  assert.equal(await cdp.eval('document.querySelector(".conversation-tool-detail").open'), true);
  await cdp.eval('document.querySelector("[data-testid=activity-tool-toggle]").focus()');
  assert.equal(await cdp.eval('document.activeElement.dataset.testid'), 'activity-tool-toggle');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await wait('!document.querySelector(".conversation-tool-detail").open');
  assert.equal(await cdp.eval('document.querySelector(".conversation-tool-detail").open'), false, 'Keyboard must collapse operation details');
  assert.equal(await cdp.eval('document.querySelectorAll(".conversation-activity-group[title],.agent-completion-time").length'), 0);
  await click('.conversation-narrative-detail > summary');
  await wait('document.querySelector(".conversation-narrative-detail[open] .markdown-code-block")');
  assert.equal(await cdp.eval('getComputedStyle(document.querySelector(".conversation-narrative-detail[open] > summary > span")).display'), 'none', 'Expanded analysis must not duplicate its preview paragraph');
  await captureScreenshot(cdp, path.join(evidence, '03-expanded-analysis.png'));
  await click('.conversation-narrative-detail .markdown-typed-reference');
  await wait('document.querySelector(".dock-code-input")?.value.includes("loginReady")');
  assert.equal(await cdp.eval('document.querySelector(".project-layout").classList.contains("workspace-open")'), true);
  await cdp.eval('window.dispatchEvent(new CustomEvent("fielora:close-workspace-dock"))');
  await click('[data-testid="agent-execution-detail-toggle"]');

  for (const width of [1600, 1180, 900]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width === 1600 ? 816 : 560, deviceScaleFactor: 1, mobile: false });
    for (const dock of [false, true]) {
      await cdp.eval(`window.dispatchEvent(new CustomEvent(${JSON.stringify(dock ? 'fielora:open-workspace-launcher' : 'fielora:close-workspace-dock')}))`);
      await pause();
      const geometry = await cdp.eval(`(()=>{
        const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom}};
        const pane=rect('.conversation-column'),list=rect('.message-list'),composer=rect('.conversation-composer'),body=rect('.agent-terminal-body'),table=rect('.markdown-table-wrap'),heading=rect('.conversation-heading'),control=rect('[data-testid=environment-menu-toggle]');
        const textStyle=s=>{const e=document.querySelector(s),c=getComputedStyle(e);return{size:parseFloat(c.fontSize),weight:Number(c.fontWeight)}};
        const typography={title:textStyle('.conversation-header h2'),heading:textStyle('.agent-terminal-body h2'),body:textStyle('.agent-terminal-body p'),strong:textStyle('.agent-terminal-body strong')};
        const overflow=[...document.querySelectorAll('.conversation-column *')].filter(e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().right>pane.right+1 && !e.closest('.conversation-composer')).map(e=>e.className);
        const navigation=rect('[data-testid=project-navigation]'),menuText=rect('.new-chat-button > span'),titleText=rect('.conversation-header h2');
        return{pane,list,composer,body,table,heading,control,typography,navigation,menuText,titleText,overflow,viewport:innerWidth};
      })()`);
      assert.ok(Math.abs((geometry.heading.top+geometry.heading.bottom)/2-(geometry.control.top+geometry.control.bottom)/2)<=1.25, `Header controls must share a vertical center: ${JSON.stringify(geometry)}`);
      assert.equal(geometry.typography.title.weight, 500);
      assert.ok(Math.abs((geometry.titleText.left-geometry.pane.left)-(geometry.menuText.left-geometry.navigation.left))<=1, `Title and menu text must share the same inset: ${JSON.stringify(geometry)}`);
      assert.equal(geometry.typography.heading.size, geometry.typography.body.size);
      assert.equal(geometry.typography.strong.size, geometry.typography.body.size);
      assert.ok(geometry.typography.strong.weight > geometry.typography.body.weight);
      assert.ok(geometry.heading.right + 4 <= geometry.control.left, `Title/control overlap: ${JSON.stringify(geometry)}`);
      assert.ok(Math.abs((geometry.composer.left + geometry.composer.right) / 2 - (geometry.pane.left + geometry.pane.right) / 2) <= 1);
      assert.ok(geometry.composer.left - geometry.pane.left >= 23);
      if (width === 1180 && !dock) assert.ok(geometry.composer.left - geometry.pane.left >= 42, 'Normal desktop viewport must have the increased common inset');
      if (width === 1600 && !dock) assert.equal(Math.round(geometry.composer.width), 1040);
      assert.ok(Math.abs(geometry.body.left - geometry.composer.left) <= 8, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.body.right - geometry.composer.right) <= 8, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.table.width - geometry.body.width) <= 1);
      assert.deepEqual(geometry.overflow, [], 'Conversation content must stay inside its pane');
      metrics.push({ width, dock, ...geometry });
      if (width === 1180 && dock) await captureScreenshot(cdp, path.join(evidence, '04-narrow-dock.png'));
    }
  }
  await cdp.eval('window.dispatchEvent(new CustomEvent("fielora:close-workspace-dock"))');
  await cdp.eval(`(()=>{const e=document.querySelector('.conversation-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'追加说明\\n'.repeat(8));e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause();
  await cdp.eval('(()=>{const list=document.querySelector(".message-list");list.scrollTo({top:list.scrollHeight,behavior:"instant"});})()');
  await wait('(()=>{const list=document.querySelector(".message-list");return list.scrollHeight-list.scrollTop-list.clientHeight<2;})()');
  const bottom = await cdp.eval(`(()=>{const list=document.querySelector('.message-list'),composer=document.querySelector('.conversation-composer');return{lastBottom:document.querySelector('.agent-terminal-body').getBoundingClientRect().bottom,composerTop:composer.getBoundingClientRect().top,height:composer.offsetHeight,padding:parseFloat(getComputedStyle(list).paddingBottom)}})()`);
  assert.ok(bottom.padding > bottom.height + 30, JSON.stringify(bottom));
  assert.ok(bottom.lastBottom < bottom.composerTop, JSON.stringify(bottom));

  const runningId = fixtureId();
  const active = await cdp.eval(`(async()=>{const c=await window.fielora.conversation.create({field_id:${JSON.stringify(ids.fieldId)},title:'正在检查登录流程',provider_config_id:${JSON.stringify(ids.providerId)},model_id:'presentation-fixture'});const u=await window.fielora.conversation.createMessage({conversation_id:c.id,role:'USER',content:'检查初始化流程并修复问题',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});return{conversationId:c.id,userMessageId:u.id};})()`);
  seedRun(ids.fieldId, active.conversationId, ids.providerId, active.userMessageId, runningId, true);
  await cdp.send('Page.reload');
  await wait(`document.querySelector('[data-testid="conversation-${active.conversationId}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${active.conversationId}"]').click()`);
  await wait('document.querySelector(".agent-turn.is-running .conversation-activity-group")');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 816, deviceScaleFactor: 1, mobile: false });
  await pause();
  assert.equal(await cdp.eval('document.querySelectorAll(".agent-turn.is-running .conversation-activity-group[open]").length'), 0);
  await captureScreenshot(cdp, path.join(evidence, '05-running-compact.png'));
  await click('.agent-turn.is-running [data-testid="activity-group-toggle"]');
  assert.equal(await cdp.eval('document.querySelector(".agent-turn.is-running .conversation-activity-group").open'), true);
  await captureScreenshot(cdp, path.join(evidence, '06-running-expanded.png'));

  const longConversation = await cdp.eval(`(async()=>{
    const c=await window.fielora.conversation.create({field_id:${JSON.stringify(ids.fieldId)},title:'登录流程 · 多轮对话',provider_config_id:${JSON.stringify(ids.providerId)},model_id:'presentation-fixture'});
    const turns=[];
    for(let i=1;i<=8;i++) {
      const u=await window.fielora.conversation.createMessage({conversation_id:c.id,role:'USER',content:'第 '+i+' 轮：检查登录流程的初始化与跳转状态',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
      turns.push(u.id);
      await window.fielora.conversation.createMessage({conversation_id:c.id,role:'ASSISTANT',content:'已核对这一轮的检查内容。\\n\\n'+('检查初始化是否完成，并确认页面跳转与加载提示的结束条件。\\n\\n').repeat(4),status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    }
    return{id:c.id,turns};
  })()`);
  await cdp.send('Page.reload');
  await wait(`document.querySelector('[data-testid="conversation-${longConversation.id}"]')`);
  await click(`[data-testid="conversation-${longConversation.id}"]`);
  await wait('document.querySelectorAll(".conversation-turn-marker").length===8');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 560, deviceScaleFactor: 1.25, mobile: false });
  await cdp.eval('document.querySelector("[data-testid=project-navigation-resizer]").focus()');
  for (let i = 0; i < 5; i++) for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await pause();
  await click('.conversation-turn-marker');
  await wait(`document.querySelector('.conversation-turn-marker[aria-current]')?.dataset.turnId === ${JSON.stringify(longConversation.turns[0])}`);
  await click(`[data-turn-id="${longConversation.turns[3]}"]`);
  await wait(`document.querySelector('.conversation-turn-marker[aria-current]')?.dataset.turnId === ${JSON.stringify(longConversation.turns[3])}`);
  const turnNavigation = await cdp.eval(`(()=>{
    const pane=document.querySelector('.conversation-column').getBoundingClientRect(),nav=document.querySelector('.conversation-turn-navigation').getBoundingClientRect(),body=document.querySelector('.message.assistant').getBoundingClientRect(),composer=document.querySelector('.conversation-composer').getBoundingClientRect();
    return{inset:body.left-pane.left,markerRight:nav.right,bodyLeft:body.left,navBottom:nav.bottom,composerTop:composer.top};
  })()`);
  assert.ok(turnNavigation.markerRight < turnNavigation.bodyLeft, 'Turn navigation must fit in the content gutter');
  assert.ok(turnNavigation.navBottom < turnNavigation.composerTop, 'Turn navigation must avoid the composer');
  await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:850, y:100 });
  await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
  await pause();
  await captureScreenshot(cdp, path.join(evidence, '07-turn-navigation.png'));
  await click('[data-testid="environment-menu-toggle"]');
  await wait('document.querySelector("[data-testid=environment-popover]")');
  await captureScreenshot(cdp, path.join(evidence, '08-summary-restored.png'));
  await click('[data-testid="environment-menu-toggle"]');
  await cdp.eval('document.querySelector(".conversation-turn-marker").focus()');
  for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
  assert.equal(await cdp.eval('document.activeElement.dataset.turnId'), longConversation.turns[7]);
  for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? {text:'\r'} : {}) });
  await wait(`document.querySelector('.conversation-turn-marker[aria-current]')?.dataset.turnId === ${JSON.stringify(longConversation.turns[7])}`);
  await cdp.eval('document.querySelector(".message-list").scrollTo({top:0,behavior:"instant"})');
  await wait(`document.querySelector('.conversation-turn-marker[aria-current]')?.dataset.turnId === ${JSON.stringify(longConversation.turns[0])}`);
  await cdp.eval('window.dispatchEvent(new CustomEvent("fielora:open-workspace-launcher"))');
  await pause();
  await click(`[data-turn-id="${longConversation.turns[2]}"]`);
  await wait(`document.querySelector('.conversation-turn-marker[aria-current]')?.dataset.turnId === ${JSON.stringify(longConversation.turns[2])}`);
  await click('[data-testid="environment-menu-toggle"]');
  await wait('document.querySelector("[data-testid=environment-popover]")');
  await click('[data-testid="environment-menu-toggle"]');
  await captureScreenshot(cdp, path.join(evidence, '09-turn-navigation-dock.png'));
  await click(`[data-testid="conversation-${ids.conversationId}"]`);
  await wait('document.querySelector("[data-testid=agent-failure-reason]")');
  assert.equal(await cdp.eval('document.querySelector("[data-testid=conversation-turn-navigation]")'), null, 'Changing to a short conversation must remove stale markers');

  await cdp.eval(`(async()=>{
    for(let i=9;i<=40;i++) {
      await window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(longConversation.id)},role:'USER',content:'继续核对第 '+i+' 轮的检查结果',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
      await window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(longConversation.id)},role:'ASSISTANT',content:'已保留这一轮的检查结果。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    }
  })()`);
  await click(`[data-testid="conversation-${longConversation.id}"]`);
  await wait('document.querySelectorAll(".conversation-turn-marker").length===40');
  await wait('(()=>{const list=document.querySelector(".message-list");return list.scrollHeight-list.scrollTop-list.clientHeight<2;})()');
  await cdp.eval('document.querySelector(".conversation-turn-marker").focus({preventScroll:true})');
  for (const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent', {type,key:'End',code:'End',windowsVirtualKeyCode:35});
  await wait('(()=>{const markers=document.querySelector(".conversation-turn-markers"),r=markers.querySelector("button:last-of-type").getBoundingClientRect(),m=markers.getBoundingClientRect();return r.top>=m.top-1&&r.bottom<=m.bottom+1;})()');
  const denseNavigation = await cdp.eval(`(()=>{
    const markers=document.querySelector('.conversation-turn-markers'),last=markers.querySelector('button:last-of-type'),r=last.getBoundingClientRect(),m=markers.getBoundingClientRect(),n=document.querySelector('.conversation-turn-navigation').getBoundingClientRect(),c=document.querySelector('.conversation-composer').getBoundingClientRect();
    return{overflow:markers.scrollHeight>markers.clientHeight,lastVisible:r.top>=m.top-1&&r.bottom<=m.bottom+1,navBottom:n.bottom,composerTop:c.top};
  })()`);
  assert.ok(denseNavigation.overflow && denseNavigation.lastVisible, `A long turn index must scroll to reveal keyboard targets: ${JSON.stringify(denseNavigation)}`);
  assert.ok(denseNavigation.navBottom < denseNavigation.composerTop);
  for (const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent', {type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});
  await wait('document.querySelector(".conversation-turn-marker:last-of-type").hasAttribute("aria-current")');
  await captureScreenshot(cdp, path.join(evidence, '10-long-turn-navigation.png'));
  await writeFile(path.join(evidence, 'validation.json'), JSON.stringify({ status: 'PASS', modelRequests: 0, summaryRoutes: ['SETTINGS','LIBRARY','NOW'], metrics, bottom, turnNavigation, denseNavigation }, null, 2));
  console.log(`PASS conversation disclosure/layout: ${evidence}`);
} catch (error) {
  console.error(error, output.slice(-8).join(''));
  if (cdp) await captureScreenshot(cdp, path.join(evidence, 'failure.png')).catch(() => {});
  process.exitCode = 1;
} finally {
  db?.close();
  cdp?.close();
  await cleanupElectronProcess(child);
  assert.ok(path.resolve(dataRoot).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(dataRoot, { recursive: true, force: true }).catch(() => {});
}
