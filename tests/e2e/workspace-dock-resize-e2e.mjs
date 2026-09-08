import { renderingTestArgs } from './harness/file-editor-harness.mjs';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  cleanupElectronProcess,
  connectToFieloraApp,
  launchElectron,
  waitForChildExit,
  waitForExpression,
} from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-dock-resize-'));
const projectRoot = path.join(dataRoot, 'project');
const evidenceDir = path.resolve(process.env.FIELORA_E2E_EVIDENCE_DIR ?? path.join(root, 'artifacts', 'workspace-dock-resize'));
const executablePath = process.env.FIELORA_PACKAGED_APP ?? '';
const output = [];
let child;

const wait = (cdp, expression, timeoutMs = 30_000) => waitForExpression(cdp, expression, { timeoutMs, output });

async function resizeWindow(cdp, width, height = 900) {
  await cdp.eval(`window.fieloraTest.resizeWindow({width:${width},height:${height}})`);
  await wait(cdp, `Math.abs(window.innerWidth-${width})<=2`);
  await new Promise((resolve) => setTimeout(resolve, 200));
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]')?.getAnimations().length`);
}

async function dragDivider(cdp, delta, steps = 1) {
  const rect = await cdp.eval(`(()=>{const value=document.querySelector('[data-testid="project-workspace-resizer"]').getBoundingClientRect();return{x:value.x,y:value.y,width:value.width,height:value.height};})()`);
  const x = rect.x + rect.width / 2;
  const y = rect.y + Math.min(120, rect.height / 2);
  const widths = [];
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 16));
  for (let step = 1; step <= steps; step += 1) {
    const position = x + (delta * step / steps);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position, y, button: 'left', buttons: 1 });
    await new Promise((resolve) => setTimeout(resolve, 24));
    widths.push(await cdp.eval(`document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect().width`));
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + delta, y, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 180));
  return widths;
}

async function dragDividerThroughCollapseAndBack(cdp, selector, collapseX, restoreX, collapsedExpression, restoredExpression) {
  const rect = await cdp.eval(`(()=>{const value=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:value.x,y:value.y,width:value.width,height:value.height};})()`);
  const x = rect.x + rect.width / 2;
  const y = rect.y + Math.min(120, rect.height / 2);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 16));
  try {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: collapseX, y, button: 'left', buttons: 1 });
    await wait(cdp, collapsedExpression);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: restoreX, y, button: 'left', buttons: 1 });
    await wait(cdp, restoredExpression);
  } finally {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: restoreX, y, button: 'left', clickCount: 1 });
  }
  await new Promise((resolve) => setTimeout(resolve, 180));
}

async function waitForPreferredDockWidth(cdp) {
  await wait(cdp, `(()=>{const dock=document.querySelector('[data-testid="right-workspace-dock"]');const preferred=Number(localStorage.getItem('fielora:project-workspace-width'));return dock&&Number.isFinite(preferred)&&Math.abs(dock.getBoundingClientRect().width-preferred)<=2;})()`);
}

async function sampleFocusMotion(cdp) {
  return cdp.eval(`new Promise((resolve)=>{
    const surface=document.querySelector('[data-testid="project-workspace-surface"]');
    const dock=document.querySelector('[data-testid="right-workspace-dock"]');
    const values=[];
    const start=performance.now();
    const read=()=>{const input=dock.querySelector('.right-dock-view-file:not([hidden]) .cm-content');values.push({time:performance.now()-start,width:dock.getBoundingClientRect().width,moving:surface.dataset.workspaceMotion==='true',codeVisible:input&&getComputedStyle(input).visibility==='visible'});};
    read();
    document.querySelector('[data-testid="rail-focus"]').click();
    const sample=()=>{read();if(performance.now()-start<900)requestAnimationFrame(sample);else resolve({values,transition:getComputedStyle(surface).transitionProperty});};
    requestAnimationFrame(sample);
  })`);
}

function assertFocusMotion(motion, label) {
  const final = motion.values.at(-1).width;
  const settled = motion.values.findIndex((sample, index) => index > 0 && motion.values.slice(index).every((value) => Math.abs(value.width - final) < 1));
  const settledMs = motion.values[settled]?.time ?? Infinity;
  console.log(`${label}: settled=${Math.round(settledMs)}ms`);
  assert.ok(new Set(motion.values.map((value) => Math.round(value.width))).size >= 4, `${label}: missing intermediate widths`);
  assert.ok(settledMs < 450, `${label}: panel keeps chasing its animated target for ${settledMs}ms`);
  assert.ok(motion.values.some((sample) => sample.moving && sample.codeVisible), `${label}: code disappears during the transition`);
  assert.equal(motion.values.at(-1).moving, false, `${label}: transition cleanup did not restore syntax layout`);
}

