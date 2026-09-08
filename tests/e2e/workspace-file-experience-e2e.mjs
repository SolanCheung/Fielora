import { renderingTestArgs } from './harness/file-editor-harness.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchElectron, connectToFieloraApp, waitForExpression, waitForChildExit, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-file-experience-'));
const projectRoot = path.join(dataRoot, 'project');
const evidence = path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR ?? path.join(root, 'artifacts/workspace-file-experience'));
const output = [];
let child;
let cdp;
const view = '.right-dock-view-file:not([hidden])';
const input = `${view} .cm-scroller`;
const filter = `${view} [data-testid="workspace-file-filter"]`;
const wait = (expression) => waitForExpression(cdp, expression, { output });
const pause = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
const records = {};

async function verifyCodeGutter() {
  const rows = await cdp.eval(`(()=>{const scroller=document.querySelector(${JSON.stringify(input)}),bounds=scroller.getBoundingClientRect(),numbers=[...scroller.querySelectorAll('.cm-lineNumbers .cm-gutterElement')];return [...scroller.querySelectorAll('.cm-content .cm-line')].filter(e=>{const r=e.getBoundingClientRect();return r.top>=bounds.top&&r.top<bounds.bottom;}).map(e=>{const line=e.textContent.match(/line(\\d+) =/)?.[1],number=numbers.find(n=>n.textContent===line);return{line,delta:number?Math.abs(number.getBoundingClientRect().top-e.getBoundingClientRect().top):null};});})()`);
  assert.ok(rows.length>0&&rows.every(row=>row.delta!==null&&row.delta<2),'Visible source lines and their numbers must share the same scroll and wrap geometry');
  return rows;
}

async function click(selector) {
  const point = await cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+Math.min(r.height/2,80);return{x,y,hit:e.contains(document.elementFromPoint(x,y))};})()`);
  assert.ok(point.hit, `Click is obstructed: ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

async function typeFilter(value) {
  await click(filter);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await cdp.send('Input.insertText', { text: value });
  await pause(150);
}

async function fileNames() {
  return cdp.eval(`[...document.querySelectorAll('${view} [data-testid="workspace-file"]')].map(e=>e.textContent.trim())`);
}

async function sampleTreeMotion() {
  return cdp.eval(`new Promise(resolve=>{
    const layout=document.querySelector('${view} .dock-resource-layout');
    const tree=layout.querySelector('.dock-resource-file-tree');
    const body=tree.firstElementChild;
    const values=[],start=performance.now();
    document.querySelector('[data-testid="dock-file-tree-toggle"]').click();
    const sample=()=>{values.push({time:performance.now()-start,width:tree.getBoundingClientRect().width,body:body.getBoundingClientRect().width,visibility:getComputedStyle(tree).visibility,opacity:getComputedStyle(tree).opacity});if(performance.now()-start<650)requestAnimationFrame(sample);else resolve(values);};
    requestAnimationFrame(sample);
  })`);
}

async function sampleDockMotion() {
  return cdp.eval(`new Promise(resolve=>{
    const dock=document.querySelector('[data-testid="right-workspace-dock"]'),content=dock.querySelector('.right-dock-active-view');
    const values=[],start=performance.now();
    document.querySelector('[data-testid="chrome-tools"]').click();
    const sample=()=>{values.push({time:performance.now()-start,width:dock.getBoundingClientRect().width,content:content.getBoundingClientRect().width,visibility:getComputedStyle(dock).visibility,opacity:getComputedStyle(dock).opacity});if(performance.now()-start<650)requestAnimationFrame(sample);else resolve(values);};
    requestAnimationFrame(sample);
  })`);
}

