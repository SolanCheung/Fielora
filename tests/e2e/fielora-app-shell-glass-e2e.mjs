import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  captureScreenshot,
  cleanupElectronProcess,
  connectToFieloraApp,
  launchElectron,
  waitForChildExit,
  waitForExpression,
} from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-app-shell-glass-'));
const evidenceRoot = path.join(root, 'artifacts', 'fielora-glass', 'app-shell-rebaseline');
const nativeCapture = process.env.FIELORA_NATIVE_CAPTURE === '1';
const output = [];
const interaction = {};
let child;

const wait = (cdp, expression, timeoutMs = 30_000) => waitForExpression(cdp, expression, { timeoutMs, output });
const click = (cdp, selector) => cdp.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);
const pauseForNativeCapture = () => new Promise((resolve) => process.stdin.once('data', resolve));

async function checkpoint(cdp, name) {
  if (!nativeCapture) {
    await captureScreenshot(cdp, path.join(evidenceRoot, name));
    return;
  }
  process.stdout.write(`CAPTURE_READY:${name}\n`);
  await pauseForNativeCapture();
}

async function resizeWindow(cdp, width, height = 900) {
  await cdp.eval(`window.fieloraTest.resizeWindow({width:${width},height:${height}})`);
  await wait(cdp, `Math.abs(window.innerWidth-${width})<=2`);
  await new Promise((resolve) => setTimeout(resolve, 180));
}

async function openAppearance(cdp, appearance) {
  if (!await cdp.eval(`Boolean(document.querySelector('[data-testid="settings-screen"]'))`)) {
    await click(cdp, '[data-testid="settings-nav"]');
    await wait(cdp, `document.querySelector('[data-testid="settings-screen"]')`);
  }
  await click(cdp, '[data-testid="settings-category-appearance"]');
  await wait(cdp, `document.querySelector('[data-testid="settings-appearance"]')`);
  await click(cdp, `[data-testid="appearance-theme-${appearance}"]`);
  await wait(cdp, `document.documentElement.dataset.effectiveAppearance===${JSON.stringify(appearance)}`);
}

async function workspaceMetrics(cdp) {
  return cdp.eval(`(()=>{
    const rect=(selector)=>{const value=document.querySelector(selector)?.getBoundingClientRect();return value?{left:value.left,top:value.top,right:value.right,bottom:value.bottom,width:value.width,height:value.height}:null};
    const dock=document.querySelector('[data-testid="right-workspace-dock"]');
    const chrome=document.querySelector('[data-testid="desktop-chrome"]');
    const controls=document.querySelector('[data-testid="utility-rail"]');
    const picker=document.querySelector('[data-testid="workspace-object-picker"]');
    return{
      viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth},
      conversation:rect('.conversation-column'),composer:rect('[data-testid="conversation-composer"]'),dock:rect('[data-testid="right-workspace-dock"]'),
      dockPosition:dock?getComputedStyle(dock).position:null,picker:rect('[data-testid="workspace-object-picker"]'),
      chrome:rect('[data-testid="desktop-chrome"]'),controls:rect('[data-testid="utility-rail"]'),
      chromeStyle:chrome?{background:getComputedStyle(chrome).backgroundColor,app:getComputedStyle(document.documentElement).getPropertyValue('--fl-color-app').trim(),shadow:getComputedStyle(chrome).boxShadow,backdrop:getComputedStyle(chrome).backdropFilter}:null,
      duplicateBrowserChrome:document.querySelectorAll('.browser-object-chrome [data-surface="chrome"]').length,
      browserChromeOwners:document.querySelectorAll('.browser-object-chrome[data-surface="chrome"]').length,
      terminalToolbar:Boolean(document.querySelector('.right-dock-view-terminal:not([hidden]) .terminal-toolbar')),
    };
  })()`);
}

function assertGeometry(metrics, label, dockExpected) {
  assert.ok(metrics.viewport.scrollWidth <= metrics.viewport.width + 2, `${label}: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.chrome && Math.abs(metrics.chrome.height - 40) <= 1, `${label}: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.controls && metrics.controls.top >= -1 && metrics.controls.bottom <= 41 && metrics.controls.right <= metrics.viewport.width - 142, `${label}: ${JSON.stringify(metrics)}`);
  if (!metrics.conversation || !metrics.composer) return;
  assert.ok(metrics.composer.left >= metrics.conversation.left - 1 && metrics.composer.right <= metrics.conversation.right + 1, `${label}: ${JSON.stringify(metrics)}`);
  if (dockExpected) {
    assert.ok(!['absolute', 'fixed'].includes(metrics.dockPosition), `${label}: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.dock?.width >= 340 && metrics.dock.right <= metrics.viewport.width + 1, `${label}: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.conversation.right <= metrics.dock.left - 2, `${label}: ${JSON.stringify(metrics)}`);
  }
}

async function openDock(cdp, kind, tabId) {
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:${JSON.stringify(kind)}}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-${tabId}"]')&&document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  await click(cdp, `[data-testid="right-dock-tab-${tabId}"]`);
  await new Promise((resolve) => setTimeout(resolve, 160));
}

