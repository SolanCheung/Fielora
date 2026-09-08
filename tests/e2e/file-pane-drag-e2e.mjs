import { renderingTestArgs } from './harness/file-editor-harness.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const dataRoot=await mkdtemp(path.join(tmpdir(),'fielora-file-drag-'));
const projectRoot=process.env.FIELORA_READONLY_PROFILE_PROJECT??path.join(dataRoot,'project');
const evidence=path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR??'artifacts/file-pane-drag');
const records={},output=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let child,cdp;
const wait=expression=>waitForExpression(cdp,expression,{output,timeoutMs:60000});

async function drag(label,selector,delta=-60) {
  await cdp.send('Page.bringToFront');
  await wait(`document.visibilityState==='visible'`);
  await pause(200);
  const point=await cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+80;return{x,y,hit:e.contains(document.elementFromPoint(x,y)),width:r.width};})()`);
  assert.ok(point.hit&&point.width>0,`${label}: divider must be hit-testable`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y,buttons:0});
  const before=await cdp.send('Performance.getMetrics');
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
  await wait(`document.documentElement.dataset.resizing==='vertical'`);
  await cdp.eval(`(()=>{window.__dragFrames=[];window.__dragRunning=true;let last=performance.now();const tick=now=>{window.__dragFrames.push(now-last);last=now;if(window.__dragRunning)requestAnimationFrame(tick);};requestAnimationFrame(tick);performance.mark(${JSON.stringify(label+':start')});})()`);
  const positions=[];
  const scrollports=[];
  for(let step=1;step<=80;step++) {
    const offset=delta*Math.sin(step/80*Math.PI*2);
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+offset,y:point.y,button:'left',buttons:1});
    await pause(8);
    if(step===20||step===60) {
      positions.push(await cdp.eval(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().left`));
      if(process.env.FIELORA_VERIFY_FILE_DRAG==='1') {
        const ports=await cdp.eval(`(()=>{const view=document.querySelector('.right-dock-view:not([hidden])'),content=view?.querySelector('.dock-resource-content'),input=view?.querySelector('.cm-scroller'),tree=view?.querySelector('.workspace-file-tree'),aside=view?.querySelector('.dock-resource-file-tree'),filter=view?.querySelector('.workspace-file-filter');return{inputRight:input?.getBoundingClientRect().right,contentRight:content?.getBoundingClientRect().right,treeRight:tree?.getBoundingClientRect().right,paneRight:(aside??view)?.getBoundingClientRect().right,filterRight:filter?.getBoundingClientRect().right,scrollHeight:input?.scrollHeight};})()`);
        scrollports.push(ports);
        if(ports.inputRight!==undefined)assert.ok(Math.abs(ports.inputRight-ports.contentRight)<2,`${label}: native code scrollbar must follow the live pane edge`);
        if(ports.treeRight!==undefined)assert.ok(Math.abs(ports.treeRight-ports.paneRight)<2&&Math.abs(ports.filterRight-ports.paneRight)<2,`${label}: native tree scrollbar and filter must follow the live pane edge`);
      }
    }
  }
  const frames=await cdp.eval(`(()=>{window.__dragRunning=false;performance.mark(${JSON.stringify(label+':end')});return window.__dragFrames.slice(1);})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
  const after=await cdp.send('Performance.getMetrics');
  const metrics={};
  for(const key of ['RecalcStyleDuration','LayoutDuration','ScriptDuration','TaskDuration','LayoutCount'])metrics[key]=(after.metrics.find(m=>m.name===key)?.value??0)-(before.metrics.find(m=>m.name===key)?.value??0);
  const sorted=frames.toSorted((a,b)=>a-b);
  assert.ok(Math.abs(positions[1]-positions[0])>30,`${label}: divider must actually move`);
  records[label]={...metrics,positions,scrollports,frames:frames.length,p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...frames),above25:frames.filter(f=>f>25).length};
  if(process.env.FIELORA_VERIFY_FILE_DRAG==='1'&&label.startsWith('file-and-tree'))assert.notEqual(scrollports[0].scrollHeight,scrollports[1].scrollHeight,'Code wrapping and native scroll extent must update before release');
  console.log(label,JSON.stringify(records[label]));
}

async function verifyDirectoryWindow() {
  const selector='.right-dock-view-file:not([hidden]) .workspace-file-tree';
  const geometry=()=>cdp.eval(`(()=>{const tree=document.querySelector('${selector}');return{total:Number(tree.dataset.totalRows),mounted:tree.querySelectorAll('[role="treeitem"]').length,height:tree.scrollHeight,top:tree.scrollTop,last:Number(tree.querySelector('[data-row-index]:last-of-type')?.dataset.rowIndex),indices:[...tree.querySelectorAll('[data-row-index]')].map(e=>Number(e.dataset.rowIndex))};})()`);
  const before=await geometry();
  assert.ok(before.total>=2500&&before.mounted<100,'Keep the entire tree model but bound mounted rows to the viewport');
  await cdp.eval(`document.querySelector('${selector}').scrollTop=1000000`);await pause(150);
  const bottom=await geometry();
  records.directoryWindow={before,bottom};
  assert.equal(bottom.indices.at(-1),before.total-1,'Scrolling must reach the final directory entry');
  assert.equal(bottom.height,before.height,'Native scrollbar extent must stay stable as rows enter and leave the viewport');
  await cdp.eval(`document.querySelector('${selector} [data-row-index="${before.total-1}"]').focus()`);
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Home',code:'Home',windowsVirtualKeyCode:36});
  await pause(150);
  assert.equal(await cdp.eval(`document.activeElement.dataset.rowIndex`),'0','Keyboard can navigate across unmounted rows');
  const first=await cdp.eval(`document.activeElement.dataset.treePath`);
  await cdp.eval(`document.activeElement.click()`);await pause(100);
  const closed=await geometry();assert.ok(closed.total<before.total,'Folder collapse updates the flattened range');
  await cdp.eval(`document.querySelector('${selector} [data-tree-path="'+CSS.escape(${JSON.stringify(first)})+'"]').click()`);await pause(100);
  assert.equal((await geometry()).total,before.total);
  const filter='.right-dock-view-file:not([hidden]) [data-testid="workspace-file-filter"]';
  await cdp.eval(`document.querySelector('${filter}').focus()`);
  const query=process.env.FIELORA_READONLY_PROFILE_PROJECT?'02 IIFE.js':'component-19.ts';
  await cdp.send('Input.insertText',{text:query});await pause(150);
  assert.ok(await cdp.eval(`(()=>{const rows=[...document.querySelectorAll('${selector} [data-testid="workspace-file"]')];return rows.length>0&&rows.every(e=>e.textContent.trim()===${JSON.stringify(query)});})()`));
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await pause(150);assert.equal((await geometry()).total,before.total);
  records.directoryWindow={before,bottom,closed};
}

async function verifyTreeCollapse() {
  const state=()=>cdp.eval(`(()=>{const layout=document.querySelector('.right-dock-view-file:not([hidden]) .dock-resource-layout'),tree=layout.querySelector('.dock-resource-file-tree'),divider=layout.querySelector('[role="separator"]'),editor=layout.querySelector('.dock-code-editor-surface'),rows=tree.querySelector('.workspace-file-rows'),r=divider.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+80,right:layout.getBoundingClientRect().right,tree:tree.getBoundingClientRect().width,body:tree.firstElementChild.getBoundingClientRect().width,rows:rows.getBoundingClientRect().width,content:layout.firstElementChild.getBoundingClientRect().width,editor:editor.getBoundingClientRect().width,layout:layout.getBoundingClientRect().width,collapsed:layout.classList.contains('file-tree-collapsed'),expanded:document.querySelector('[data-testid="dock-file-tree-toggle"]').getAttribute('aria-expanded'),stored:localStorage.getItem('fielora:dock-file-tree-width'),held:[editor.style.width,tree.firstElementChild.style.width,rows.style.width]};})()`);
  const before=await state();
  const press=()=>cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',clickCount:1});
  const move=x=>cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:before.y,button:'left',buttons:1});
  const release=x=>cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y:before.y,button:'left',clickCount:1});
  await press();await move(before.x+60);await pause(120);
  const moving=await state();
  assert.ok(Math.abs(moving.tree-before.tree+60)<2,'Tree viewport follows the pointer');
  assert.ok(Math.abs(moving.rows-before.rows+60)<2,'Visible directory rows adapt before pointer release');
  assert.ok(Math.abs(moving.body-moving.tree)<2&&Math.abs(moving.editor-moving.content)<2,'Scrollports follow their pane widths during dragging');
  assert.equal(moving.stored,before.stored);
  await captureScreenshot(cdp,path.join(evidence,'during-drag.png'));
  await move(before.right-20);await pause(120);
  const edge=await state();
  assert.ok(edge.collapsed&&edge.tree<1&&edge.expanded==='false','Right edge collapses the same directory state as the toolbar');
  assert.ok(await cdp.eval(`document.documentElement.dataset.resizing==='vertical'`),'Pointer gesture survives collapse');
  await move(before.x);await pause(120);
  const reversed=await state();
  assert.ok(!reversed.collapsed&&Math.abs(reversed.tree-before.tree)<2,'Reverse the same gesture to restore');
  await release(before.x);await pause(350);
  const restored=await state();
  assert.deepEqual(restored.held,['','',''],'Release restores responsive layout');
  await press();await move(before.right-20);await pause(80);await release(before.right-20);await pause(350);
  const closed=await state();
  assert.ok(closed.collapsed&&Math.abs(closed.content-closed.layout)<2&&Math.abs(closed.editor-closed.content)<2,'After release code uses the full available space');
  assert.equal(closed.stored,restored.stored,'Collapse preserves the expanded width preference');
  await captureScreenshot(cdp,path.join(evidence,'directory-collapsed.png'));
  await cdp.eval(`document.querySelector('[data-testid="dock-file-tree-toggle"]').click()`);await pause(350);
  const reopened=await state();assert.ok(!reopened.collapsed&&Math.abs(reopened.tree-before.tree)<2);
  await press();await move(before.x+25);await pause(80);await cdp.eval(`window.dispatchEvent(new Event('blur'))`);await pause(350);
  await release(before.x+25);
  const cancelled=await state();assert.deepEqual(cancelled.held,['','','']);
  assert.ok(await cdp.eval(`!document.documentElement.dataset.resizing`));
  records.collapse={before,moving,edge,reversed,restored,closed,reopened,cancelled};
}

try {
  await mkdir(evidence,{recursive:true});
  if(!process.env.FIELORA_READONLY_PROFILE_PROJECT) {
    for(let folder=0;folder<125;folder++) {
      const dir=path.join(projectRoot,`src/feature-${String(folder).padStart(3,'0')}/components`);
      await mkdir(dir,{recursive:true});
      for(let i=0;i<20;i++)await writeFile(path.join(dir,`component-${i}.ts`),Array.from({length:folder===0&&i===0?400:35},(_,j)=>`export const value${j} = '用于测试文件展示和目录同时展开时的实际拖动，缩放期间代码应实时换行，原生滚动条始终贴着页面边缘';`).join('\n'));
    }
  }
  const launched=await launchElectron({root,dataRoot,executablePath:process.env.FIELORA_PACKAGED_APP??'',args:[...renderingTestArgs,`--user-data-dir=${path.join(dataRoot,'profile')}`],output});child=launched.child;
  cdp=await connectToFieloraApp({...launched,enablePage:true});
  cdp.socket.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.method==='Runtime.exceptionThrown')console.log('RENDERER_EXCEPTION',JSON.stringify(m.params));});
  await wait(`window.fieloraTest&&document.querySelector('[data-testid="project-workspace"]')`);
  await cdp.eval(`window.fieloraTest.resizeWindow({width:1180,height:620})`);
  await cdp.eval(`(async()=>{const p=await window.fieloraTest.createProject({title:'File drag profile',goal:'Profile file pane',root_path:${JSON.stringify(projectRoot)}});await window.fielora.conversation.create({field_id:p.field_id,title:'File drag profile',provider_config_id:null,model_id:null});})()`);
  await cdp.eval(`localStorage.setItem('fielora:workspace-navigation-width','224');localStorage.setItem('fielora:project-workspace-width','490');location.reload()`);await wait(`document.querySelector('.conversation-heading')`);
  await cdp.send('Performance.enable');
  const trace=[];
  const traced=new Promise(resolve=>cdp.socket.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.method==='Tracing.dataCollected')trace.push(...m.params.value);if(m.method==='Tracing.tracingComplete')resolve();}));
  await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing',transferMode:'ReportEvents'});
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace-launcher'))`);await pause(450);
  const outer='[data-testid="project-workspace-resizer"]';
  const inner='.right-dock-view-file:not([hidden]) [data-testid="dock-file-tree-resizer"]';
  await drag('empty-dock',outer);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);await wait(`document.querySelector('[data-testid="workspace-file"]')`);
  await drag('files-only',outer);
  const wanted=process.env.FIELORA_READONLY_PROFILE_PROJECT?'02 IIFE.js':'component-0.ts';
  await cdp.eval(`[...document.querySelectorAll('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')].find(e=>e.textContent.trim()===${JSON.stringify(wanted)}).click()`);
  await wait(`document.querySelector('.right-dock-view-file:not([hidden]) .cm-scroller')`);await pause(500);
  assert.ok(await cdp.eval(`!document.querySelector('[data-testid="review-change"]')`),'Opening a file must not change its line endings or create an edit');
  records.environment=await cdp.eval(`({nodes:document.querySelectorAll('*').length,rows:document.querySelector('.right-dock-view-file:not([hidden])').querySelectorAll('[role="treeitem"]').length,totalRows:Number(document.querySelector('.right-dock-view-file:not([hidden]) .workspace-file-tree').dataset.totalRows),lines:Number(document.querySelector('.right-dock-view-file:not([hidden]) [data-source-lines]').dataset.sourceLines),viewport:[innerWidth,innerHeight]})`);
  await drag('file-and-tree-outer',outer);
  await drag('file-and-tree-inner',inner);
  if(process.env.FIELORA_TREE_FREEZE_ABLATION==='1') {
    await cdp.eval(`(()=>{const body=document.querySelector('.right-dock-view-file:not([hidden]) .dock-file-tree-body');body.style.width=body.getBoundingClientRect().width+'px';})()`);
    await drag('frozen-tree-outer',outer);await drag('frozen-tree-inner',inner);
  }
  if(process.env.FIELORA_VERIFY_FILE_DRAG==='1') {
    for(const label of ['empty-dock','files-only','file-and-tree-outer','file-and-tree-inner'])assert.ok(records[label].p95<25,`${label}: sustained frame stalls`);
    await verifyTreeCollapse();
    await verifyDirectoryWindow();
  }
  await captureScreenshot(cdp,path.join(evidence,'workspace.png'));
  await cdp.send('Tracing.end');await traced;
  await writeFile(path.join(evidence,'trace.json'),JSON.stringify({traceEvents:trace}));
  assert.ok(await cdp.eval(`!document.documentElement.dataset.resizing`));
  console.log('FILE_PANE_DRAG_PROFILE: COMPLETE');
} finally {
  await writeFile(path.join(evidence,'metrics.json'),JSON.stringify(records,null,2));
  cdp?.close();await cleanupElectronProcess(child);
  await rm(dataRoot,{recursive:true,force:true,maxRetries:8,retryDelay:150});
}