async function metrics(cdp) {
  return cdp.eval(`(()=>{
    const rect=(selector)=>{const node=document.querySelector(selector);if(!node)return null;const value=node.getBoundingClientRect();return{left:value.left,right:value.right,width:value.width,height:value.height};};
    const style=(selector)=>{const node=document.querySelector(selector);if(!node)return null;const value=getComputedStyle(node);return{width:value.width,minWidth:value.minWidth,maxWidth:value.maxWidth};};
    const surface=rect('[data-testid="project-workspace-surface"]');
    const navigation=rect('[data-testid="project-navigation"]');
    const navigationDivider=rect('[data-testid="project-navigation-resizer"]');
    const conversation=rect('.conversation-column');
    const divider=rect('[data-testid="project-workspace-resizer"]');
    const dock=rect('[data-testid="right-workspace-dock"]');
    const resizer=document.querySelector('[data-testid="project-workspace-resizer"]');
    const dividerLine=resizer?.querySelector('span');
    const dividerStyle=dividerLine?getComputedStyle(dividerLine):null;
    const resizerStyle=resizer?getComputedStyle(resizer):null;
    const activeView=rect('[data-testid="right-dock-active-view"]');
    return{
      viewport:innerWidth,
      surface,navigation,navigationDivider,conversation,divider,dock,activeView,
      ariaMax:Number(resizer?.getAttribute('aria-valuemax')),
      dividerOpacity:dividerStyle?.opacity??null,
      dividerBackground:dividerStyle?.backgroundColor??null,
      dividerLineWidth:dividerLine?.getBoundingClientRect().width??null,
      dividerTrackBackground:resizerStyle?.backgroundColor??null,
      stored:Number(localStorage.getItem('fielora:project-workspace-width')),
      activeKind:document.querySelector('.right-dock-view:not([hidden])')?.getAttribute('data-dock-kind')??null,
      activeViewStyle:style('.right-dock-view:not([hidden])'),
      fileStyle:style('.right-dock-view-files:not([hidden]) .workspace-file-tool'),
      browserStyle:style('.right-dock-view-browser:not([hidden]) .browse-panel'),
      terminalStyle:style('.right-dock-view-terminal:not([hidden]) .right-terminal-view'),
      terminalSessionStyle:style('.right-dock-view-terminal:not([hidden]) .terminal-session'),
    };
  })()`);
}

function assertDynamicMaximum(value, label) {
  const expected = value.surface.width - value.navigation.width - value.navigationDivider.width - 340 - value.divider.width;
  assert.ok(Math.abs(value.ariaMax - expected) <= 2, `${label}: ${JSON.stringify({ expected, value })}`);
  assert.ok(value.conversation.width >= 339, `${label}: Conversation became narrower than 340px`);
  assert.ok(value.dock.width >= 359, `${label}: Dock became narrower than 360px`);
}

function assertToolFillsDock(value, style, label) {
  assert.ok(Math.abs(value.activeView.width - value.dock.width) <= 1, `${label}: active view does not fill Dock`);
  assert.equal(style.minWidth, '0px', `${label}: min-width must be 0`);
  assert.equal(style.maxWidth, 'none', `${label}: fixed max-width blocks the Dock`);
}

function assertSmoothDrag(widths, direction, label) {
  assert.ok(widths.length >= 4, `${label}: expected intermediate drag frames`);
  for (let index = 1; index < widths.length; index += 1) {
    if (direction === 'grow') assert.ok(widths[index] > widths[index - 1], `${label}: width did not grow monotonically: ${widths.join(', ')}`);
    else assert.ok(widths[index] < widths[index - 1], `${label}: width did not shrink monotonically: ${widths.join(', ')}`);
  }
}

