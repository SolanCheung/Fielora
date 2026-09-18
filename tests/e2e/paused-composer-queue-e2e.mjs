import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess, waitForChildExit } from './harness/electron-cdp-harness.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const dataRoot=await mkdtemp(path.join(tmpdir(),'fielora-paused-queue-'));
const projectRoot=path.join(dataRoot,'project');
const evidence=path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR??path.join(root,'artifacts/paused-composer-queue'));
const output=[];
let child,cdp,provider;
const wait=expression=>waitForExpression(cdp,expression,{output,timeoutMs:30_000});
const evalJson=value=>JSON.stringify(value);
async function launch() {
  const app=await launchElectron({root,dataRoot,output,executablePath:process.env.FIELORA_PACKAGED_APP,args:[`--user-data-dir=${path.join(dataRoot,'profile')}`,'--disable-features=CalculateNativeWinOcclusion']});
  child=app.child;cdp=await connectToFieloraApp({...app,enablePage:true});
  await wait('window.fieloraTest && document.querySelector("[data-testid=project-workspace]")');
}
async function click(selector) {
  await cdp.eval(`document.querySelector(${evalJson(selector)}).scrollIntoView({block:'center'})`);
  const p=await cdp.eval(`(()=>{const e=document.querySelector(${evalJson(selector)}),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
  assert.ok(p.hit,selector);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});
}
try {
  await mkdir(projectRoot);await mkdir(evidence,{recursive:true});
  await writeFile(path.join(projectRoot,'login.js'),'exports.ready = false;\n');
  await writeFile(path.join(projectRoot,'verify.cjs'),"require('node:assert/strict').equal(require('./login.js').ready,true);\n");
  await launch();
  provider=await cdp.eval("window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'Paused queue fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture__',custom_endpoint_acknowledged:true})");
  await cdp.eval(`window.fielora.provider.storeCredential({provider_config_id:${evalJson(provider.id)},secret:'fixture-only'})`);
  const project=await cdp.eval(`window.fieloraTest.createProject({title:'暂停任务消息检查',goal:null,root_path:${evalJson(projectRoot)}})`);
  for(const action of ['stop','resume']) {
    const task='FIELORA_AGENT_FIXTURE_CONTINUITY 修复登录初始化并验证';
    const conversation=await cdp.eval(`window.fielora.conversation.create({field_id:${evalJson(project.field_id)},title:${evalJson('暂停后'+action)},provider_config_id:${evalJson(provider.id)},model_id: '__fielora_agent_fixture__'})`);
    const message=await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${evalJson(conversation.id)},role:'USER',content:${evalJson(task)},status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null})`);
    const run=await cdp.eval(`window.fielora.agent.start({field_id:${evalJson(project.field_id)},conversation_id:${evalJson(conversation.id)},user_message_id:${evalJson(message.id)},provider_config_id:${evalJson(provider.id)},model_id:'__fielora_agent_fixture__',task:${evalJson(task)},permission:'FULL_CONTROL',max_steps:1})`);
    await wait(`window.fielora.agent.get({run_id:${evalJson(run.id)}}).then(r=>r.status==='PAUSED')`);
    await cdp.eval('location.reload()');
    await wait(`document.querySelector('[data-testid="conversation-${conversation.id}"]')`);
    await click(`[data-testid="conversation-${conversation.id}"]`);
    await wait('document.querySelector("[data-testid=agent-pause-notice]")');
    const followUp=`FIELORA_AGENT_FIXTURE_PROSE_ONLY 只回答：追加消息 ${action}`;
    await cdp.eval(`(()=>{const e=document.querySelector('.conversation-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${evalJson(followUp)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await wait('document.querySelector("[data-testid=send-steering]")');
    // Rapid repeated submit must admit exactly one queued request.
    await cdp.eval("(()=>{const f=document.querySelector('.conversation-composer');f.requestSubmit();f.requestSubmit();})()");
    await wait('document.querySelectorAll("[data-testid=queued-follow-up-card]").length===1');
    assert.equal(await cdp.eval("document.querySelector('.conversation-composer textarea').value"),'');
    assert.match(await cdp.eval("document.querySelector('[data-testid=queued-follow-up-status]').textContent"),/已暂停/);
    assert.equal(await cdp.eval(`window.fielora.agent.list({conversation_id:${evalJson(conversation.id)}}).then(r=>r.length)`),1);
    assert.equal(await cdp.eval(`window.fielora.conversation.listMessages({conversation_id:${evalJson(conversation.id)}}).then(r=>r.filter(m=>m.role==='USER').length)`),1,'Queueing must not create an orphan message');
    assert.doesNotMatch(await cdp.eval('document.body.textContent'),/AGENT_RUN_ALREADY_ACTIVE|Error invoking remote/);
    await captureScreenshot(cdp,path.join(evidence,`queued-${action}.png`));
    assert.equal(await cdp.eval(`JSON.parse(localStorage.getItem('fielora:queued-follow-ups:${conversation.id}')).length`),1);
    await cdp.eval('void window.fielora.core.quit()');
    cdp.close();cdp=null;assert.equal(await waitForChildExit(child),0);child=null;await launch();
    await wait(`document.querySelector('[data-testid="conversation-${conversation.id}"]')`);
    await click(`[data-testid="conversation-${conversation.id}"]`);
    await wait('document.querySelectorAll("[data-testid=queued-follow-up-card]").length===1 && document.querySelector("[data-testid=agent-pause-notice]")');
    await click(action==='stop'?'[data-testid=agent-pause-notice] button:last-child':'[data-testid=agent-pause-notice] button:first-of-type');
    await wait(`window.fielora.agent.list({conversation_id:${evalJson(conversation.id)}}).then(r=>r.length===2 && r.every(x=>['COMPLETED','CANCELLED'].includes(x.status)))`);
    const runs=await cdp.eval(`window.fielora.agent.list({conversation_id:${evalJson(conversation.id)}})`);
    assert.equal(runs.find(r=>r.id===run.id).status,action==='stop'?'CANCELLED':'COMPLETED');
    assert.equal(runs.filter(r=>r.task.startsWith(followUp)).length,1);
    assert.equal(await cdp.eval(`window.fielora.conversation.listMessages({conversation_id:${evalJson(conversation.id)}}).then(r=>r.filter(m=>m.role==='USER'&&m.content===${evalJson(followUp)}).length)`),1);
    await wait('!document.querySelector("[data-testid=queued-follow-up-card]")');
  }
  console.log('PAUSED_COMPOSER_QUEUE_E2E: PASS');
} catch(error) {
  if(cdp)await captureScreenshot(cdp,path.join(evidence,'failure.png')).catch(()=>{});
  throw error;
} finally {
  await writeFile(path.join(evidence,'electron.log'),output.join(''));
  cdp?.close();await cleanupElectronProcess(child);
  if(provider)spawnSync('cmdkey.exe',[`/delete:Fielora/provider/${provider.id}`],{windowsHide:true,stdio:'ignore'});
}
