import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  captureScreenshot,
  cleanupElectronProcess,
  connectToFieloraApp,
  launchElectron,
  waitForChildExit,
  waitForExpression,
} from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-navigation-settings-'));
const projectRoot = path.join(dataRoot, 'project');
const evidenceDir = path.join(root, 'artifacts', 'visual-golden-calibration');
const output = [];
let child;

const wait = (cdp, expression, timeoutMs = 30_000) => waitForExpression(cdp, expression, { timeoutMs, output });

async function resizeWindow(cdp, width, height) {
  await cdp.eval(`window.fieloraTest.resizeWindow({width:${width},height:${height}})`);
  await wait(cdp, `Math.abs(innerWidth-${width})<=2&&Math.abs(innerHeight-${height})<=2`);
  await new Promise((resolve) => setTimeout(resolve, 120));
}

async function dragNavigation(cdp, delta, steps = 8) {
  const divider = await cdp.eval(`(()=>{const rect=document.querySelector('[data-testid="project-navigation-resizer"]').getBoundingClientRect();return{x:rect.x+rect.width/2,y:rect.y+Math.min(160,rect.height/2)};})()`);
  const widths = [];
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: divider.x, y: divider.y, button: 'left', clickCount: 1 });
  for (let index = 1; index <= steps; index += 1) {
    const x = divider.x + delta * index / steps;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: divider.y, button: 'left', buttons: 1 });
    await new Promise((resolve) => setTimeout(resolve, 24));
    widths.push(await cdp.eval(`document.querySelector('[data-testid="project-navigation"]').getBoundingClientRect().width`));
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: divider.x + delta, y: divider.y, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 160));
  return widths;
}

function assertSmoothGrowth(widths) {
  assert.ok(widths.length >= 6, `missing intermediate resize frames: ${widths.join(', ')}`);
  for (let index = 1; index < widths.length; index += 1) {
    assert.ok(widths[index] >= widths[index - 1], `navigation width regressed during drag: ${widths.join(', ')}`);
  }
  assert.ok(widths.at(-1) - widths[0] > 140, `navigation did not use the expanded range: ${widths.join(', ')}`);
}