async function dragTree(delta) {
  const point=await cdp.eval(`(()=>{const r=document.querySelector('${view} [data-testid="dock-file-tree-resizer"]').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+100};})()`);
  const samples=[];
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
  for(let step=1;step<=10;step++) {
    const x=point.x+delta*step/10;
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:point.y,button:'left',buttons:1});
    await pause(20);
    samples.push(await cdp.eval(`(()=>{const r=document.querySelector('${view} [data-testid="dock-file-tree-resizer"]').getBoundingClientRect();return{x:r.left+r.width/2,stored:localStorage.getItem('fielora:dock-file-tree-width'),numbersVisible:getComputedStyle(document.querySelector('${view} .cm-scroller')).visibility};})()`));
    assert.ok(Math.abs(samples.at(-1).x-x)<3,'Inner divider must track the pointer');
  }
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+delta,y:point.y,button:'left',clickCount:1});
  await pause();
  assert.equal(new Set(samples.map(s=>s.stored)).size,1,'Storage must not change during drag');
  assert.ok(samples.every(s=>s.numbersVisible==='visible'),'Line numbers must stay visible during drag');
  return samples;
}

try {
  await mkdir(path.join(projectRoot, 'apps/desktop/src/renderer/ui'), { recursive: true });
  await mkdir(evidence, { recursive: true });
  const code = Array.from({ length: 400 }, (_, i) => `export const line${i + 1} = 'This long source line must use all available width, wrap only at the current viewport edge, and remain scrollable.';`).join('\r\n');
  await writeFile(path.join(projectRoot, 'apps/desktop/src/renderer/ui/Example.tsx'), code);
  for (const name of ['alpha.ts', 'notes.md', 'component.tsx', 'styles.css', 'config.json']) await writeFile(path.join(projectRoot, 'apps/desktop/src/renderer', name), `// ${name}\n`);
  await writeFile(path.join(projectRoot, 'eslint.config.mjs'), 'export default [];\n');
  for (let i = 0; i < 60; i++) await writeFile(path.join(projectRoot, `item-${i}.txt`), 'text\n');
  const launched = await launchElectron({ root, dataRoot, executablePath: process.env.FIELORA_PACKAGED_APP ?? '', args: [...renderingTestArgs,`--user-data-dir=${path.join(dataRoot,'electron-profile')}`], output });
  child = launched.child;
  cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(`document.querySelector('[data-testid="project-workspace"]')&&window.fieloraTest`);
  await cdp.eval(`window.fieloraTest.resizeWindow({width:1440,height:800})`);
  await pause();
  await cdp.eval(`(async()=>{const p=await window.fieloraTest.createProject({title:'File experience',goal:'Verify file controls',root_path:${JSON.stringify(projectRoot)}});await window.fielora.conversation.create({field_id:p.field_id,title:'文件工作区验证',provider_config_id:null,model_id:null});})()`);
  await cdp.eval('location.reload()');
  await wait(`document.querySelector('.conversation-heading')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(`document.querySelector('[data-testid="workspace-file"]')`);
  await pause();
  await cdp.eval(`[...document.querySelectorAll('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')].find(e=>e.textContent.includes('Example.tsx')).click()`);
  await wait(`document.querySelector(${JSON.stringify(input)})`);
  await pause();
  assert.ok(await cdp.eval(`!document.querySelector('[data-testid="review-change"]')`),'Opening CRLF source must not mark it modified');
  records.before = await cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(input)});const h=document.querySelector('${view} .cm-scroller');return{height:e.clientHeight,scrollHeight:e.scrollHeight,top:e.scrollTop,highlightHeight:h.clientHeight,highlightScrollHeight:h.scrollHeight,editorStyle:getComputedStyle(e).cssText,hit:document.elementFromPoint(e.getBoundingClientRect().left+70,e.getBoundingClientRect().top+70)?.outerHTML.slice(0,180)};})()`);
  const point = await cdp.eval(`(()=>{const r=document.querySelector(${JSON.stringify(input)}).getBoundingClientRect();return{x:r.left+70,y:r.top+70};})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 600 });
  await pause();
  records.afterScroll = await cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(input)});const h=document.querySelector('${view} .cm-scroller');return{top:e.scrollTop,highlightTop:h.scrollTop,firstLine:document.querySelector('${view} .cm-content .cm-line')?.textContent};})()`);
  await typeFilter('alpha');
  records.filter = await cdp.eval(`(()=>{const tree=document.querySelector('${view} .workspace-file-tree');return{value:document.querySelector(${JSON.stringify(filter)}).value,files:[...tree.querySelectorAll('[data-testid="workspace-file"]')].map(e=>e.textContent),text:tree.textContent};})()`);
  await writeFile(path.join(evidence, 'metrics.json'), JSON.stringify(records, null, 2));
  await captureScreenshot(cdp, path.join(evidence, 'files.png'));
  console.log(JSON.stringify(records));
  assert.ok(records.afterScroll.top > 300, 'Wheel must scroll real code input');
  records.scrolledGutter = await verifyCodeGutter();
  assert.deepEqual(records.filter.files.map(name => name.trim()), ['alpha.ts']);
  await click(`${view} [data-testid="workspace-file-filter-clear"]`);
  assert.ok((await fileNames()).length>60,'Clear must restore the full tree');
  await typeFilter('APPS\\DESKTOP alpha');
  assert.deepEqual(await fileNames(),['alpha.ts']);
  await typeFilter('no-file-with-this-name');
  assert.deepEqual(await fileNames(),[]);
  assert.ok(await cdp.eval(`document.querySelector('${view} .workspace-file-tree').textContent.includes('没有匹配')`));
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await pause();
  assert.ok((await fileNames()).length>60,'Escape must clear the filter');
  records.presentation=await cdp.eval(`(()=>{
    const rect=s=>document.querySelector(s).getBoundingClientRect();
    const toolbar=rect('[data-testid="right-dock-toolbar"]'),search=rect('${filter}');
    const guide=document.querySelector('${view} .file-tree-children');
    return{filterGap:search.top-toolbar.bottom,toggleLeft:rect('[data-testid="dock-file-tree-toggle"]').right,openerLeft:rect('.dock-project-launcher').left,border:getComputedStyle(document.querySelector('[data-testid="right-dock-toolbar"]')).borderBottomWidth,guideBefore:getComputedStyle(guide,'::before').opacity,levels:[...document.querySelectorAll('${view} [aria-level]')].map(e=>+e.getAttribute('aria-level')),icons:[...document.querySelectorAll('${view} .file-type-icon')].map(e=>({src:e.src,loaded:e.complete&&e.naturalWidth>0})),tabIcon:document.querySelector('.right-dock-tab.active .file-type-icon')?.src};
  })()`);
  assert.ok(records.presentation.filterGap>=0&&records.presentation.filterGap<=8,'Filter must sit next to toolbar separator');
  assert.ok(records.presentation.toggleLeft<=records.presentation.openerLeft,'Tree toggle must precede folder opener');
  assert.ok(Math.abs(parseFloat(records.presentation.border)-1)<=.21,'Separator must be one CSS pixel subject to device-pixel rounding');
  assert.ok(Math.max(...records.presentation.levels)>=6);
  assert.ok(records.presentation.icons.every(i=>i.loaded),'Packaged file icons must decode');
  assert.match(records.presentation.tabIcon,/react/);
  const hover=await cdp.eval(`(()=>{const r=document.querySelector('${view} .workspace-file-tree').getBoundingClientRect();return{x:r.left+100,y:r.top+50};})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...hover});
  assert.equal(await cdp.eval(`getComputedStyle(document.querySelector('${view} .file-tree-children'),'::before').opacity`),'1');
  records.innerGrow=await dragTree(-60);
  records.innerShrink=await dragTree(60);
  // Keyboard and cancellation must release the geometry lock as well.
  const treeWidth=()=>cdp.eval(`document.querySelector('${view} .dock-resource-file-tree').getBoundingClientRect().width`);
  const keyboardBefore=await treeWidth();
  await cdp.eval(`document.querySelector('${view} [data-testid="dock-file-tree-resizer"]').focus()`);
  for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
  await pause();
  assert.ok(Math.abs((await treeWidth())-keyboardBefore-16)<2);
  for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await pause();
  const cancelPoint=await cdp.eval(`(()=>{const r=document.querySelector('${view} [data-testid="dock-file-tree-resizer"]').getBoundingClientRect();return{x:r.left+2,y:r.top+100};})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...cancelPoint,button:'left',clickCount:1});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cancelPoint.x-20,y:cancelPoint.y,button:'left',buttons:1});
  await pause(40);
  await cdp.eval(`window.dispatchEvent(new Event('blur'))`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...cancelPoint,button:'left',clickCount:1});
  await pause();
  assert.ok(await cdp.eval(`!document.documentElement.dataset.resizing&&[...document.querySelectorAll('${view} .dock-code-editor-surface, ${view} .dock-file-tree-body, ${view} .workspace-file-rows')].every(e=>!e.style.width)&&!document.querySelector('${view} .dock-code-editor-surface').style.getPropertyValue('--code-layout-width')`),'Cancelled drag must restore input, code and directory geometry');
  await dragTree(20);
  const wrappedHeight=await cdp.eval(`document.querySelector(${JSON.stringify(input)}).scrollHeight`);
  records.treeClose=await sampleTreeMotion();
  records.treeOpen=await sampleTreeMotion();
  for(const [label,samples] of [['close',records.treeClose],['open',records.treeOpen]]) {
    assert.ok(new Set(samples.map(s=>Math.round(s.width))).size>=5,label+' must have intermediate widths');
    assert.ok(samples.filter(s=>s.width>5).every(s=>s.visibility==='visible'&&s.opacity==='1'),label+' must reveal real content without blank background');
    assert.ok(samples.filter(s=>s.width>5&&s.width<250).every(s=>s.body>=265),label+' must clip stable content instead of squeezing it');
  }
  await click('[data-testid="dock-file-tree-toggle"]');
  await pause();
  assert.ok(await cdp.eval(`document.querySelector(${JSON.stringify(input)}).scrollHeight<${wrappedHeight}`),'Wider code viewport must show more text per line');
  await click('[data-testid="rail-focus"]');
  await pause();
  assert.ok(await cdp.eval(`document.querySelector('[data-testid="rail-focus"] [data-icon="unfocus"]')!==null`));
  // A real wheel event must reach the final source line, including its gutter.
  const bottomPoint=await cdp.eval(`(()=>{const r=document.querySelector(${JSON.stringify(input)}).getBoundingClientRect();return{x:r.left+90,y:r.top+90};})()`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...bottomPoint,deltaX:0,deltaY:100000});
  await pause();
  records.bottom=await cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(input)}),h=e,last=document.querySelector('${view} .cm-lineNumbers').lastElementChild;return{top:e.scrollTop,max:e.scrollHeight-e.clientHeight,highlightTop:h.scrollTop,line:last.textContent,lastBottom:last.getBoundingClientRect().bottom,viewportBottom:e.getBoundingClientRect().bottom};})()`);
  assert.ok(Math.abs(records.bottom.top-records.bottom.max)<2);
  assert.ok(Math.abs(records.bottom.top-records.bottom.highlightTop)<2);
  assert.equal(records.bottom.line,'400');
  assert.ok(records.bottom.lastBottom<=records.bottom.viewportBottom);
  records.bottomGutter = await verifyCodeGutter();
  await cdp.eval(`document.querySelector('${view} .cm-content').focus()`);
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'End',code:'End',windowsVirtualKeyCode:35,modifiers:2});
  await cdp.send('Input.insertText',{text:'\nexport const 编辑验证 = true;'});
  await wait(`document.querySelector('[data-testid="review-change"]')&&document.querySelector('${view} [data-source-lines]').dataset.sourceLines==='401'`);
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});
  await wait(`!document.querySelector('[data-testid="review-change"]')&&document.querySelector('${view} [data-source-lines]').dataset.sourceLines==='400'`);
  records.editUndo = true;
  await captureScreenshot(cdp,path.join(evidence,'code-bottom.png'));
  await click('[data-testid="rail-focus"]');
  await pause();
  await click('[data-testid="dock-file-tree-toggle"]');
  await pause();
  await cdp.eval(`[...document.querySelectorAll('${view} [data-testid="workspace-file"]')].find(e=>e.textContent.trim()==='alpha.ts').click()`);
  await wait(`document.querySelector('.right-dock-tab.active .file-type-icon')?.src.includes('typescript')`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:650,y:300});
  await pause();
  await captureScreenshot(cdp,path.join(evidence,'tree-and-tabs.png'));
  records.dockClose=await sampleDockMotion();
  records.dockOpen=await sampleDockMotion();
  for(const [label,samples] of [['dock close',records.dockClose],['dock open',records.dockOpen]]) {
    assert.ok(new Set(samples.map(s=>Math.round(s.width))).size>=5,label+' must slide through intermediate widths');
    const fullWidth=Math.max(...samples.map(s=>s.content));
    assert.ok(samples.filter(s=>s.width>5).every(s=>s.opacity==='1'&&s.visibility==='visible'),label+' must keep content visible');
    assert.ok(samples.filter(s=>s.width>5).every(s=>s.content>=fullWidth-2),label+' must clip the existing content instead of squeezing it');
  }
  await cdp.eval(`[...document.querySelectorAll('${view} [data-testid="workspace-file"]')].find(e=>e.textContent.trim()==='Example.tsx').click()`);
  await wait(`document.querySelector('${view} [data-source-lines]')?.dataset.sourceLines==='400'`);
  await cdp.eval(`document.querySelector('${view} .cm-content').focus()`);
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Home',code:'Home',windowsVirtualKeyCode:36,modifiers:2});
  await cdp.send('Input.insertText',{text:'// 编辑验证\n'});
  await wait(`document.querySelector('[data-testid="review-change"]')`);
  const sourcePath=path.join(projectRoot,'apps/desktop/src/renderer/ui/Example.tsx');
  assert.equal(await readFile(sourcePath,'utf8'),code,'Editing remains a draft until accepted');
  await cdp.eval(`document.querySelector('[data-testid="review-change"]').click()`);
  await wait(`document.querySelector('[data-testid="accept-change"]')`);
  await cdp.eval(`document.querySelector('[data-testid="accept-change"]').click()`);
  await wait(`document.querySelector('[data-testid="undo-change"]')`);
  assert.equal(await readFile(sourcePath,'utf8'),'// 编辑验证\r\n'+code,'Native edits preserve CRLF through review and disk save');
  await cdp.eval(`document.querySelector('[data-testid="undo-change"]').click()`);
  await wait(`!document.querySelector('[data-testid="undo-change"]')`);
  assert.equal(await readFile(sourcePath,'utf8'),code,'Undo accepted change restores the exact original file');
  records.saveRoundTrip = true;
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  const restarted=await launchElectron({root,dataRoot,executablePath:process.env.FIELORA_PACKAGED_APP??'',args:[...renderingTestArgs,`--user-data-dir=${path.join(dataRoot,'electron-profile')}`],output});
  child=restarted.child;
  cdp=await connectToFieloraApp({...restarted,enablePage:true});
  await wait(`window.fielora?.core.getHealth().then(h=>h.state==='READY')`);
  await wait(`document.querySelector('.conversation-heading')`);
  records.restart=await cdp.eval(`Promise.all([window.fielora.core.getHealth(),window.fielora.project.list()]).then(([health,projects])=>({core:health.state,projectRestored:projects.some(p=>p.title==='File experience')}))`);
  assert.deepEqual(records.restart,{core:'READY',projectRestored:true});
  assert.doesNotMatch(output.join(''),/Uncaught Exception|spawn .* ENOENT/);
  await writeFile(path.join(evidence,'metrics.json'),JSON.stringify(records,null,2));
  console.log('WORKSPACE_FILE_EXPERIENCE_E2E: PASS');
} finally {
  await writeFile(path.join(evidence,'metrics.json'),JSON.stringify(records,null,2));
  cdp?.close();
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
