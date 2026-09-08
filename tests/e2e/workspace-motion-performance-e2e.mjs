import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const dataRoot=await mkdtemp(path.join(tmpdir(),'fielora-motion-profile-'));
const projectRoot=path.join(dataRoot,'project');
const evidence=path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR??'artifacts/workspace-motion-performance');
const output=[];
let child,cdp;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=expression=>waitForExpression(cdp,expression,{output});
const records={};

async function sampleTerminalToggle() {
  return cdp.eval(`new Promise(resolve=>{
    const area=document.querySelector('[data-testid="desktop-work-area"]'),terminal=document.querySelector('[data-testid="desktop-terminal-layer"]'),dock=document.querySelector('[data-testid="right-workspace-dock"]'),conversation=document.querySelector('.conversation-column');
    const values=[],start=performance.now();document.querySelector('[data-testid="rail-terminal"]').click();
    const sample=()=>{const r=terminal.getBoundingClientRect();values.push({t:performance.now()-start,top:r.top,height:r.height,conversationBottom:conversation.getBoundingClientRect().bottom,dockBottom:dock.getBoundingClientRect().bottom,contentHeight:terminal.querySelector('.terminal-dock').getBoundingClientRect().height,opacity:getComputedStyle(terminal.querySelector('.terminal-dock')).opacity,areaBottom:area.getBoundingClientRect().bottom});if(performance.now()-start<500)requestAnimationFrame(sample);else resolve(values);};requestAnimationFrame(sample);
  })`);
}

async function measure(label,action) {
  await pause(250);
  const before=await cdp.send('Performance.getMetrics');
  await cdp.eval(`(()=>{window.__motionFrames=[];window.__motionRunning=true;let previous=performance.now();const tick=now=>{window.__motionFrames.push(now-previous);previous=now;if(window.__motionRunning)requestAnimationFrame(tick);};requestAnimationFrame(tick);performance.mark(${JSON.stringify(label+':start')});})()`);
  await action();
  await pause(420);
  const frames=await cdp.eval(`(()=>{window.__motionRunning=false;performance.mark(${JSON.stringify(label+':end')});return window.__motionFrames;})()`);
  const after=await cdp.send('Performance.getMetrics');
  const metrics={};
  for(const key of ['RecalcStyleCount','RecalcStyleDuration','LayoutCount','LayoutDuration','ScriptDuration','TaskDuration']) metrics[key]=(after.metrics.find(m=>m.name===key)?.value??0)-(before.metrics.find(m=>m.name===key)?.value??0);
  const sorted=frames.slice(1).sort((a,b)=>a-b);
  const result={...metrics,frameCount:frames.length,p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...sorted),framesAbove25:sorted.filter(ms=>ms>25).length};
  records[label]=result;
  console.log(label,JSON.stringify(result));
}

async function verifyTerminalDrag() {
  await cdp.eval(`document.querySelector('[data-testid="rail-terminal"]').click()`);
  await pause(400);
  const geometry=()=>cdp.eval(`(()=>{const terminal=document.querySelector('[data-testid="desktop-terminal-layer"]'),r=terminal.getBoundingClientRect(),grip=document.querySelector('[data-testid="bottom-terminal-resizer"]').getBoundingClientRect();return{x:grip.left+100,y:grip.top+grip.height/2,top:r.top,height:r.height,conversationBottom:document.querySelector('.conversation-column').getBoundingClientRect().bottom,dockBottom:document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect().bottom,saved:localStorage.getItem('fielora:terminal-dock-height')};})()`);
  const before=await geometry(), samples=[];
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',clickCount:1});
  for(let step=1;step<=10;step++) {
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x,y:before.y-step*6,button:'left',buttons:1});
    await pause(30);
    const sample=await geometry();samples.push(sample);
    assert.equal(sample.saved,before.saved,'Terminal height persists only after release');
    assert.ok(Math.abs(sample.height-before.height-step*6)<2,'Terminal must follow pointer without a grip offset jump');
    assert.ok(Math.abs(sample.conversationBottom-sample.top)<2&&Math.abs(sample.dockBottom-sample.top)<2,'Adjacent panes must follow the terminal resize');
  }
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x,y:before.y-60,button:'left',clickCount:1});
  await pause(150);
  const after=await geometry();
  assert.equal(Number(after.saved),Math.round(before.height+60));
  assert.ok(Math.abs(after.height-before.height-60)<2);
  records.terminalDrag={before,samples,after};
  await captureScreenshot(cdp,path.join(evidence,'terminal.png'));
  await cdp.eval(`document.querySelector('[data-testid="rail-terminal"]').click()`);
  await pause(400);
}