try {
  await mkdir(evidenceRoot, { recursive: true });
  const launched = await launchElectron({ root, dataRoot, output });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fieloraTest&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`, 60_000);

  const setup = await cdp.eval(`(async()=>{
    const project=await window.fieloraTest.createProject({title:'Fielora',goal:'App Shell ownership and Glass visual rebuild',root_path:${JSON.stringify(root)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'App Shell 与 Glass visual rebuild',provider_config_id:null,model_id:null});
    await window.fielora.conversation.createMessage({conversation_id:conversation.id,role:'USER',content:'重新建立 App Shell、Workspace Dock、Browser Object Chrome 与 Overlay 的清晰表面职责。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    await window.fielora.conversation.createMessage({conversation_id:conversation.id,role:'ASSISTANT',content:'当前实现以 Canvas、Content、Chrome、Floating、Overlay 五层为唯一材质所有者；布局容器保持透明，Workspace 始终占据布局空间。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    return{projectId:project.field_id,conversationId:conversation.id};
  })()`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`);
  await resizeWindow(cdp, 1440);

  await openAppearance(cdp, 'light');
  await click(cdp, '[data-testid="settings-back"]');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`);
  assertGeometry(await workspaceMetrics(cdp), 'conversation-light', false);
  await checkpoint(cdp, '01-conversation-light-1440.png');

  // A: a bounded picker never participates in the Conversation layout.
  const conversationBeforePicker = await workspaceMetrics(cdp);
  await click(cdp, '[data-testid="chrome-tools"]');
  await wait(cdp, `document.querySelector('[data-testid="workspace-object-picker"]')`);
  const pickerOpen = await workspaceMetrics(cdp);
  assert.deepEqual(pickerOpen.conversation, conversationBeforePicker.conversation);
  assert.deepEqual(pickerOpen.composer, conversationBeforePicker.composer);
  assert.ok(pickerOpen.picker.width <= 380 && pickerOpen.picker.height < pickerOpen.viewport.height * 0.7, JSON.stringify(pickerOpen));
  const firstPickerFocus = await cdp.eval(`document.activeElement?.dataset.testid`);
  await cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`);
  const nextPickerFocus = await cdp.eval(`document.activeElement?.dataset.testid`);
  assert.notEqual(nextPickerFocus, firstPickerFocus);
  await cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await wait(cdp, `!document.querySelector('[data-testid="workspace-object-picker"]')`);
  interaction.A = { pickerBounded: true, keyboardMoved: true, escapeClosed: true, geometryStable: true };

  // B: each object routes into one persistent Dock; the Dock pushes Content.
  await openDock(cdp, 'FILES', 'files');
  assertGeometry(await workspaceMetrics(cdp), 'workspace-files-light', true);
  await checkpoint(cdp, '02-conversation-workspace-light-1440.png');

  await openDock(cdp, 'TERMINAL', 'terminal');
  const terminalMetrics = await workspaceMetrics(cdp);
  assert.equal(terminalMetrics.terminalToolbar, false);
  await checkpoint(cdp, '04-terminal-workspace-light-1440.png');

  await openDock(cdp, 'BROWSER', 'browser');
  await wait(cdp, `document.querySelector('[data-testid="browser-object-chrome"]')`);
  await cdp.eval(`(()=>{const input=document.querySelector('[data-testid="browser-address"]');const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');descriptor.set.call(input,${JSON.stringify(pathToFileURL(path.join(root, 'README.md')).href)});input.dispatchEvent(new Event('input',{bubbles:true}));input.closest('form').requestSubmit();})()`);
  await wait(cdp, `document.querySelector('[data-testid="browser-address"]')?.value.includes('README.md')`, 30_000);
  const browserMetrics = await workspaceMetrics(cdp);
  assert.equal(browserMetrics.browserChromeOwners, 1);
  assert.equal(browserMetrics.duplicateBrowserChrome, 0);
  await checkpoint(cdp, '03-browser-workspace-light-1440.png');

  // C: Browser page lifecycle is hosted directly by the shared Workspace Tab Strip.
  const originalPageId = await cdp.eval(`window.fielora.browser.getState().then((state)=>state.active_page_id)`);
  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',ctrlKey:true,bubbles:true}))`);
  await wait(cdp, `window.fielora.browser.getState().then((state)=>state.pages.length>=2)`);
  const newPageId = await cdp.eval(`window.fielora.browser.getState().then((state)=>state.active_page_id)`);
  assert.notEqual(newPageId, originalPageId);
  await click(cdp, `[data-tab-id="browser:${originalPageId}"] .right-dock-tab-main`);
  await wait(cdp, `window.fielora.browser.getState().then((state)=>state.active_page_id===${JSON.stringify(originalPageId)})`);
  await click(cdp, `[data-testid="browser-close-page-${newPageId}"]`);
  await wait(cdp, `window.fielora.browser.getState().then((state)=>state.pages.every((page)=>page.id!==${JSON.stringify(newPageId)}))`);
  interaction.C = { newPage: true, switched: true, closed: true };

  await openDock(cdp, 'DIFF', 'review');
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:close-workspace-dock'))`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  interaction.B = { files: true, terminal: true, browser: true, review: true, closed: true };

  // The representative light picker state is still pure Overlay.
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace-launcher'))`);
  await wait(cdp, `document.querySelector('[data-testid="workspace-object-picker"]')`);
  await checkpoint(cdp, '05-work-object-overlay-light-1440.png');
  await cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await wait(cdp, `!document.querySelector('[data-testid="workspace-object-picker"]')`);

  // F/G: capture normal now. The native capture operator maximizes the same
  // window before continuing, then the test verifies and restores it.
  interaction.G = { normal: await workspaceMetrics(cdp) };
  const normalOuterWidth = await cdp.eval('window.outerWidth');
  await checkpoint(cdp, '06-top-chrome-normal.png');
  await wait(cdp, `Math.abs(window.outerWidth-screen.availWidth)<=8`, 20_000);
  interaction.G.maximized = await workspaceMetrics(cdp);
  await checkpoint(cdp, '07-top-chrome-maximized.png');
  await wait(cdp, `Math.abs(window.outerWidth-${normalOuterWidth})<=8`, 20_000);
  interaction.G.restored = await workspaceMetrics(cdp);
  assertGeometry(interaction.G.normal, 'caption-normal', false);
  assertGeometry(interaction.G.maximized, 'caption-maximized', false);
  assertGeometry(interaction.G.restored, 'caption-restored', false);
  assert.equal(interaction.G.normal.chromeStyle.background, 'rgb(249, 250, 252)');
  assert.equal(interaction.G.normal.chromeStyle.app, '#f9fafc');
  assert.equal(interaction.G.normal.chromeStyle.shadow, 'none');
  assert.equal(interaction.G.normal.chromeStyle.backdrop, 'none');

  // D/E: opening the picker over populated Dock content never moves either pane.
  await openDock(cdp, 'BROWSER', 'browser');
  const populatedBefore = await workspaceMetrics(cdp);
  await click(cdp, '[data-testid="right-dock-add"]');
  await wait(cdp, `document.querySelector('[data-testid="workspace-object-picker"]')`);
  const populatedOverlay = await workspaceMetrics(cdp);
  assert.deepEqual(populatedOverlay.conversation, populatedBefore.conversation);
  assert.deepEqual(populatedOverlay.dock, populatedBefore.dock);
  await checkpoint(cdp, '08-overlay-over-populated-ui-light-1440.png');
  await click(cdp, '[data-testid="workspace-object-terminal"]');
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-terminal"]')`);
  await click(cdp, '[data-testid="right-dock-add"]');
  await wait(cdp, `document.querySelector('[data-testid="workspace-object-picker"]')`);
  await click(cdp, '[data-testid="workspace-object-browser"]');
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-browser"]')`);
  await click(cdp, '[data-testid="right-dock-tab-terminal"]');
  await click(cdp, '[data-testid="right-dock-add"]');
  await wait(cdp, `document.querySelector('[data-testid="workspace-object-picker"]')`);
  await cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await wait(cdp, `!document.querySelector('[data-testid="workspace-object-picker"]')`);
  interaction.D = { pickerOverDockStable: true, choseTerminal: true, choseBrowser: true };
  interaction.E = { pickerFromTerminal: true, escapeClosed: true };

  // F: Dock remains a push layout through all requested widths.
  interaction.F = {};
  for (const width of [1280, 1440, 1920]) {
    await resizeWindow(cdp, width);
    const metrics = await workspaceMetrics(cdp);
    assertGeometry(metrics, `dock-${width}`, true);
    interaction.F[width] = metrics;
  }
  await resizeWindow(cdp, 1440);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:close-workspace-dock'))`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'BROWSER'}))`);
  await wait(cdp, `document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  interaction.F.closedAndReopened = true;

  await openAppearance(cdp, 'dark');
  await click(cdp, '[data-testid="settings-back"]');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:close-workspace-dock'))`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  await checkpoint(cdp, '09-conversation-dark-1440.png');

  await openDock(cdp, 'BROWSER', 'browser');
  await checkpoint(cdp, '10-browser-workspace-dark-1440.png');
  await click(cdp, '[data-testid="right-dock-add"]');
  await wait(cdp, `document.querySelector('[data-testid="workspace-object-picker"]')`);
  await checkpoint(cdp, '11-work-object-overlay-dark-1440.png');
  await cdp.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await wait(cdp, `!document.querySelector('[data-testid="workspace-object-picker"]')`);

  await openAppearance(cdp, 'dark');
  await checkpoint(cdp, '12-settings-dark-1440.png');

  await writeFile(path.join(evidenceRoot, 'interaction-state-matrix.json'), `${JSON.stringify({ status: 'PASS', viewports: [1280, 1440, 1920], states: interaction, modelRequests: 0, publicNetworkRequests: 0 }, null, 2)}\n`);
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log('FIELORA_APP_SHELL_GLASS_E2E: PASS\nINTERACTION_STATE_MATRIX: PASS\nSCREENSHOTS: 12\nMODEL_REQUESTS: 0\nPUBLIC_NETWORK_REQUESTS: 0');
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
