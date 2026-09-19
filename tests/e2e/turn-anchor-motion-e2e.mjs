import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-anchor-motion-'));
const evidence = path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR ?? path.join(root, 'artifacts/turn-anchor-motion/dev'));
const output = []; let child; let cdp;
const wait = expression => waitForExpression(cdp, expression, { timeoutMs: 60000, output });
const widths = () => cdp.eval("[...document.querySelectorAll('.conversation-turn-marker > span')].map(e=>e.getBoundingClientRect().width)");
try {
  await mkdir(path.join(dataRoot, 'project')); await mkdir(evidence, { recursive: true });
  const launched = await launchElectron({ root: path.join(root, 'apps/desktop'), dataRoot, output,
    executablePath: process.env.FIELORA_PACKAGED_EXE ?? process.execPath,
    args: process.env.FIELORA_PACKAGED_EXE ? ['--disable-features=CalculateNativeWinOcclusion'] : [path.join(root, 'node_modules/@electron-forge/cli/dist/electron-forge.js'), 'start'],
  });
  child = launched.child;
  cdp = await connectToFieloraApp({ port: launched.port, output, timeoutMs: 120000, enablePage: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false });
  await wait("window.fieloraTest && window.fielora.core.getHealth().then(h=>h.state==='READY')");
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  const fixture = await cdp.eval(`(async()=>{
    const p=await window.fieloraTest.createProject({title:'锚点交互验证',goal:null,root_path:${JSON.stringify(path.join(dataRoot, 'project'))}});
    const provider=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'UI fixture',base_url:'https://example.com/v1',default_model:'presentation-fixture',custom_endpoint_acknowledged:true});
    const c=await window.fielora.conversation.create({field_id:p.field_id,title:'多轮对话锚点动画',provider_config_id:provider.id,model_id:provider.default_model});
    const turns=[];
    for(let i=1;i<=24;i++){
      const u=await window.fielora.conversation.createMessage({conversation_id:c.id,role:'USER',content:'第 '+i+' 轮：排查并修复图片上下文问题',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null,references:[]});turns.push(u.id);
      await window.fielora.conversation.createMessage({conversation_id:c.id,role:'ASSISTANT',content:'已检查第 '+i+' 轮的消息。原图完整保存，继续核对后续提问是否携带图片。\\n\\n'+('检查来源与上下文传递，保留原始需求和验证结果。\\n\\n').repeat(3),status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null,references:[]});
    }return {id:c.id,turns};
  })()`);
  await cdp.send('Page.reload');
  await wait(`document.querySelector('[data-testid="conversation-${fixture.id}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${fixture.id}"]').click()`);
  await wait("document.querySelectorAll('.conversation-turn-marker').length===24");
  await cdp.eval("new Promise(resolve=>{let last='',stable=0;const check=()=>{const r=document.querySelector('.conversation-turn-navigation').getBoundingClientRect();const value=[r.x,r.y,r.width,r.height].join();stable=value===last?stable+1:0;last=value;if(stable>=12)resolve();else requestAnimationFrame(check)};requestAnimationFrame(check)})");
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:950,y:100});
  await cdp.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const center = await cdp.eval("(()=>{const e=document.querySelectorAll('.conversation-turn-marker')[11];e.scrollIntoView({block:'nearest',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+20,y:r.y+r.height/2}})()");
  const before = await widths(); assert.ok(before.every(width=>Math.abs(width-6)<.1),JSON.stringify(before));
  const resting=await cdp.eval("[...document.querySelectorAll('.conversation-turn-marker')].map(e=>({current:e.hasAttribute('aria-current'),opacity:Number(getComputedStyle(e.firstElementChild).opacity),transition:getComputedStyle(e.firstElementChild).transitionProperty,willChange:getComputedStyle(e.firstElementChild).willChange}))");
  assert.ok(resting.every(e=>Math.abs(e.opacity-(e.current?.4:.28))<.01),JSON.stringify(resting));
  assert.ok(resting.every(e=>e.transition==='transform, opacity'&&e.willChange==='transform, opacity'));

  // Pause on transitionrun inside Chromium, before host scheduling can finish the animation.
  await cdp.eval("(()=>{const el=document.querySelectorAll('.conversation-turn-marker > span')[11];window.__anchorSample=null;el.addEventListener('transitionrun',e=>{if(window.__anchorSample || e.propertyName!=='transform')return;const a=el.getAnimations().find(a=>a.transitionProperty==='transform');if(!a)return;a.pause();a.currentTime=100;window.__anchorSample={width:el.getBoundingClientRect().width,duration:a.effect.getTiming().duration};});return getComputedStyle(el).transitionDuration;})()");
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...center });
  await wait('window.__anchorSample');
  const animated=await cdp.eval('window.__anchorSample');
  assert.ok(animated.duration === 200 && animated.width > before[11] && animated.width < 32, JSON.stringify(animated));
  await cdp.eval("document.querySelectorAll('.conversation-turn-marker > span')[11].getAnimations().forEach(a=>a.play())");
  await wait("Math.abs(document.querySelectorAll('.conversation-turn-marker > span')[11].getBoundingClientRect().width-32)<.1");
  const expanded = await widths();
  for (let i=0;i<5;i++) assert.ok(Math.abs(expanded[11+i]-[32,24,18,12,8][i])<.2);
  await wait("document.querySelector('[role=tooltip] .conversation-turn-preview')");
  await wait("document.querySelector('[role=tooltip]') && !document.querySelector('[role=tooltip]').getAnimations().some(a=>a.playState==='running')");
  const preview = await cdp.eval("(()=>{const e=document.querySelector('[role=tooltip]');const r=e.getBoundingClientRect();return{background:getComputedStyle(e).backgroundColor,width:r.width,text:e.innerText,left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()");
  assert.equal(preview.width,400);assert.match(preview.background,/^rgb\(/);
  assert.match(preview.text,/第 12 轮.*图片上下文/s);assert.match(preview.text,/已检查第 12 轮/);
  assert.ok(preview.left > center.x && preview.right <=1280 && preview.top>=44 && preview.bottom<=760);
  await captureScreenshot(cdp,path.join(evidence,'hover-wave-preview.png'));
  const clickPoint=await cdp.eval("(()=>{const el=document.querySelectorAll('.conversation-turn-marker')[11];const r=el.getBoundingClientRect();const x=r.x+20,y=r.y+r.height/2;return{x,y,hit:document.elementFromPoint(x,y)?.closest('button')?.dataset.turnId};})()");
  assert.equal(clickPoint.hit,fixture.turns[11]);
  for (const type of ['mousePressed','mouseReleased']) await cdp.send('Input.dispatchMouseEvent',{type,x:clickPoint.x,y:clickPoint.y,button:'left',clickCount:1});
  await writeFile(path.join(evidence,'click-debug.json'),JSON.stringify(await cdp.eval("({focused:document.activeElement?.dataset.turnId,active:document.querySelector('.conversation-turn-marker[aria-current]')?.dataset.turnId,scroll:document.querySelector('.message-list').scrollTop})")));

  await wait(`document.querySelector('.conversation-turn-marker[aria-current]')?.dataset.turnId===${JSON.stringify(fixture.turns[11])}`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:100});
  await wait("!document.querySelector('[role=tooltip]') && document.querySelectorAll('.conversation-turn-marker > span')[10].getBoundingClientRect().width<7");
  await wait("[...document.querySelectorAll('.conversation-turn-marker > span')].every(e=>Math.abs(e.getBoundingClientRect().width-6)<.1)");
  await captureScreenshot(cdp,path.join(evidence,'resting-navigation.png'));
  // Sample frame delivery while sweeping actual pointer input across the markers.
  const sweepPoints=await cdp.eval("[...document.querySelectorAll('.conversation-turn-marker')].slice(4,20).map(e=>{const r=e.getBoundingClientRect();return{x:r.x+20,y:r.y+r.height/2}})");
  await cdp.eval("window.__anchorFrameGaps=[];window.__anchorSampling=true;requestAnimationFrame(function frame(t){if(!window.__anchorSampling)return;if(window.__anchorLastFrame)window.__anchorFrameGaps.push(t-window.__anchorLastFrame);window.__anchorLastFrame=t;requestAnimationFrame(frame)})");
  for(const point of sweepPoints){await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await cdp.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
  const frameGaps=await cdp.eval('window.__anchorSampling=false;window.__anchorFrameGaps');
  assert.ok(frameGaps.length>=20,'Animation must receive frames throughout the sweep');
  const sorted=frameGaps.toSorted((a,b)=>a-b),frames={count:frameGaps.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1)};
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:100});

  await cdp.eval("document.querySelectorAll('.conversation-turn-marker')[11].focus()");
  for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
  await wait("document.querySelector('[role=tooltip]')?.textContent.includes('第 11 轮')");
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await wait("!document.querySelector('[role=tooltip]')");
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...center});
  await wait("(()=>{const duration=getComputedStyle(document.querySelector('.conversation-turn-marker > span')).transitionDuration;return duration.split(',').every(d=>parseFloat(d)*(d.trim().endsWith('ms')?1:1000)<=1)})()");
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});
  await cdp.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const narrow=await cdp.eval("(()=>{const nav=document.querySelector('.conversation-turn-navigation').getBoundingClientRect();const body=document.querySelector('.message.assistant').getBoundingClientRect();return{navigationRight:nav.right,bodyLeft:body.left,width:nav.width}})()");
  assert.ok(narrow.navigationRight<=narrow.bodyLeft,JSON.stringify(narrow));
  await captureScreenshot(cdp,path.join(evidence,'narrow-navigation.png'));
  await writeFile(path.join(evidence,'summary.json'),JSON.stringify({status:'PASS',modelRequests:0,resting,frames,animated,expanded,preview,narrow,keyboard:true,reducedMotion:true,clickNavigation:true},null,2));
  console.log('TURN_ANCHOR_MOTION_E2E=PASS');
} catch(error) {
  if(cdp)await captureScreenshot(cdp,path.join(evidence,'failure.png')).catch(()=>{});
  throw error;
} finally {
  await writeFile(path.join(evidence,'electron.log'),output.join('')).catch(()=>{});
  cdp?.close();await cleanupElectronProcess(child);
  assert.ok(path.resolve(dataRoot).startsWith(path.resolve(tmpdir())+path.sep));
  await rm(dataRoot,{recursive:true,force:true,maxRetries:12,retryDelay:200});
}
