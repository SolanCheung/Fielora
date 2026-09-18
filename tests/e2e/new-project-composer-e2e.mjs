import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-new-project-composer-'));
const projectRoot = path.join(dataRoot, 'project');
const evidence = path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR ?? path.join(root, 'artifacts/new-project-composer'));
const output = [];
const providerIds = [];
let child; let cdp;
const wait = (expression) => waitForExpression(cdp, expression, { timeoutMs: 30_000, output });
const click = (testId) => cdp.eval(`document.querySelector('[data-testid="${testId}"]').click()`);
async function reload() {
  await cdp.eval('window.__composerReloadMarker = true');
  await cdp.send('Page.reload');
  await wait('typeof window.__composerReloadMarker === "undefined" && window.fieloraTest');
}
async function input(value) {
  await cdp.eval(`(()=>{const e=document.querySelector('.conversation-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
async function geometry() {
  return cdp.eval(`(()=>{const composer=document.querySelector('.conversation-composer');const pane=document.querySelector('.conversation-column');const a=composer.getBoundingClientRect(),b=pane.getBoundingClientRect();const controls=[...composer.querySelectorAll('.composer-footer button')].map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label'),left:r.left,right:r.right,top:r.top,bottom:r.bottom,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}});return {left:a.left,right:a.right,bottom:a.bottom,paneLeft:b.left,paneRight:b.right,windowHeight:innerHeight,controls};})()`);
}
function assertGeometry(value) {
  assert.ok(value.left >= value.paneLeft && value.right <= value.paneRight + 1);
  assert.ok(value.bottom <= value.windowHeight);
  assert.ok(Math.abs((value.left - value.paneLeft) - (value.paneRight - value.right)) < 2, 'composer stays centered in its pane');
  assert.ok(value.controls.every(c => c.hit), 'every composer control must be visible and clickable');
  for (let i = 0; i < value.controls.length; i++) for (let j = i + 1; j < value.controls.length; j++) {
    const a = value.controls[i], b = value.controls[j];
    assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${a.label} overlaps ${b.label}`);
  }
}
try {
  await mkdir(projectRoot); await mkdir(evidence, { recursive: true });
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
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'新项目对话体验',goal:null,root_path:${JSON.stringify(projectRoot)}})`);
  const list = `window.fielora.conversation.list({field_id:${JSON.stringify(project.field_id)}})`;
  await reload();
  await wait("document.querySelector('[data-testid=project-empty-conversation]')");
  assert.equal((await cdp.eval(list)).length, 0, 'opening a project must not create a conversation');
  for (const id of ['conversation-composer', 'composer-permission', 'composer-add-attachment', 'composer-voice', 'send-message']) {
    assert.equal(await cdp.eval(`document.querySelectorAll('[data-testid="${id}"]').length`), 1);
  }
  assert.equal(await cdp.eval("document.querySelector('.project-empty-composer')"), null);
  await input('未配置模型时保留首条草稿');
  await click('send-message');
  await wait("document.body.textContent.includes('模型') && !document.querySelector('[data-testid=send-message]').disabled");
  assert.equal(await cdp.eval("document.querySelector('.conversation-composer textarea').value"), '未配置模型时保留首条草稿');
  assert.equal((await cdp.eval(list)).length, 0);

  for (const model of ['__fielora_agent_fixture_pause__', '__fielora_agent_fixture__']) {
    const id = await cdp.eval(`(async()=>{const p=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'本地体验验证',base_url:'https://example.com/v1',default_model:${JSON.stringify(model)},custom_endpoint_acknowledged:true});await window.fielora.provider.storeCredential({provider_config_id:p.id,secret:'fixture-only'});return p.id;})()`);
    providerIds.push(id);
  }
  await reload();
  await wait("document.querySelector('[data-testid=conversation-model]')");
  await click('conversation-model'); await click(`conversation-model-option-${providerIds[1]}`);
  await click('composer-permission'); await click('composer-permission-option-FULL_CONTROL');
  assertGeometry(await geometry());
  await captureScreenshot(cdp, path.join(evidence, 'new-project-ready.png'));
  await click('chrome-tools');
  await wait("document.querySelector('.project-layout')?.classList.contains('workspace-open')");
  // Wait for the existing pane transition to finish before inspecting geometry.
  await wait("!document.querySelector('.project-layout').getAnimations().some(a=>a.playState==='running')");
  assertGeometry(await geometry());
  await captureScreenshot(cdp, path.join(evidence, 'new-project-with-dock.png'));
  await click('chrome-tools');
  await wait("!document.querySelector('.project-layout')?.classList.contains('workspace-open')");

  const task = 'FIELORA_AGENT_FIXTURE_PROSE_ONLY 解释项目结构';
  await input(task);
  await cdp.eval(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['first-message-attachment-preserved'], 'context.txt', {type:'text/plain'}));document.querySelector('.conversation-composer').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));})()`);
  await wait("document.querySelector('[data-testid=composer-attachments]')?.textContent.includes('context.txt')");
  // Two synchronous submissions exercise the first-send race, not just a disabled button.
  await cdp.eval("(()=>{const form=document.querySelector('.conversation-composer');form.requestSubmit();form.requestSubmit();})()");
  await wait(`${list}.then(items=>items.length===1)`);
  const conversation = (await cdp.eval(list))[0];
  await wait(`window.fielora.agent.list({conversation_id:${JSON.stringify(conversation.id)}}).then(r=>r.some(x=>x.status==='COMPLETED'))`);
  const runs = await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(conversation.id)}})`);
  assert.equal(runs.length, 1); assert.equal(runs[0].provider_config_id, providerIds[1]);
  assert.equal(runs[0].permission, 'FULL_CONTROL'); assert.equal(runs[0].max_steps, 4096);
  assert.ok(runs[0].task.startsWith(task)); assert.ok(runs[0].task.includes('first-message-attachment-preserved'));
  const messages = await cdp.eval(`window.fielora.conversation.listMessages({conversation_id:${JSON.stringify(conversation.id)}})`);
  assert.equal(messages.filter(m => m.role === 'USER').length, 1);
  assert.ok(messages.find(m => m.role === 'USER').content.startsWith(task));
  await wait("!document.querySelector('[data-testid=project-empty-conversation]') && document.querySelector('.conversation-composer textarea')?.value===''");
  await wait("document.body.textContent.includes('问题已经修复。')");
  assert.equal(await cdp.eval("document.querySelector('[data-testid=composer-attachments]')"), null);
  await captureScreenshot(cdp, path.join(evidence, 'first-message-completed.png'));
  await click(`project-new-conversation-${project.field_id}`);
  await wait(`${list}.then(items=>items.length===2)`);
  await click(`project-new-conversation-${project.field_id}`);
  await wait("document.querySelector('.conversation-heading h2')?.textContent==='新对话'");
  assert.equal((await cdp.eval(list)).length, 2, 'explicit new conversation still reuses its unsent draft');
  assert.equal(await cdp.eval("document.querySelectorAll('[data-testid=conversation-composer]').length"), 1);
  await writeFile(path.join(evidence, 'validation.json'), JSON.stringify({status:'PASS',host:process.env.FIELORA_PACKAGED_EXE?'packaged':'development',externalModelRequests:0,openProjectCreatesNoConversation:true,missingProviderKeepsDraft:true,sharedComposerAndDockGeometry:true,firstSendCreatesOnce:true,textAndAttachmentPreserved:true,selectedProviderAndPermissionPreserved:true,agentTaskCompleted:true,explicitNewConversationWorks:true}, null, 2));
  console.log(`PASS New project composer: ${evidence}`);
} catch (error) {
  console.error(error, output.slice(-5).join('')); process.exitCode = 1;
  if (cdp) await captureScreenshot(cdp, path.join(evidence, 'failure.png')).catch(() => {});
} finally {
  await writeFile(path.join(evidence, 'electron.log'), output.join('')).catch(() => {});
  cdp?.close(); await cleanupElectronProcess(child);
  for (const id of providerIds) spawnSync('cmdkey.exe', [`/delete:Fielora/provider/${id}`], {windowsHide:true,stdio:'ignore'});
  assert.ok(path.resolve(dataRoot).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(dataRoot, { recursive:true, force:true });
}