async function drag(selector,delta) {
  const point=await cdp.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+Math.min(100,r.height/2)};})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  for(let step=1;step<=40;step++) {
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+delta*step/40,y:point.y,button:'left',buttons:1});
    await pause(8);
  }
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+delta,y:point.y,button:'left',clickCount:1});
}

async function motions(prefix) {
  await measure(prefix+'navigation',()=>drag('[data-testid="project-navigation-resizer"]',-40));
  await measure(prefix+'outer',()=>drag('[data-testid="project-workspace-resizer"]',-60));
  await measure(prefix+'inner',()=>drag('.right-dock-view-file:not([hidden]) [data-testid="dock-file-tree-resizer"]',-40));
  await measure(prefix+'tree-toggle',async()=>{await cdp.eval(`document.querySelector('[data-testid="dock-file-tree-toggle"]').click()`);await pause(380);await cdp.eval(`document.querySelector('[data-testid="dock-file-tree-toggle"]').click()`);});
  await measure(prefix+'focus-toggle',async()=>{await cdp.eval(`document.querySelector('[data-testid="rail-focus"]').click()`);await pause(380);await cdp.eval(`document.querySelector('[data-testid="rail-focus"]').click()`);});
  await measure(prefix+'terminal-toggle',async()=>{await cdp.eval(`document.querySelector('[data-testid="rail-terminal"]').click()`);await pause(380);await cdp.eval(`document.querySelector('[data-testid="rail-terminal"]').click()`);});
  await measure(prefix+'sidebar-toggle',async()=>{await cdp.eval(`document.querySelector('[data-testid="chrome-sidebar-toggle"]').click()`);await pause(380);await cdp.eval(`document.querySelector('[data-testid="chrome-sidebar-toggle"]').click()`);});
}