try {
  await mkdir(projectRoot, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  const launched = await launchElectron({
    root,
    dataRoot,
    output,
    executablePath: process.env.FIELORA_PACKAGED_APP ?? '',
  });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fieloraTest&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`, 60_000);
  await resizeWindow(cdp, 1600, 900);

  const setup = await cdp.eval(`(async()=>{
    const project=await window.fieloraTest.createProject({title:'Navigation Settings',goal:'Focused navigation and Settings verification',root_path:${JSON.stringify(projectRoot)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'自适应对话',provider_config_id:null,model_id:null});
    return{projectId:project.field_id,conversationId:conversation.id};
  })()`);
  await cdp.eval(`(()=>{localStorage.removeItem('fielora:workspace-navigation-width');localStorage.removeItem('fielora:project-navigation-width');localStorage.removeItem('fielora:settings-navigation-width');location.reload();})()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')&&document.querySelector('[data-testid="project-navigation-resizer"]')`);

  const initial = await cdp.eval(`(()=>{const nav=document.querySelector('[data-testid="project-navigation"]').getBoundingClientRect();const separator=document.querySelector('[data-testid="project-navigation-resizer"]');return{width:nav.width,min:Number(separator.getAttribute('aria-valuemin')),max:Number(separator.getAttribute('aria-valuemax'))};})()`);
  assert.ok(Math.abs(initial.width - 304) <= 2, JSON.stringify(initial));
  assert.equal(initial.min, 220);
  assert.ok(initial.max >= 500, JSON.stringify(initial));

  const resizeFrames = await dragNavigation(cdp, 200);
  assertSmoothGrowth(resizeFrames);
  const expanded = await cdp.eval(`(()=>{const nav=document.querySelector('[data-testid="project-navigation"]').getBoundingClientRect();return{width:nav.width,stored:Number(localStorage.getItem('fielora:workspace-navigation-width'))};})()`);
  assert.ok(expanded.width > 490, JSON.stringify(expanded));
  assert.ok(Math.abs(expanded.width - expanded.stored) <= 2, JSON.stringify(expanded));
  await captureScreenshot(cdp, path.join(evidenceDir, '06-navigation-wide.png'));

  const beforeCollapse = await cdp.eval(`(()=>{const rect=(selector)=>{const value=document.querySelector(selector).getBoundingClientRect();return{left:value.left,right:value.right,width:value.width};};return{surface:rect('[data-testid="project-workspace-surface"]'),conversation:rect('.conversation-column'),navigation:rect('[data-testid="project-navigation"]')};})()`);
  await cdp.eval(`document.querySelector('[data-testid="chrome-sidebar-toggle"]').click()`);
  await wait(cdp, `document.body.dataset.sidebarCollapsed==='true'&&document.querySelector('[data-testid="project-navigation"]').getBoundingClientRect().width<1`);
  await new Promise((resolve) => setTimeout(resolve, 360));
  const collapsed = await cdp.eval(`(()=>{const rect=(selector)=>{const value=document.querySelector(selector).getBoundingClientRect();return{left:value.left,right:value.right,width:value.width};};return{surface:rect('[data-testid="project-workspace-surface"]'),conversation:rect('.conversation-column'),navigation:rect('[data-testid="project-navigation"]')};})()`);
  assert.ok(Math.abs(collapsed.conversation.left - collapsed.surface.left) <= 1, JSON.stringify(collapsed));
  assert.ok(collapsed.conversation.width > beforeCollapse.conversation.width + beforeCollapse.navigation.width - 3, JSON.stringify({ beforeCollapse, collapsed }));
  await captureScreenshot(cdp, path.join(evidenceDir, '07-navigation-collapsed-adaptive.png'));

  await cdp.eval(`document.querySelector('[data-testid="chrome-sidebar-toggle"]').click()`);
  await wait(cdp, `document.body.dataset.sidebarCollapsed==='false'&&Math.abs(document.querySelector('[data-testid="project-navigation"]').getBoundingClientRect().width-${expanded.stored})<=2`);
  await cdp.eval(`document.querySelector('[data-testid="settings-nav"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-screen"]')`);
  await cdp.eval(`document.querySelector('[data-testid="settings-category-appearance"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-appearance"]')`);
    await resizeWindow(cdp, 1440, 620);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 420,
      deviceScaleFactor: 1,
      mobile: false,
    });

  const settings = await cdp.eval(`(()=>{
    const surface=document.querySelector('[data-testid="settings-screen"]');
    const content=document.querySelector('.settings-content');
    const appearance=document.querySelector('[data-testid="settings-appearance"]');
    const style=getComputedStyle(content);
    return{
      sharedSurface:surface.classList.contains('workspace-surface'),
      projectTools:Boolean(document.querySelector('.project-context-controls,.utility-control-dock')),
      overflowX:style.overflowX,
      overflowY:style.overflowY,
      scrollHeight:content.scrollHeight,
      clientHeight:content.clientHeight,
      text:appearance.innerText,
      retained:['appearance-font-scale','appearance-reduced-motion','appearance-high-contrast','appearance-smooth-scrolling'].every((id)=>document.querySelector('[data-testid="'+id+'"]')),
    };
  })()`);
  assert.equal(settings.sharedSurface, true);
  assert.equal(settings.projectTools, false);
  assert.equal(settings.overflowX, 'hidden');
  assert.equal(settings.overflowY, 'auto');
  assert.ok(settings.scrollHeight > settings.clientHeight, JSON.stringify(settings));
  assert.equal(settings.retained, true);
  for (const removed of ['Glass 不是一个主题选项', '官方设计语言', '高级颜色', '导入主题']) assert.equal(settings.text.includes(removed), false, `Appearance still contains ${removed}`);
  await cdp.eval(`document.querySelector('.settings-content').scrollTo({ top: document.querySelector('.settings-content').scrollHeight, behavior: 'instant' })`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const settingsScrollTop = await cdp.eval(`document.querySelector('.settings-content').scrollTop`);
  assert.ok(settingsScrollTop > 0, JSON.stringify({ settingsScrollTop, settings }));
  await captureScreenshot(cdp, path.join(evidenceDir, '08-settings-appearance-scroll.png'));

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([waitForChildExit(child), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('WORKSPACE_NAVIGATION_SETTINGS_E2E: PASS');
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }).catch(() => undefined);
}
