import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  captureScreenshot, cleanupElectronProcess, connectToFieloraApp, launchElectron, pollUntil, waitForChildExit, waitForExpression,
} from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'fielora-ui-closeout-'));
const projectRoot = path.join(dataRoot, 'project');
const screenshots = path.join(root, 'apps', 'desktop', 'out', 'ui-closeout-review');
const output = [];
const node24Directory = path.dirname(process.execPath);

await mkdir(projectRoot, { recursive: true });
await mkdir(screenshots, { recursive: true });

function browserGeometryExpression() {
  return `(()=>{
    const panel=document.querySelector('.browse-panel');
    const dock=document.querySelector('[data-testid="right-workspace-dock"]');
    const toolbar=document.querySelector('.browser-toolbar');
    const actions=document.querySelector('.browser-actions');
    const address=document.querySelector('.address-form');
    const overflow=document.querySelector('[data-testid="browser-overflow"]');
    const menu=document.querySelector('[data-testid="browser-overflow-menu"]');
    if(!panel||!dock||!toolbar||!actions||!address||!overflow||!menu)return null;
    const box=(node)=>{const value=node.getBoundingClientRect();return{left:value.left,right:value.right,top:value.top,bottom:value.bottom,width:value.width,height:value.height};};
    const menuBox=box(menu);const panelBox=box(panel);
    return{
      panel:panelBox,dockPosition:getComputedStyle(dock).position,toolbar:box(toolbar),actions:box(actions),address:box(address),overflow:box(overflow),menu:menuBox,
      labels:[...menu.querySelectorAll('button > span')].map((node)=>node.textContent),
      shortcuts:[...menu.querySelectorAll('kbd')].map((node)=>node.textContent),
      topElementVisible:menu.contains(document.elementFromPoint(menuBox.left+8,menuBox.top+8)),
      viewport:{width:innerWidth,height:innerHeight},
    };
  })()`;
}

function assertBrowserGeometry(snapshot, mode) {
  assert.ok(snapshot, `${mode}: Browser geometry must exist`);
  assert.deepEqual(snapshot.labels, ['新建标签页', '保存到资料库', '刷新页面', '关闭标签页', '浏览器设置']);
  assert.deepEqual(snapshot.shortcuts, ['Ctrl+T', 'Ctrl+R', 'Ctrl+W']);
  const verticalCenter = (rect) => rect.top + rect.height / 2;
  assert.ok(Math.abs(verticalCenter(snapshot.actions) - verticalCenter(snapshot.address)) <= 1, `${mode}: actions and address must share one row`);
  assert.ok(Math.abs(verticalCenter(snapshot.address) - verticalCenter(snapshot.overflow)) <= 1, `${mode}: menu must stay on the toolbar row`);
  assert.ok(snapshot.toolbar.height <= 66, `${mode}: toolbar must not grow from wrapping`);
  assert.ok(snapshot.menu.left >= snapshot.panel.left - 1, `${mode}: menu left must stay inside the Browser pane`);
  assert.ok(snapshot.menu.right <= snapshot.panel.right + 1, `${mode}: menu right must stay inside the Browser pane`);
  assert.ok(snapshot.menu.left >= 0 && snapshot.menu.right <= snapshot.viewport.width + 1, `${mode}: menu must stay inside the visible viewport`);
  assert.equal(snapshot.topElementVisible, true, `${mode}: menu must not be clipped by an ancestor`);
}