try {
  await mkdir(evidence,{recursive:true});
  await mkdir(path.join(projectRoot,'src/components'),{recursive:true});
  for(let i=0;i<300;i++) await writeFile(path.join(projectRoot,`src/components/file-${i}.ts`),Array.from({length:40},(_,j)=>`export const value${j} = 'A realistic source line in the file workspace';`).join('\n'));
  const launched=await launchElectron({root,dataRoot,executablePath:process.env.FIELORA_PACKAGED_APP??'',args:[`--user-data-dir=${path.join(dataRoot,'profile')}`],output});
  child=launched.child;
  cdp=await connectToFieloraApp({...launched,enablePage:true});
  await wait(`window.fieloraTest&&document.querySelector('[data-testid="project-workspace"]')`);
  await cdp.eval(`window.fieloraTest.resizeWindow({width:1440,height:800})`);
  await cdp.eval(`(async()=>{const p=await window.fieloraTest.createProject({title:'Motion profile',goal:'Profile workspace',root_path:${JSON.stringify(projectRoot)}});await window.fielora.conversation.create({field_id:p.field_id,title:'Motion profile',provider_config_id:null,model_id:null});})()`);
  await cdp.eval('location.reload()');
  await wait(`document.querySelector('.conversation-heading')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(`document.querySelector('[data-testid="workspace-file"]')`);
  for(let i=0;i<3;i++) {
    await cdp.eval(`[...document.querySelectorAll('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')].find(e=>e.textContent.trim()==='file-${i}.ts').click()`);
    await wait(`document.querySelector('.right-dock-view-file:not([hidden]) .cm-content')`);
    await pause(100);
  }
  records.environment=await cdp.eval(`({nodes:document.querySelectorAll('*').length,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,renderer:navigator.userAgent})`);
  await cdp.send('Performance.enable');
  const trace=[];
  const traceComplete=new Promise(resolve=>cdp.socket.addEventListener('message',event=>{const msg=JSON.parse(String(event.data));if(msg.method==='Tracing.dataCollected')trace.push(...msg.params.value);if(msg.method==='Tracing.tracingComplete')resolve();}));
  await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing',transferMode:'ReportEvents'});
  await motions('baseline-');
  if(process.env.FIELORA_VERIFY_MOTION==='1') {
    for(const label of ['navigation','outer','inner','tree-toggle','focus-toggle','terminal-toggle','sidebar-toggle']) assert.ok(records['baseline-'+label].p95<25,`${label}: repeated missed frames, p95=${records['baseline-'+label].p95}`);
    records.terminalOpen=await sampleTerminalToggle();
    records.terminalClose=await sampleTerminalToggle();
    for(const samples of [records.terminalOpen,records.terminalClose]) {
      assert.ok(new Set(samples.map(s=>Math.round(s.height))).size>=5,'Terminal needs intermediate heights');
      assert.ok(samples.every(s=>Math.abs(s.conversationBottom-s.top)<2&&Math.abs(s.dockBottom-s.top)<2),'Conversation, file dock and terminal must share the same animated edge');
      assert.ok(samples.filter(s=>s.height>4).every(s=>s.contentHeight>=240&&s.opacity==='1'),'Terminal content must slide intact');
    }
    await verifyTerminalDrag();
    await wait(`document.querySelector('[data-testid="dock-project-open-default"] img[data-icon-source="native"]')?.naturalWidth>0`);
    records.nativeFolder=await cdp.eval(`(()=>{const e=document.querySelector('[data-testid="dock-project-open-default"] img');return{kind:e.dataset.appIcon,loaded:e.complete&&e.naturalWidth>0};})()`);
    assert.deepEqual(records.nativeFolder,{kind:'FILE_EXPLORER',loaded:true});
    await cdp.eval(`document.querySelector('[data-testid="dock-project-open-menu-toggle"]').click()`);
    await pause(150);
    records.openMenu=await cdp.eval(`[...document.querySelectorAll('[data-testid="dock-project-open-menu"] [role="menuitem"]')].map(e=>e.textContent.trim())`);
    assert.ok(records.openMenu.length>0,'Installed application choices remain available');
    assert.ok(records.openMenu.every(label=>!['文件资源管理器','Fielora 文件','Fielora 终端'].includes(label)));
    await captureScreenshot(cdp,path.join(evidence,'native-open-menu.png'));
  }
  if(process.env.FIELORA_MOTION_ABLATION==='1') {
    await cdp.eval(`(()=>{const style=document.createElement('style');style.textContent='@property --workspace-navigation-width{syntax:"<length>";inherits:false;initial-value:304px;}@property --project-workspace-width{syntax:"<length>";inherits:false;initial-value:635px;}@property --dock-file-tree-width{syntax:"<length>";inherits:false;initial-value:270px;}';document.head.append(style);})()`);
    await motions('noninherited-');
  }
  await cdp.send('Tracing.end');
  await traceComplete;
  await writeFile(path.join(evidence,'trace.json'),JSON.stringify({traceEvents:trace}));
  await writeFile(path.join(evidence,'metrics.json'),JSON.stringify(records,null,2));
  assert.ok(await cdp.eval(`!document.documentElement.dataset.resizing`));
  console.log('WORKSPACE_MOTION_PROFILE: COMPLETE');
} finally {
  await writeFile(path.join(evidence,'metrics.json'),JSON.stringify(records,null,2));
  cdp?.close();
  await cleanupElectronProcess(child);
  await rm(dataRoot,{recursive:true,force:true,maxRetries:8,retryDelay:150});
}
