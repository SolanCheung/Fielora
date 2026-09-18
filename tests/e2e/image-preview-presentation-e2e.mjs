import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-image-presentation-'));
const projectRoot = path.join(dataRoot, 'project');
const evidence = path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR ?? path.join(root, 'artifacts/image-preview-presentation'));
const baseline = process.argv.includes('--baseline');
const paths = [path.join(dataRoot, 'first.png'), path.join(dataRoot, 'second.png')];
const output = [];
const results = [];
let child, cdp;
const wait = expression => waitForExpression(cdp, expression, { output });
async function click(selector) {
  const p = await cdp.eval(`(() => {const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
  assert.ok(p.hit, `Control must be hit-testable: ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type:'mousePressed', x:p.x, y:p.y, button:'left', clickCount:1 });
  await cdp.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:p.x, y:p.y, button:'left', clickCount:1 });
}
try {
  await mkdir(projectRoot); await mkdir(evidence, { recursive:true });
  const launched = await launchElectron({ root, dataRoot, output,
    executablePath: process.env.FIELORA_PACKAGED_APP,
    args:[`--user-data-dir=${path.join(dataRoot, 'profile')}`, '--disable-features=CalculateNativeWinOcclusion'],
    extraEnv:{FIELORA_E2E_ATTACHMENT_PATHS:JSON.stringify(paths)},
  });
  child = launched.child;
  cdp = await connectToFieloraApp({ ...launched, enablePage:true });
  await wait('window.fieloraTest && document.querySelector("[data-testid=project-workspace]")');
  await cdp.eval('window.fieloraTest.resizeWindow({width:1480,height:760})');
  const provider = await cdp.eval("window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'图片展示检查',base_url:'https://example.com/v1',default_model:'qwen3.7-plus',custom_endpoint_acknowledged:true})");
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'图片展示检查',goal:null,root_path:${JSON.stringify(projectRoot)}})`);
  const conversation = await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'查看图片',provider_config_id:${JSON.stringify(provider.id)},model_id:'qwen3.7-plus'})`);
  const message = await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(conversation.id)},role:'USER',content:'请查看这两张图片。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null})`);
  const attachments = [];
  for (let i=0; i<2; i++) {
    const url = await cdp.eval(`(() => {const c=document.createElement('canvas');c.width=1320;c.height=620;const x=c.getContext('2d');x.fillStyle=${JSON.stringify(i ? '#e6e0fa' : '#e0edf5')};x.fillRect(0,0,1320,620);x.fillStyle='#355b85';x.fillRect(32,32,1256,68);x.fillStyle='white';x.font='26px sans-serif';x.fillText('Image preview fixture ${i+1}',56,77);x.fillStyle='white';x.fillRect(280,155,760,340);x.fillStyle='#485465';x.font='24px sans-serif';x.fillText('Local image — no external requests',340,225);return c.toDataURL('image/png');})()`);
    const bytes = Buffer.from(url.split(',')[1], 'base64');
    await writeFile(paths[i], bytes);
    attachments.push(await cdp.eval(`window.fielora.workspace.storeAttachment(${JSON.stringify({id:createHash('sha256').update(bytes).digest('hex'),name:path.basename(paths[i]),size:bytes.length,mime_type:'image/png',data_url:url,width:1320,height:620,source:'file_picker'})})`));
  }
  await cdp.eval(`localStorage.setItem('fielora:conversation-message-attachments:${message.id}',${JSON.stringify(JSON.stringify(attachments.map(a=>({...a,data_url:null}))))});location.reload()`);
  await wait(`document.querySelector('[data-testid="conversation-${conversation.id}"]')`);
  await click(`[data-testid="conversation-${conversation.id}"]`);
  await wait('document.querySelectorAll("[data-testid=attachment-thumbnail-conversation] img").length===2 && [...document.querySelectorAll("[data-testid=attachment-thumbnail-conversation] img")].every(i=>i.naturalWidth===1320)');
  await click('[data-testid=composer-add-attachment]');
  await wait('document.querySelectorAll("[data-testid=attachment-thumbnail-composer] img").length===2');
  const thumbnails = await cdp.eval(`[...document.querySelectorAll('.attachment-thumbnail')].map(e=>({text:e.innerText,footer:!!e.querySelector('footer'),name:e.querySelector('.attachment-thumbnail-image').getAttribute('aria-label'),ready:!e.querySelector('.attachment-thumbnail-image').disabled}))`);
  if (!baseline) assert.ok(thumbnails.every(t=>!t.footer && !t.text && t.name.includes('.png') && t.ready), JSON.stringify(thumbnails));
  if (!baseline) assert.ok(await cdp.eval(`[...document.querySelectorAll('.attachment-thumbnail')].every(e=>{const s=getComputedStyle(e),i=e.querySelector('img');return s.borderTopWidth==='0px' && s.paddingTop==='0px' && s.backgroundColor==='rgba(0, 0, 0, 0)' && Math.abs(i.getBoundingClientRect().width/i.getBoundingClientRect().height-i.naturalWidth/i.naturalHeight)<0.02})`), 'Thumbnails display the actual image ratio without a card frame');
  await captureScreenshot(cdp, path.join(evidence,'thumbnails.png'));
  await click('[data-testid=attachment-thumbnail-composer] button[aria-label^="移除"]');
  await wait('document.querySelectorAll("[data-testid=attachment-thumbnail-composer]").length===1');
  await click('[data-testid=attachment-thumbnail-conversation] .attachment-thumbnail-image');
  await wait('document.querySelector(".dock-image-preview img")?.naturalWidth===1320');
  await wait('!document.querySelector(".project-layout").getAnimations().some(a=>a.playState==="running")');

  for (const size of [{width:1480,height:760},{width:900,height:620},{width:1600,height:1000}]) {
    await cdp.eval(`window.fieloraTest.resizeWindow(${JSON.stringify(size)})`);
    await new Promise(resolve=>setTimeout(resolve,350));
    await click('.dock-image-preview > button');
    await wait('document.querySelector("[data-testid=image-preview] img")?.naturalWidth===1320');
    const bounds = await cdp.eval(`(() => {const r=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right};};const chrome=r(document.querySelector('.desktop-chrome'));const modal=document.querySelector('[data-testid=image-preview]');const controls=[...modal.querySelectorAll('header button')].map(e=>{const b=e.getBoundingClientRect();return {...r(e),hit:e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))};});return {chrome,backdrop:r(modal),shell:r(modal.querySelector('section')),controls,viewport:{width:innerWidth,height:innerHeight}};})()`);
    results.push({size,...bounds});
    if (!baseline) {
      assert.ok(await cdp.eval(`['.image-preview-shell','.image-preview-canvas'].every(selector=>{const s=getComputedStyle(document.querySelector(selector));return s.borderTopWidth==='0px' && s.backgroundColor==='rgba(0, 0, 0, 0)'})`), 'Lightbox must not paint a white image frame');
      assert.ok(bounds.backdrop.top >= bounds.chrome.bottom-0.5, 'Preview backdrop must not cover native titlebar');
      assert.ok(bounds.shell.top >= bounds.chrome.bottom && bounds.shell.bottom <= bounds.viewport.height);
      assert.ok(bounds.controls.every(c=>c.hit && c.top>=bounds.chrome.bottom && c.right<=bounds.viewport.width), 'Image controls must be separate from native window controls and remain clickable');
    }
    await click('[aria-label="放大图片"]');
    await wait('document.querySelector(".image-preview-shell output").textContent==="125%"');
    await click('[aria-label="缩小图片"]');
    await wait('document.querySelector(".image-preview-shell output").textContent==="100%"');
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:200});
    await captureScreenshot(cdp,path.join(evidence,`preview-${size.width}.png`));
    await click('[aria-label="关闭图片预览"]');
    await wait('!document.querySelector("[data-testid=image-preview]")');
  }
  await click('.dock-image-preview > button');
  await wait('document.querySelector("[data-testid=image-preview]")');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await wait('!document.querySelector("[data-testid=image-preview]")');
  await click('.dock-image-preview > button');
  await wait('document.querySelector("[data-testid=image-preview] img")');
  await click('[data-testid=image-preview] img');
  assert.ok(await cdp.eval('!!document.querySelector("[data-testid=image-preview]")'), 'Clicking the image keeps the preview open');
  // Transparent space between the floating controls and image closes the preview.
  const blank=await cdp.eval("(()=>{const r=document.querySelector('.image-preview-shell').getBoundingClientRect();return {x:r.x+4,y:r.y+4}})()");
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:blank.x,y:blank.y,button:'left',clickCount:1});
  await wait('!document.querySelector("[data-testid=image-preview]")');
  await cdp.eval('location.reload()');
  await wait(`document.querySelector('[data-testid="conversation-${conversation.id}"]')`);
  await click(`[data-testid="conversation-${conversation.id}"]`);
  await wait('document.querySelectorAll("[data-testid=attachment-thumbnail-conversation] img").length===2 && [...document.querySelectorAll("[data-testid=attachment-thumbnail-conversation] img")].every(i=>i.naturalWidth===1320)');
  console.log(baseline ? 'IMAGE_PRESENTATION_BASELINE_CAPTURED' : 'IMAGE_PRESENTATION_E2E: PASS');
} finally {
  await writeFile(path.join(evidence,'bounds.json'),JSON.stringify(results,null,2));
  await writeFile(path.join(evidence,'electron.log'),output.join(''));
  cdp?.close();
  await cleanupElectronProcess(child);
}