try {
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(projectRoot, 'README.md'), '# Dock resize\n');
  await writeFile(path.join(projectRoot, 'dock.ts'), Array.from({ length: 240 }, (_, index) => `export const dockResize${index} = 'A real code view with wrapped text and syntax tokens during workspace motion';`).join('\n'));

  // Fail before creating a native window if the development Core is missing.
  await access(executablePath || process.env.FIELORA_CORE_PATH || path.join(root, 'target/debug/fielora-core.exe'));
  const launched = await launchElectron({ root, dataRoot, executablePath, args: [...renderingTestArgs,`--user-data-dir=${path.join(dataRoot, 'electron-profile')}`], output });
  child = launched.child;
  child.on('exit', (code) => { if (code) console.error(output.join('')); });
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fieloraTest&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`, 60_000);
  await resizeWindow(cdp, 1440);

  const setup = await cdp.eval(`(async()=>{
    const project=await window.fieloraTest.createProject({title:'Dock Resize',goal:'Focused Dock resize verification',root_path:${JSON.stringify(projectRoot)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'动态工作区宽度',provider_config_id:null,model_id:null});
    return{projectId:project.field_id,conversationId:conversation.id};
  })()`);
  await cdp.eval(`(()=>{localStorage.removeItem('fielora:project-workspace-width');location.reload();})()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')&&document.querySelector('.conversation-heading')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(cdp, `document.querySelector('[data-testid="right-dock-view-files"]:not([hidden]) .workspace-file-tool')`);
  await wait(cdp, `Math.abs(document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect().width-635)<=2`);

  const header = await cdp.eval(`(()=>{const heading=document.querySelector('.conversation-heading');return{title:heading.querySelector('h2')?.textContent,folder:heading.querySelector(':scope > [data-icon="folder"]')!==null,subtitle:heading.querySelector('small')!==null,dockIcon:document.querySelector('[data-testid="chrome-tools"] [data-icon="panelRight"]')!==null};})()`);
  assert.deepEqual(header, { title: '动态工作区宽度', folder: true, subtitle: false, dockIcon: true });

  const initial = await metrics(cdp);
  assertDynamicMaximum(initial, '1440-default');
  assert.ok(Math.abs(initial.dock.width - 635) <= 2, JSON.stringify(initial));
  assert.ok(Number(initial.dividerOpacity) >= 0.9, `Dock divider is not visibly rendered: ${JSON.stringify(initial)}`);
  assert.equal(initial.dividerBackground, 'rgba(96, 105, 116, 0.18)');
  assert.ok(Math.abs(initial.dividerLineWidth - 1) <= 0.1, JSON.stringify(initial));
  assert.equal(initial.dividerTrackBackground, 'rgb(255, 255, 255)');
  assertToolFillsDock(initial, initial.fileStyle, 'File');

  await dragDividerThroughCollapseAndBack(
    cdp,
    '[data-testid="project-navigation-resizer"]',
    initial.surface.left + 80,
    initial.navigation.right,
    `document.body.dataset.sidebarCollapsed==='true'&&document.querySelector('[data-testid="project-navigation"]').getBoundingClientRect().width<1`,
    `document.body.dataset.sidebarCollapsed==='false'&&document.querySelector('[data-testid="project-navigation"]').getBoundingClientRect().width>=220`,
  );
  const navigationRestored = await metrics(cdp);
  assert.ok(Math.abs(navigationRestored.navigation.width - initial.navigation.width) <= 2, JSON.stringify(navigationRestored));

  await dragDividerThroughCollapseAndBack(
    cdp,
    '[data-testid="project-workspace-resizer"]',
    initial.surface.right - 80,
    initial.surface.right - initial.dock.width,
    `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')&&document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect().width<1`,
    `document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')&&document.querySelector('[data-testid="right-workspace-dock"]').getBoundingClientRect().width>=360`,
  );
  const dockRestored = await metrics(cdp);
  assert.ok(Math.abs(dockRestored.dock.width - initial.dock.width) <= 2, JSON.stringify(dockRestored));

  // Reproduce the compact desktop from the user report with a real code viewer.
  await cdp.eval(`[...document.querySelectorAll('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')].find((row)=>row.textContent.includes('dock.ts')).click()`);
  await wait(cdp, `document.querySelector('.right-dock-view-file:not([hidden]) .cm-content')`);
  await resizeWindow(cdp, 1180, 650);
  const focusMotion = await sampleFocusMotion(cdp);
  const restoreMotion = await sampleFocusMotion(cdp);
  await writeFile(path.join(evidenceDir, 'focus-motion.json'), JSON.stringify({ focusMotion, restoreMotion }, null, 2));
  assertFocusMotion(focusMotion, 'FOCUS_MOTION');
  assertFocusMotion(restoreMotion, 'RESTORE_MOTION');
  const beforeFocusDrag = await metrics(cdp);
  await dragDividerThroughCollapseAndBack(
    cdp,
    '[data-testid="project-workspace-resizer"]',
    beforeFocusDrag.divider.left - 80,
    beforeFocusDrag.divider.left,
    `document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('dock-focused')&&document.querySelector('.conversation-column').getBoundingClientRect().width<1`,
    `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('dock-focused')&&document.querySelector('.conversation-column').getBoundingClientRect().width>=339`,
  );
  const savedSplitWidth = (await metrics(cdp)).stored;
  await dragDivider(cdp, -80, 4);
  await wait(cdp, `document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('dock-focused')`);
  assert.equal((await metrics(cdp)).stored, savedSplitWidth, 'focus gesture must preserve the split-width preference');
  const focusedShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(evidenceDir, 'drag-focused.png'), Buffer.from(focusedShot.data, 'base64'));
  await cdp.eval(`document.querySelector('[data-testid="rail-focus"]').click()`);
  await wait(cdp, `document.querySelector('.conversation-column').getBoundingClientRect().width>=339`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').dataset.workspaceMotion`);
  assert.equal(await cdp.eval(`getComputedStyle(document.querySelector('.right-dock-view-file:not([hidden]) .cm-content')).visibility`), 'visible');
  const restoredShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(evidenceDir, 'split-restored.png'), Buffer.from(restoredShot.data, 'base64'));
  await cdp.eval("document.querySelector('.right-dock-view-file:not([hidden]) .cm-content').focus()");
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'End',code:'End',windowsVirtualKeyCode:35,modifiers:2});
  await cdp.send('Input.insertText',{text:'\nexport const editedAfterResize = true;'});
  await wait(cdp, `document.querySelector('.right-dock-view-file:not([hidden]) .cm-content').textContent.includes('editedAfterResize')`);

  await resizeWindow(cdp, 1920);
  const growFrames = await dragDivider(cdp, -500, 8);
  assertSmoothDrag(growFrames, 'grow', 'File Dock drag');
  await waitForPreferredDockWidth(cdp);
  const expanded = await metrics(cdp);
  assertDynamicMaximum(expanded, '1920-expanded');
  assert.ok(expanded.dock.width > 1000, JSON.stringify(expanded));
  assert.ok(expanded.stored > 1000, JSON.stringify(expanded));
  const preferredWidth = expanded.stored;

  // Cross the limit after a long resize preview, not only from an already
  // clamped compact window. Restore must discard that uncommitted preview.
  await dragDivider(cdp, -(expanded.ariaMax - expanded.dock.width + 80), 8);
  await wait(cdp, `document.querySelector('.conversation-column').getBoundingClientRect().width<1`);
  assert.equal((await metrics(cdp)).stored, preferredWidth);
  await cdp.eval(`document.querySelector('[data-testid="rail-focus"]').click()`);
  await waitForPreferredDockWidth(cdp);

  await resizeWindow(cdp, 1280);
  const clamped = await metrics(cdp);
  assertDynamicMaximum(clamped, '1280-clamped');
  assert.ok(Math.abs(clamped.dock.width - clamped.ariaMax) <= 2, JSON.stringify(clamped));
  assert.equal(clamped.stored, preferredWidth, 'window shrink must not overwrite the preferred Dock width');

  await resizeWindow(cdp, 1920);
  await waitForPreferredDockWidth(cdp);
  const restored = await metrics(cdp);
  assertDynamicMaximum(restored, '1920-restored');
  assert.ok(Math.abs(restored.dock.width - preferredWidth) <= 2, JSON.stringify(restored));

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'BROWSER'}))`);
  await wait(cdp, `document.querySelector('.right-dock-view-browser:not([hidden]) .browse-panel')`);
  await cdp.eval(`window.fielora.browser.navigate({url:${JSON.stringify(pathToFileURL(path.join(projectRoot, 'README.md')).href)}})`);
  await wait(cdp, `window.fielora.browser.getState().then((state)=>state.surface.attached&&state.surface.visible)`);
  const browser = await metrics(cdp);
  assert.equal(browser.activeKind, 'BROWSER');
  assertToolFillsDock(browser, browser.browserStyle, 'Browser');
  const browserChrome = await cdp.eval(`(()=>{
    const rect=(selector)=>{const value=document.querySelector(selector).getBoundingClientRect();return{width:value.width,height:value.height};};
    const background=(selector)=>getComputedStyle(document.querySelector(selector)).backgroundColor;
    return{
      workspacePageTab:rect('[data-testid="right-dock-tabs"] .browser-workspace-page'),
      duplicatePageStrip:document.querySelector('.right-dock-view-browser:not([hidden]) .browser-page-strip'),
      toolbar:rect('.right-dock-view-browser:not([hidden]) .browser-toolbar'),
      address:rect('.right-dock-view-browser:not([hidden]) .address-form input'),
      back:rect('.right-dock-view-browser:not([hidden]) [data-testid="browser-back"]'),
      contentBackground:background('.right-dock-view-browser:not([hidden]) .browse-content'),
      viewportBackground:background('.right-dock-view-browser:not([hidden]) .browse-viewport'),
    };
  })()`);
  assert.ok(Math.abs(browserChrome.workspacePageTab.height - 34) <= 1, JSON.stringify(browserChrome));
  assert.equal(browserChrome.duplicatePageStrip, null, JSON.stringify(browserChrome));
  assert.ok(Math.abs(browserChrome.toolbar.height - 44) <= 1, JSON.stringify(browserChrome));
  assert.ok(Math.abs(browserChrome.address.height - 34) <= 1, JSON.stringify(browserChrome));
  assert.deepEqual(browserChrome.back, { width: 30, height: 30 });
  assert.equal(browserChrome.contentBackground, browserChrome.viewportBackground);
  const browserScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(evidenceDir, 'browser-composer-aligned.png'), Buffer.from(browserScreenshot.data, 'base64'));
  const shrinkFrames = await dragDivider(cdp, 120, 6);
  assertSmoothDrag(shrinkFrames, 'shrink', 'Browser Dock drag');
  const browserNative = await cdp.eval(`window.fielora.browser.getState().then((state)=>{const host=document.querySelector('.right-dock-view-browser:not([hidden]) .browse-viewport').getBoundingClientRect();return{surface:state.surface.bounds,host:{x:Math.round(host.left),width:Math.round(host.width)}};})`);
  assert.ok(Math.abs(browserNative.surface.width - browserNative.host.width) <= 2, JSON.stringify(browserNative));
  assert.ok(Math.abs(browserNative.surface.x - browserNative.host.x) <= 2, JSON.stringify(browserNative));

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'TERMINAL'}))`);
  await wait(cdp, `document.querySelector('.right-dock-view-terminal:not([hidden]) .terminal-session')`);
  const terminal = await metrics(cdp);
  assert.equal(terminal.activeKind, 'TERMINAL');
  assertToolFillsDock(terminal, terminal.terminalStyle, 'Terminal');
  assert.equal(terminal.terminalSessionStyle.minWidth, '0px');
  assert.equal(terminal.terminalSessionStyle.maxWidth, 'none');

  // Motion disabled and a rapid reversal must both leave the viewer usable.
  const reduceMotion = await cdp.eval(`document.documentElement.dataset.reduceMotion`);
  await cdp.eval(`document.documentElement.dataset.reduceMotion='true'`);
  assert.ok(await cdp.eval(`parseFloat(getComputedStyle(document.querySelector('[data-testid="project-workspace-surface"]')).transitionDuration)<0.001`));
  await cdp.eval(`document.querySelector('[data-testid="rail-focus"]').click()`);
  await wait(cdp, `document.querySelector('.conversation-column').getBoundingClientRect().width<1`);
  await cdp.eval(`document.querySelector('[data-testid="rail-focus"]').click()`);
  await wait(cdp, `document.querySelector('.conversation-column').getBoundingClientRect().width>=339`);
  assert.equal(await cdp.eval(`Boolean(document.querySelector('[data-testid="project-workspace-surface"]').dataset.workspaceMotion)`), false);
  await cdp.eval(`document.documentElement.dataset.reduceMotion=${JSON.stringify(reduceMotion ?? 'false')}`);
  await cdp.eval(`new Promise((resolve)=>{document.querySelector('[data-testid="rail-focus"]').click();setTimeout(()=>{document.querySelector('[data-testid="rail-focus"]').click();resolve();},80);})`);
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('dock-focused')&&!document.querySelector('[data-testid="project-workspace-surface"]').dataset.workspaceMotion&&document.querySelector('.conversation-column').getBoundingClientRect().width>=339`);

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log('WORKSPACE_DOCK_DYNAMIC_RESIZE_E2E: PASS');
  console.log('TITLE_AND_ICON_ALIGNMENT: PASS');
  console.log('FILE_BROWSER_TERMINAL_WIDTH: PASS');
  console.log('BROWSER_COMPOSER_ALIGNMENT: PASS');
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
