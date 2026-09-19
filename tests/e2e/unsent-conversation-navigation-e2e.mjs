import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-unsent-nav-'));
const projectRoot = path.join(dataRoot, 'project');
const evidence = path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR ?? path.join(root,'artifacts/unsent-conversation-navigation/dev'));
const output = [];
let child; let cdp; let ids;
const wait = expression => waitForExpression(cdp, expression, { timeoutMs:45000, output });
async function click(selector) {
  await wait(`document.querySelector(${JSON.stringify(selector)})`);
  await cdp.eval(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  await cdp.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function textInput(value) {
  await cdp.eval(`(()=>{const e=document.querySelector('.conversation-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
const draftText = () => cdp.eval("document.querySelector('.conversation-composer textarea').value");
const images = () => cdp.eval("document.querySelectorAll('[data-testid=attachment-thumbnail-composer]').length");
async function pasteImages() {
  await cdp.eval(`(async()=>{
    const transfer=new DataTransfer();
    for(let index=0;index<2;index++){
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=160;
      const ctx=canvas.getContext('2d');ctx.fillStyle=index?'#def3f0':'#eff0fe';ctx.fillRect(0,0,320,160);
      ctx.fillStyle='#263344';ctx.font='20px sans-serif';ctx.fillText(index?'期望：已到账金额':'实际：客户抬头',20,80);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      transfer.items.add(new File([blob],index?'expected.png':'actual.png',{type:'image/png'}));
    }
    document.querySelector('.conversation-composer textarea').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
  })()`);
  await wait("document.querySelectorAll('[data-testid=attachment-thumbnail-composer]').length===2");
}
async function openConversation(id) { await click(`[data-testid="conversation-${id}"]`); }
try {
  await mkdir(projectRoot);await mkdir(evidence,{recursive:true});
  await writeFile(path.join(projectRoot,'evidence.txt'),'Draft image verification fixture.');
  assert.equal(spawnSync('git.exe',['init'],{cwd:projectRoot,windowsHide:true}).status,0);
  const launched=await launchElectron({root:path.join(root,'apps/desktop'),dataRoot,output,
    executablePath:process.env.FIELORA_PACKAGED_EXE??process.execPath,
    args:process.env.FIELORA_PACKAGED_EXE?[]:[path.join(root,'node_modules/@electron-forge/cli/dist/electron-forge.js'),'start'],
    extraEnv:{Path:`${path.dirname(process.execPath)};${process.env.Path??''}`},
  });
  child=launched.child;
  cdp=await connectToFieloraApp({port:launched.port,output,timeoutMs:120000,enablePage:true});
  await wait("window.fieloraTest && window.fielora.core.getHealth().then(h=>h.state==='READY')");
  ids=await cdp.eval(`(async()=>{
    const provider=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'Draft fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture_images__',custom_endpoint_acknowledged:true});
    await window.fielora.provider.storeCredential({provider_config_id:provider.id,secret:'fixture-only'});
    const project=await window.fieloraTest.createProject({title:'未发送草稿验证',goal:null,root_path:${JSON.stringify(projectRoot)}});
    const make=title=>window.fielora.conversation.create({field_id:project.field_id,title,provider_config_id:provider.id,model_id:provider.default_model});
    const sent=await make('已有对话');
    await window.fielora.conversation.createMessage({conversation_id:sent.id,role:'USER',content:'已经发送的历史内容',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null,references:[]});
    const older=await make('重命名但未发送的草稿');
    const draft=await make('新对话');
    return {project,sent,older,draft};
  })()`);
  await cdp.send('Page.reload');
  await openConversation(ids.sent.id);
  assert.equal(await cdp.eval("document.querySelectorAll('.conversation-item').length"),1);
  await click('[data-testid=new-conversation]');
  await wait("document.querySelector('.conversation-heading h2')?.textContent==='新对话'");
  await textInput('还没发送的文字，不可丢失');await pasteImages();
  assert.equal(await cdp.eval(`!!document.querySelector('[data-testid="conversation-${ids.draft.id}"]')`),false);
  const originalCount=await cdp.eval(`window.fielora.conversation.list({field_id:${JSON.stringify(ids.project.field_id)}}).then(v=>v.length)`);
  assert.equal(originalCount,3);
  await captureScreenshot(cdp,path.join(evidence,'hidden-draft.png'));
  // Both creation entry points reopen the same page and preserve its text and images.
  await openConversation(ids.sent.id);
  await click(`[data-testid="project-new-conversation-${ids.project.field_id}"]`);
  await wait("document.querySelector('.conversation-composer textarea')?.value==='还没发送的文字，不可丢失'");
  assert.equal(await images(),2);
  await click('[data-testid=new-conversation]');
  assert.equal(await draftText(),'还没发送的文字，不可丢失');assert.equal(await images(),2);
  assert.equal(await cdp.eval(`window.fielora.conversation.list({field_id:${JSON.stringify(ids.project.field_id)}}).then(v=>v.length)`),originalCount);
  // Remount the workspace through Settings; the app-session draft still belongs to its page.
  await click('[data-testid=settings-nav]');
  await click('[data-testid=settings-back]');
  await click('[data-testid=new-conversation]');
  await wait("document.querySelector('.conversation-composer textarea')?.value==='还没发送的文字，不可丢失'");
  assert.equal(await images(),2);
  await textInput('FIELORA_AGENT_FIXTURE_INPUT_RETENTION 分析两张图片并保留');
  await wait("!document.querySelector('[data-testid=send-message]').disabled");
  await click('[data-testid=send-message]');
  await wait(`document.querySelector('[data-testid="conversation-${ids.draft.id}"]')`);
  await wait("document.querySelector('[data-testid=agent-pause-notice]')");
  assert.equal(await images(),0);
  const messages=await cdp.eval(`window.fielora.conversation.listMessages({conversation_id:${JSON.stringify(ids.draft.id)}})`);
  assert.ok(messages.some(m=>m.role==='USER'&&m.content.includes('分析两张图片')));
  const remaining=await cdp.eval(`window.fielora.conversation.list({field_id:${JSON.stringify(ids.project.field_id)}})`);
  assert.ok(remaining.some(c=>c.id===ids.older.id));assert.equal(remaining.length,3);
  await captureScreenshot(cdp,path.join(evidence,'sent-draft-visible.png'));
  // A project containing only unsent pages has no conversation-list placeholder.
  const otherRoot=path.join(dataRoot,'other');await mkdir(otherRoot);
  const other=await cdp.eval(`window.fieloraTest.createProject({title:'仅草稿项目',goal:null,root_path:${JSON.stringify(otherRoot)}})`);
  await cdp.send('Page.reload');
  await click(`[data-testid="project-new-conversation-${other.field_id}"]`);
  await wait("document.querySelector('.conversation-heading h2')?.textContent==='新对话'");
  await textInput('第二个项目的草稿');await pasteImages();
  assert.equal(await cdp.eval(`!!document.querySelector('[data-testid="project-conversations-${other.field_id}"]')`),false);
  await click(`[data-testid="project-${ids.project.field_id}"]`);
  await openConversation(ids.sent.id);
  await click(`[data-testid="project-new-conversation-${other.field_id}"]`);
  await wait("document.querySelector('.conversation-composer textarea')?.value==='第二个项目的草稿'");
  assert.equal(await images(),2);
  await captureScreenshot(cdp,path.join(evidence,'draft-only-project.png'));
  await writeFile(path.join(evidence,'summary.json'),JSON.stringify({status:'PASS',hiddenUnsent:true,noDeletion:true,textAndImagesRestored:true,workspaceRemount:true,projectSwitch:true,repeatedNewChatReusesPage:true,firstSendVisible:true,emptySectionHidden:true,externalModelRequests:0},null,2));
  console.log('UNSENT_CONVERSATION_NAVIGATION_E2E=PASS');
} catch(error) {
  if(cdp)await captureScreenshot(cdp,path.join(evidence,'failure.png')).catch(()=>{});
  throw error;
} finally {
  await writeFile(path.join(evidence,'electron.log'),output.join('')).catch(()=>{});
  cdp?.close();await cleanupElectronProcess(child);
  assert.ok(path.resolve(dataRoot).startsWith(path.resolve(tmpdir())+path.sep));
  await rm(dataRoot,{recursive:true,force:true,maxRetries:12,retryDelay:200});
}
