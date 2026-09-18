import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-agent-continuity-ui-'));
const projectRoot = path.join(dataRoot, 'project');
const evidence = path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR ?? path.join(root, 'artifacts/agent-continuity'));
const output = [];
let child; let cdp; let ids;
const wait = (expression) => waitForExpression(cdp, expression, { timeoutMs: 60_000, output });
async function launch() {
  const launched = await launchElectron({
    root: path.join(root, 'apps/desktop'), dataRoot, output,
    executablePath: process.env.FIELORA_PACKAGED_EXE ?? process.execPath,
    args: process.env.FIELORA_PACKAGED_EXE ? [] : [path.join(root, 'node_modules/@electron-forge/cli/dist/electron-forge.js'), 'start'],
    extraEnv: { Path: `${path.dirname(process.execPath)};${process.env.Path ?? ''}` },
  });
  child = launched.child;
  cdp = await connectToFieloraApp({ port: launched.port, output, timeoutMs: 120_000, enablePage: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1478, height: 800, deviceScaleFactor: 1, mobile: false });
  await wait("window.fieloraTest && window.fielora.core.getHealth().then(h=>h.state==='READY')");
}
async function openConversation() {
  await wait(`document.querySelector('[data-testid="project-${ids.project.field_id}"]')`);
  await cdp.eval(`(()=>{const p=document.querySelector('[data-testid="project-${ids.project.field_id}"]');if(p.getAttribute('aria-expanded')!=='true')p.click()})()`);
  await wait(`document.querySelector('[data-testid="conversation-${ids.conversation.id}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${ids.conversation.id}"]').click()`);
}
async function reloadConversation() {
  await cdp.eval('window.__continuityReloadMarker = true');
  await cdp.send('Page.reload');
  await wait('typeof window.__continuityReloadMarker === "undefined" && window.fieloraTest');
  await openConversation();
}
async function clickPauseAction(prefix) {
  const selector = `[data-testid="agent-pause-notice"] button`;
  await cdp.eval(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.startsWith(${JSON.stringify(prefix)})).scrollIntoView({block:'center'})`);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const point = await cdp.eval(`(()=>{const e=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.startsWith(${JSON.stringify(prefix)}));const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()`);
  assert.ok(point.hit, `${prefix} must be clickable`);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
}
try {
  await mkdir(projectRoot); await mkdir(evidence, { recursive: true });
  await writeFile(path.join(projectRoot, 'login.js'), 'exports.ready = false;\r\n// initial\r\n');
  await writeFile(path.join(projectRoot, 'verify.cjs'), "require('node:assert/strict').equal(require('./login.js').ready, true);\n");
  await writeFile(path.join(projectRoot, 'evidence.txt'), Array.from({ length: 100 }, (_, i) => `Evidence item ${i + 1}`).join('\n'));
  assert.equal(spawnSync('git.exe', ['init'], { cwd: projectRoot, windowsHide: true }).status, 0);
  await launch();
  ids = await cdp.eval(`(async()=>{
    const provider=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'Continuity fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture__',custom_endpoint_acknowledged:true});
    await window.fielora.provider.storeCredential({provider_config_id:provider.id,secret:'fixture-only'});
    const project=await window.fieloraTest.createProject({title:'任务续接验证',goal:null,root_path:${JSON.stringify(projectRoot)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'登录初始化恢复与验证',provider_config_id:provider.id,model_id:provider.default_model});
    const task='FIELORA_AGENT_FIXTURE_CONTINUITY 修复登录初始化并验证';
    const user=await window.fielora.conversation.createMessage({conversation_id:conversation.id,role:'USER',content:task,status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    const run=await window.fielora.agent.start({field_id:project.field_id,conversation_id:conversation.id,user_message_id:user.id,provider_config_id:provider.id,model_id:provider.default_model,task,permission:'FULL_CONTROL',max_steps:2});
    return {provider,project,conversation,run};
  })()`);
  await reloadConversation();
  await wait("document.querySelector('[data-testid=agent-pause-notice]')?.textContent.includes('增加 24 步')");
  assert.equal(await cdp.eval("document.querySelector('[data-testid=agent-progress-summary]').getAttribute('aria-expanded')"), 'false');
  await captureScreenshot(cdp, path.join(evidence, 'budget-paused.png'));
  cdp.close(); cdp = null; await cleanupElectronProcess(child); child = null;
  await writeFile(path.join(projectRoot, 'login.js'), 'exports.ready = false;\r\n// changed while paused\r\n');
  await launch(); await openConversation();
  await wait("document.querySelector('[data-testid=agent-pause-notice]')?.textContent.includes('增加 24 步')");
  await clickPauseAction('继续工作');
  await wait(`window.fielora.agent.get({run_id:${JSON.stringify(ids.run.id)}}).then(r=>r.status==='COMPLETED')`);
  await wait("!document.querySelector('[data-testid=agent-pause-notice]') && document.body.textContent.includes('通过针对初始化结果的检查')");
  const run = await cdp.eval(`window.fielora.agent.get({run_id:${JSON.stringify(ids.run.id)}})`);
  assert.equal(run.max_steps, 26); assert.equal(run.id, ids.run.id);
  assert.match(await readFile(path.join(projectRoot, 'login.js'), 'utf8'), /changed while paused/);
  await captureScreenshot(cdp, path.join(evidence, 'continued-verified.png'));
  const stopRun = await cdp.eval(`(async()=>{
    const task='FIELORA_AGENT_FIXTURE_BUDGET 分析证据';
    const user=await window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(ids.conversation.id)},role:'USER',content:task,status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    return window.fielora.agent.start({field_id:${JSON.stringify(ids.project.field_id)},conversation_id:${JSON.stringify(ids.conversation.id)},user_message_id:user.id,provider_config_id:${JSON.stringify(ids.provider.id)},model_id:'__fielora_agent_fixture__',task,permission:'FULL_CONTROL',max_steps:1});
  })()`);
  await reloadConversation();
  await wait("document.querySelector('[data-testid=agent-pause-notice]')?.textContent.includes('停止任务')");
  await clickPauseAction('停止任务');
  await wait(`window.fielora.agent.get({run_id:${JSON.stringify(stopRun.id)}}).then(r=>r.status==='CANCELLED')`);
  await writeFile(path.join(projectRoot, 'login.js'), 'exports.ready = false;\r\n// preserve long task context\r\n');
  ids.conversation = await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(ids.project.field_id)},title:'持续执行并验证登录修复',provider_config_id:${JSON.stringify(ids.provider.id)},model_id:'__fielora_agent_fixture__'})`);
  await reloadConversation();
  await wait("document.querySelector('[data-testid=composer-permission]')");
  await cdp.eval("document.querySelector('[data-testid=composer-permission]').click()");
  await wait("document.querySelector('[data-testid=composer-permission-option-FULL_CONTROL]')");
  await cdp.eval("document.querySelector('[data-testid=composer-permission-option-FULL_CONTROL]').click()");
  const longTask = 'FIELORA_AGENT_FIXTURE_CONTINUITY_LONG 修复登录初始化并验证';
  await cdp.eval(`(()=>{const input=document.querySelector('.conversation-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(longTask)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait("document.querySelector('[data-testid=send-message]') && !document.querySelector('[data-testid=send-message]').disabled");
  await cdp.eval("document.querySelector('[data-testid=send-message]').click()");
  await wait(`window.fielora.agent.list({conversation_id:${JSON.stringify(ids.conversation.id)}}).then(runs=>runs.some(r=>r.status==='COMPLETED'))`);
  const automaticRuns = await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(ids.conversation.id)}})`);
  assert.equal(automaticRuns.length, 1);
  const automatic = automaticRuns[0];
  assert.equal(automatic.max_steps, 4096);
  assert.equal(automatic.current_step, 27);
  const automaticEvents = await cdp.eval(`window.fielora.agent.events({run_id:${JSON.stringify(automatic.id)},after_sequence:null,limit:500})`);
  assert.ok(!automaticEvents.some(event => ['RUN_PAUSED','RUN_RESUMED'].includes(event.kind)));
  assert.equal(automaticEvents.find(event => event.kind === 'RUN_COMPLETED').payload.verification_passed, true);
  assert.match(await readFile(path.join(projectRoot, 'login.js'), 'utf8'), /ready = true/);
  await wait("document.body.textContent.includes('通过针对初始化结果的检查')");
  await captureScreenshot(cdp, path.join(evidence, 'automatic-27-steps-verified.png'));
  await writeFile(path.join(evidence, 'validation.json'), JSON.stringify({ status: 'PASS', host: process.env.FIELORA_PACKAGED_EXE ? 'packaged' : 'development', externalModelRequests: 0, sameRunAfterRestart: true, staleGuardRecovery: true, collapsedResumeClickable: true, pausedStopClickable: true, finalStep: run.current_step, defaultComposerAutomaticSteps: automatic.current_step, noAutomaticRunPauses: true, automaticVerificationPassed: true }, null, 2));
  console.log(`PASS Agent continuity desktop: ${evidence}`);
} catch (error) {
  console.error(error, output.slice(-5).join('')); process.exitCode = 1;
  if (cdp) await captureScreenshot(cdp, path.join(evidence, 'failure.png')).catch(() => {});
} finally {
  await writeFile(path.join(evidence, 'electron.log'), output.join('')).catch(() => {});
  cdp?.close(); await cleanupElectronProcess(child);
  if (ids?.provider) spawnSync('cmdkey.exe', [`/delete:Fielora/provider/${ids.provider.id}`], { windowsHide: true, stdio: 'ignore' });
  assert.ok(path.resolve(dataRoot).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(dataRoot, { recursive: true, force: true });
}
