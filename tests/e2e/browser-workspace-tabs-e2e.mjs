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
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-browser-workspace-tabs-'));
const evidenceRoot = path.join(root, 'artifacts', 'browser-workspace-tabs-v01');
const output = [];
let child;

const wait = (cdp, expression, timeoutMs = 30_000) => waitForExpression(cdp, expression, { timeoutMs, output });

try {
  await mkdir(evidenceRoot, { recursive: true });
  const launched = await launchElectron({
    root,
    dataRoot,
    output,
    executablePath: process.env.FIELORA_PACKAGED_APP ?? '',
  });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]') && window.fieloraTest && window.fielora.core.getHealth().then((health)=>health.state==='READY')`, 60_000);

  const project = await cdp.eval(`window.fieloraTest.createProject({title:'Browser Workspace Tabs',goal:'Focused Browser tab verification',root_path:${JSON.stringify(root)}})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="project-${project.field_id}"]')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'BROWSER'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-browser"]') && document.querySelector('.right-dock-view-browser:not([hidden]) [data-testid="browser-address"]')`);

  assert.equal(await cdp.eval(`document.querySelector('.right-dock-view-browser:not([hidden]) .browser-page-strip')`), null, 'embedded Browser must not render a second page strip');
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-browser"]').closest('[data-testid="right-dock-tabs"]') !== null`), true, 'Browser Page must live in the Workspace Tab Strip');
  assert.equal(await cdp.eval(`document.querySelector('.right-dock-view-browser:not([hidden]) .browse-content').classList.contains('browser-tabs-in-workspace')`), true);

  const surfaceFinish = await cdp.eval(`(()=>{
    const conversation=document.querySelector('.conversation-column');
    const divider=document.querySelector('[data-testid="project-navigation-resizer"]');
    const dividerLine=divider.querySelector('span');
    const rect=divider.getBoundingClientRect();
    return{
      conversationRadius:Number.parseFloat(getComputedStyle(conversation).borderTopLeftRadius),
      divider:{x:rect.left+rect.width/2,y:rect.top+Math.min(180,rect.height/2)},
      dividerOpacity:Number.parseFloat(getComputedStyle(dividerLine).opacity),
    };
  })()`);
  assert.ok(surfaceFinish.conversationRadius >= 24, JSON.stringify(surfaceFinish));
  assert.equal(surfaceFinish.dividerOpacity, 0, JSON.stringify(surfaceFinish));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: surfaceFinish.divider.x, y: surfaceFinish.divider.y });
  await wait(cdp, `(()=>{const opacity=Number.parseFloat(getComputedStyle(document.querySelector('[data-testid="project-navigation-resizer"] span')).opacity);return opacity>=.35&&opacity<=.4;})()`);
  const hoveredDivider = await cdp.eval(`(()=>{const style=getComputedStyle(document.querySelector('[data-testid="project-navigation-resizer"] span'));return{opacity:Number.parseFloat(style.opacity),width:style.width};})()`);
  assert.ok(hoveredDivider.opacity <= .4, JSON.stringify(hoveredDivider));
  assert.equal(hoveredDivider.width, '1px');
  await captureScreenshot(cdp, path.join(evidenceRoot, '02-conversation-radius-subtle-divider.png'));

  let baseline = await cdp.eval(`window.fielora.browser.getState()`);
  if (!baseline.active_page_id) {
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',ctrlKey:true,bubbles:true}))`);
    await wait(cdp, `window.fielora.browser.getState().then((state)=>state.pages.length===1)`);
    baseline = await cdp.eval(`window.fielora.browser.getState()`);
  }
  const baselinePageCount = baseline.pages.length;
  const firstPageId = baseline.active_page_id;
  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',ctrlKey:true,bubbles:true}))`);
  await wait(cdp, `window.fielora.browser.getState().then((state)=>state.pages.length===${baselinePageCount + 1})`);
  const secondPageId = await cdp.eval(`window.fielora.browser.getState().then((state)=>state.active_page_id)`);
  assert.notEqual(secondPageId, firstPageId);
  const workspaceTabs = await cdp.eval(`[...document.querySelectorAll('[data-testid="right-dock-tabs"] .browser-workspace-page')].map((tab)=>({id:tab.dataset.tabId,label:tab.innerText,active:tab.classList.contains('active')}))`);
  assert.equal(workspaceTabs.length, baselinePageCount + 1, JSON.stringify(workspaceTabs));

  await cdp.eval(`document.querySelector('[data-tab-id="browser:${firstPageId}"] .right-dock-tab-main').click()`);
  await wait(cdp, `window.fielora.browser.getState().then((state)=>state.active_page_id===${JSON.stringify(firstPageId)})`);
  await cdp.eval(`document.querySelector('[data-testid="browser-close-page-${secondPageId}"]').click()`);
  await wait(cdp, `window.fielora.browser.getState().then((state)=>state.pages.length===${baselinePageCount}&&state.pages.every((page)=>page.id!==${JSON.stringify(secondPageId)}))`);

  await captureScreenshot(cdp, path.join(evidenceRoot, '01-browser-pages-in-workspace-tabs.png'));
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await Promise.race([waitForChildExit(child), new Promise((resolve) => setTimeout(resolve, 4_000))]);
  console.log('BROWSER_WORKSPACE_TABS_E2E: PASS');
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