let launched;
let cdp;
try {
  launched = await launchElectron({
    root,
    dataRoot,
    output,
    extraEnv: { PATH: `${node24Directory};${process.env.PATH ?? ''}` },
  });
  cdp = await connectToFieloraApp({ port: launched.port, output, enablePage: true });
  await waitForExpression(cdp, `document.querySelector('[data-testid="project-workspace"]')`, { output });

  await cdp.eval(`document.querySelector('[data-testid="now-nav"]').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="now-screen"]')`, { output });
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="utility-rail"]')===null&&document.querySelector('[data-testid="desktop-work-area"]').dataset.surfaceContext==='global'`), true);
  await captureScreenshot(cdp, path.join(screenshots, '02-now.png'));

  await cdp.eval(`document.querySelector('[data-testid="library-nav"]').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="library-screen"]')`, { output });
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="utility-rail"]')===null&&document.querySelector('[data-testid="desktop-work-area"]').dataset.surfaceContext==='global'`), true);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="library-screen"]')?.innerText.includes('长期资料')&&document.querySelector('.sidebar-project-home')?.innerText.includes('所有项目')`), true);
  await captureScreenshot(cdp, path.join(screenshots, '01-library.png'));

  const project = await cdp.eval(`window.fieloraTest.createProject({title:'UI Closeout',goal:null,root_path:${JSON.stringify(projectRoot)}})`);
  await cdp.eval(`localStorage.setItem('fielora:project-workspace-width','520')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:navigate',{detail:'PROJECTS'}))`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="project-${project.field_id}"]')`, { output });
  await cdp.eval(`document.querySelector('[data-testid="project-${project.field_id}"]').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="utility-rail"]')&&document.querySelector('[data-testid="desktop-work-area"]').dataset.surfaceContext==='workspace'`, { output });
  await cdp.eval(`window.fieloraTest.resizeWindow({width:1500,height:900})`);
  await pollUntil(() => cdp.eval(`innerWidth>=1450`), { timeoutMs: 5_000, intervalMs: 50, errorMessage: 'Desktop did not enter the split-width host' });
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'BROWSER'}))`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="right-workspace-dock"]')&&document.querySelector('[data-testid="browse-screen"]')`, { output });

  await cdp.eval(`document.querySelector('[data-testid="browser-overflow"]').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="browser-overflow-menu"]')`, { output });
  const split = await cdp.eval(browserGeometryExpression());
  assertBrowserGeometry(split, 'split');
  assert.notEqual(split.dockPosition, 'absolute', 'split: Browser must participate in the workspace grid');
  assert.ok(split.panel.width > 320, `split: unexpected pane width ${split.panel.width}`);
  await cdp.eval(`document.querySelector('[data-testid="browser-overflow"]').click()`);

  await cdp.eval(`document.querySelector('[data-testid="rail-focus"]').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('dock-focused')`, { output });
  await cdp.eval(`document.querySelector('[data-testid="browser-overflow"]').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="browser-overflow-menu"]')`, { output });
  const full = await cdp.eval(browserGeometryExpression());
  assertBrowserGeometry(full, 'full');
  assert.ok(full.panel.width > split.panel.width, 'full: focused Browser must be wider than split Browser');
  await captureScreenshot(cdp, path.join(screenshots, '03-browser-full-menu.png'));
  await cdp.eval(`document.querySelector('[data-testid="browser-overflow"]').click();document.querySelector('[data-testid="rail-focus"]').click()`);
  await waitForExpression(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('dock-focused')`, { output });

  await cdp.eval(`window.fieloraTest.resizeWindow({width:1000,height:760})`);
  await pollUntil(() => cdp.eval(`innerWidth<=1000&&document.querySelector('.browse-panel').getBoundingClientRect().width<=620`), { timeoutMs: 5_000, intervalMs: 50, errorMessage: 'Desktop did not enter the narrow Browser host' });
  await cdp.eval(`document.querySelector('[data-testid="browser-overflow"]').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="browser-overflow-menu"]')`, { output });
  const narrow = await cdp.eval(browserGeometryExpression());
  assertBrowserGeometry(narrow, 'narrow');
  assert.equal(narrow.dockPosition, 'absolute', 'narrow: Browser must use the existing responsive overlay');
  assert.ok(narrow.panel.width <= 620, `narrow: unexpected pane width ${narrow.panel.width}`);
  assert.ok(narrow.viewport.width < split.viewport.width, 'narrow: host viewport must be smaller than the split host');
  await captureScreenshot(cdp, path.join(screenshots, '04-browser-narrow-menu.png'));

  await cdp.eval(`document.querySelector('[data-testid="browser-open-settings"]').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="settings-browser"]')`, { output });
  const browserSettingsText = await cdp.eval(`document.querySelector('[data-testid="settings-browser"]').innerText`);
  assert.match(browserSettingsText, /启动时恢复浏览器/);
  assert.match(browserSettingsText, /搜索引擎\s*Google/);
  assert.doesNotMatch(browserSettingsText, /Browser Runtime|Browser Policy|Projects 右侧|密码/);
  await captureScreenshot(cdp, path.join(screenshots, '08-browser-settings.png'));

  await cdp.eval(`document.querySelector('[data-testid="settings-category-storage_data"]').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="settings-storage"] .storage-root-list')`, { output });
  const actionClasses = await cdp.eval(`[...document.querySelectorAll('[data-testid="settings-storage"] .storage-location-actions button, [data-testid="settings-storage"] .storage-actions button')].map((button)=>button.className)`);
  assert.ok(actionClasses.length >= 6 && actionClasses.every((value) => value.includes('ui-button')), 'Storage actions must use the shared Button component');
  const locations = await cdp.eval(`[...document.querySelectorAll('[data-testid="storage-location"]')].map((location)=>{const heading=location.querySelector('.storage-location-heading');const path=location.querySelector('.storage-location-path');const actions=location.querySelector('.storage-location-actions');const buttons=[...actions.querySelectorAll('button')];const box=location.getBoundingClientRect();const pathBox=path.getBoundingClientRect();return{title:heading.querySelector('strong').innerText,order:[heading,path,actions].map((node)=>[...location.children].indexOf(node)),width:box.width,pathWidth:pathBox.width,buttons:buttons.map((button)=>({text:button.innerText,top:button.getBoundingClientRect().top,className:button.className}))};})`);
  assert.deepEqual(locations.map((location) => location.title), ['Fielora 数据', '资料库', '缓存']);
  for (const location of locations) {
    assert.deepEqual(location.order, [0, 1, 2], `${location.title} must use heading, path, actions order`);
    assert.ok(location.pathWidth >= location.width - 42, `${location.title} path area must span the card width`);
    assert.ok(location.buttons.every((button) => button.text === '打开文件夹' || button.className.includes('ui-button--ghost')));
    assert.ok(Math.max(...location.buttons.map((button) => button.top)) - Math.min(...location.buttons.map((button) => button.top)) <= 1, `${location.title} actions must stay on one line`);
  }
  assert.ok(locations.slice(0, 2).every((location) => location.buttons[0].text === '打开文件夹' && location.buttons[1].text === '更改位置' && location.buttons[1].className.includes('ui-button--ghost')), 'Migration actions must use the lower visual weight');
  assert.equal(locations[2].buttons[0].text, '打开文件夹');
  await captureScreenshot(cdp, path.join(screenshots, '05-storage-top.png'));

  await cdp.eval(`document.querySelector('.profile-backup-card').scrollIntoView({block:'center'})`);
  const profile = await cdp.eval(`window.fielora.profile.get()`);
  const backup = await cdp.eval(`(()=>{const card=document.querySelector('.profile-backup-card');const row=card.querySelector('.storage-backup-option');const toggle=card.querySelector('[data-testid="backup-include-library-toggle"]');const cardBox=card.getBoundingClientRect();const rowBox=row.getBoundingClientRect();const toggleBox=toggle.getBoundingClientRect();return{text:card.innerText,height:cardBox.height,rowCenter:rowBox.top+rowBox.height/2,toggleCenter:toggleBox.top+toggleBox.height/2,role:toggle.getAttribute('role')};})()`);
  assert.doesNotMatch(backup.text, new RegExp(profile.profile_id));
  assert.equal(backup.role, 'switch');
  assert.ok(Math.abs(backup.rowCenter - backup.toggleCenter) <= 1, 'Backup toggle must align with its settings row');
  assert.ok(backup.height < 280, `Backup card contains unexpected empty space (${backup.height}px)`);
  await captureScreenshot(cdp, path.join(screenshots, '06-backup-migration.png'));

  await cdp.eval(`document.querySelector('.storage-details-toggle').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="storage-profile-metadata"]')`, { output });
  await cdp.eval(`document.querySelector('.storage-details').scrollIntoView({block:'start'})`);
  const details = await cdp.eval(`(()=>{const root=document.querySelector('.storage-details');const main=root.querySelector('[data-storage-detail="MAIN_DATABASE"]');const vector=root.querySelector('[data-storage-detail="VECTOR_INDEX"]');const search=root.querySelector('[data-storage-detail="SEARCH_INDEX"]');return{text:root.innerText,mainActions:[...main.querySelectorAll('button')].map((button)=>button.innerText),vector:vector.innerText,search:search.innerText,profile:root.querySelector('[data-testid="storage-profile-metadata"]').innerText};})()`);
  for (const label of ['主 SQLite 数据库', 'Agent 账本', '资料库 Blob 存储', '向量索引', '搜索索引', '内部仓库索引', '缓存']) assert.match(details.text, new RegExp(label));
  assert.deepEqual(details.mainActions, ['复制路径', '打开所在位置']);
  assert.match(details.vector, /未启用 \/ 不存在/);
  assert.match(details.search, /未启用 \/ 不存在/);
  assert.match(details.profile, new RegExp(profile.profile_id));
  await captureScreenshot(cdp, path.join(screenshots, '07-detailed-storage.png'));

  console.log(`LIBRARY_STORAGE_UI_CLOSEOUT_E2E: PASS\nSCREENSHOTS: ${screenshots}`);
} finally {
  if (cdp) {
    try { await cdp.eval(`void window.fielora.core.quit(); true`); } catch {}
    cdp.close();
  }
  if (launched) {
    await Promise.race([waitForChildExit(launched.child), new Promise((resolve) => setTimeout(resolve, 3_000))]);
    await cleanupElectronProcess(launched.child);
  }
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
