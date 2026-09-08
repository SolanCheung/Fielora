import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchElectron, connectToFieloraApp, waitForExpression, captureScreenshot, cleanupElectronProcess } from './harness/electron-cdp-harness.mjs';
import { renderingTestArgs } from './harness/file-editor-harness.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-info-tabs-'));
const projectRoot = path.join(dataRoot, 'project');
const evidence = path.join(root, 'artifacts/workspace-info-tabs');
const output = [], records = {};
let child, cdp;
const pause = (ms = 260) => new Promise(resolve => setTimeout(resolve, ms));
const wait = expression => waitForExpression(cdp, expression, { output });
const git = (...args) => execFileSync('git.exe', args, { cwd: projectRoot, windowsHide: true, encoding: 'utf8' }).trim();
const menu = '[data-testid="environment-popover"]';
const tabs = '[data-testid="right-dock-tabs"]';
const editor = '.right-dock-view-file:not([hidden]) .cm-content';

async function click(selector) {
  const point = await cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return{x,y,hit:e.contains(document.elementFromPoint(x,y))};})()`);
  assert.ok(point.hit, `Obstructed click: ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await pause(80);
}
async function key(key, code, keyCode, modifiers = 0) {
  for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, modifiers });
  await pause();
}
async function openInfo() {
  if (!(await cdp.eval(`!!document.querySelector('${menu}')`))) await click('[data-testid="environment-menu-toggle"]');
  await wait(`document.querySelector('.environment-repository')?.getAttribute('aria-busy')==='false'`);
}
async function setDraft(text) {
  await click('[name="prompt"]');
  await key('a', 'KeyA', 65, 2);
  if (text) await cdp.send('Input.insertText', { text });
  else await key('Backspace', 'Backspace', 8);
}
async function metrics() {
  return cdp.eval(`(()=>{const s=document.querySelector('${tabs}'),a=s.querySelector('[aria-selected="true"]'),r=a?.closest('.ui-tab').getBoundingClientRect(),b=s.getBoundingClientRect(),plus=document.querySelector('[data-testid="right-dock-add"]').getBoundingClientRect();return{left:s.scrollLeft,max:s.scrollWidth-s.clientWidth,fadeLeft:s.dataset.overflowLeft,fadeRight:s.dataset.overflowRight,mask:getComputedStyle(s).maskImage,active:a?.textContent,focus:document.activeElement?.getAttribute('role'),activeLeft:r?.left,activeRight:r?.right,stripLeft:b.left,stripRight:b.right,plusLeft:plus.left};})()`);
}
async function wheel(deltaX, deltaY) {
  const point = await cdp.eval(`(()=>{const r=document.querySelector('${tabs}').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX, deltaY });
  await pause();
}

try {
  await mkdir(projectRoot, { recursive: true });
  await mkdir(evidence, { recursive: true });
  const names = ['02 IIFE.js', '03 Modules.js', '04 Controllers.js', '05 Services.js', '06 Factories.js', 'workspace.ts', 'App.tsx', 'package.json', 'notes.md', 'styles.css'];
  for (const name of names) await writeFile(path.join(projectRoot, name), name.endsWith('.json') ? '{"name":"fixture"}\n' : `// ${name}\nexport const message = 'Workspace information and tabs';\n`);
  git('init', '-b', 'main');
  git('config', 'core.autocrlf', 'false');
  git('config', 'user.name', 'Fielora Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.');
  git('commit', '-m', 'fixture baseline');
  const initialHead = git('rev-parse', 'HEAD');
  await writeFile(path.join(projectRoot, names[0]), `// ${names[0]}\nexport const modified = true;\n`);
  await writeFile(path.join(projectRoot, 'untracked.txt'), 'local fixture\n');
  const launched = await launchElectron({ root, dataRoot, executablePath: process.env.FIELORA_PACKAGED_APP ?? '', args: [...renderingTestArgs, `--user-data-dir=${path.join(dataRoot, 'profile')}`], output });
  child = launched.child;
  cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(`window.fieloraTest && document.querySelector('[data-testid="project-workspace"]')`);
  await cdp.eval(`window.fieloraTest.resizeWindow({width:1600,height:960})`);
  const project = await cdp.eval(`window.fieloraTest.createProject({title:'工作区体验',goal:'Verify workspace information and tabs',root_path:${JSON.stringify(projectRoot)}})`);
  const conversation = await cdp.eval(`window.fielora.conversation.create({field_id:${JSON.stringify(project.field_id)},title:'工作区菜单与标签',provider_config_id:null,model_id:null})`);
  await cdp.eval('location.reload()');
  await wait(`document.querySelector('[data-testid="conversation-${conversation.id}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${conversation.id}"]').click()`);
  await wait(`document.querySelector('[name="prompt"]')`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
  await wait(`document.querySelector('[data-testid="workspace-file"]')`);
  await cdp.eval(`[...document.querySelectorAll('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')].find(e=>e.textContent.trim()===${JSON.stringify(names[0])}).click()`);
  await wait(`document.querySelector('${editor}')`);
  await pause();
  await openInfo();
  records.menu = await cdp.eval(`(()=>{const e=document.querySelector('${menu}'),r=e.getBoundingClientRect();return{text:e.innerText,addButtons:e.querySelectorAll('[aria-label="添加来源"]').length,branchCaret:e.querySelectorAll('.environment-repository [data-icon="chevronDown"]').length,sourceKind:e.querySelector('[data-file-kind]')?.getAttribute('data-file-kind'),sourceDecoded:[...e.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0),bounds:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}};})()`);
  assert.match(records.menu.text, /工作区信息/);
  assert.match(records.menu.text, /本次任务暂无文件改动/);
  assert.match(records.menu.text, /2 个文件/);
  assert.doesNotMatch(records.menu.text, /拉取请求状态|比较分支|提交或推送/);
  assert.equal(records.menu.addButtons, 1);
  assert.equal(records.menu.branchCaret, 0);
  assert.equal(records.menu.sourceKind, 'javascript');
  assert.ok(records.menu.sourceDecoded);
  assert.ok(await cdp.eval(`document.querySelector('[data-testid="environment-prepare-push"]').disabled`));
  await captureScreenshot(cdp, path.join(evidence, '01-workspace-info-light.png'));
  await click('[data-testid="environment-current-file"]');
  await wait(`document.querySelector('${editor}')?.textContent.includes('modified')`);
  await setDraft('保留我已经写好的说明。');
  await openInfo();
  await click('[data-testid="environment-prepare-commit"]');
  const commitDraft = await cdp.eval(`document.querySelector('[name="prompt"]').value`);
  assert.ok(commitDraft.startsWith('保留我已经写好的说明。\n\n'));
  assert.match(commitDraft, /不要推送/);
  assert.equal(await cdp.eval(`document.activeElement?.getAttribute('name')`), 'prompt');
  assert.equal((await cdp.eval(`window.fielora.conversation.listMessages({conversation_id:${JSON.stringify(conversation.id)}})`)).length, 0, 'Preparing a Git request must not send it');
  records.draftPreserved = true;
  git('remote', 'add', 'origin', path.join(dataRoot, 'local-upstream'));
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('config', 'branch.main.remote', 'origin');
  git('config', 'branch.main.merge', 'refs/heads/main');
  await setDraft('');
  await openInfo();
  await wait(`!document.querySelector('[data-testid="environment-prepare-push"]').disabled`);
  await click('[data-testid="environment-prepare-push"]');
  const pushDraft = await cdp.eval(`document.querySelector('[name="prompt"]').value`);
  assert.match(pushDraft, /不要创建新提交、强制推送或自动设置上游/);
  assert.doesNotMatch(pushDraft, /保留我已经/);
  await setDraft('');
  await openInfo();
  await writeFile(path.join(projectRoot, 'another.txt'), 'new change after opening info\n');
  await click('[data-testid="environment-refresh"]');
  await wait(`document.querySelector('[data-testid="environment-local-changes"]')?.textContent.includes('3 个文件')`);
  await click('[data-testid="environment-local-changes"]');
  await wait(`document.querySelector('[data-testid="terminal-output"]')?.textContent.includes('untracked.txt')`);
  records.statusCommand = await cdp.eval(`document.querySelector('[data-testid="terminal-output"]').innerText`);
  assert.match(records.statusCommand, /git status --short/);
  await openInfo();
  await click('[data-testid="environment-diff-stat"]');
  await wait(`document.querySelector('[data-testid="terminal-output"]')?.textContent.includes('insertion')`);
  records.diffCommand = await cdp.eval(`document.querySelector('[data-testid="terminal-output"]').innerText`);
  assert.match(records.diffCommand, /git diff --stat/);
  assert.equal(git('rev-parse', 'HEAD'), initialHead, 'Info and draft actions must not create a commit');
  assert.equal(git('diff', '--cached', '--name-only'), '', 'Info and draft actions must not stage files');
  await cdp.eval(`document.querySelector('[data-testid="right-dock-tab-files"]').click()`);
  for (const name of names) {
    await wait(`document.querySelector('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')`);
    await cdp.eval(`[...document.querySelectorAll('.right-dock-view:not([hidden]) [data-testid="workspace-file"]')].find(e=>e.textContent.trim()===${JSON.stringify(name)}).click()`);
    await wait(`document.querySelector('${tabs} [aria-selected="true"]')?.textContent === ${JSON.stringify(name)}`);
  }
  await pause();
  const count = await cdp.eval(`document.querySelectorAll('${tabs} [role="tab"]').length`);
  assert.ok(count >= 12);
  records.end = await metrics();
  assert.ok(records.end.max > 500);
  assert.equal(records.end.fadeLeft, 'true');
  assert.equal(records.end.fadeRight, 'false');
  const activeAtStart = records.end.active;
  await wheel(0, -4000);
  records.start = await metrics();
  assert.equal(records.start.left, 0);
  assert.equal(records.start.fadeLeft, 'false');
  assert.equal(records.start.fadeRight, 'true');
  assert.equal(records.start.active, activeAtStart);
  await wheel(0, 165);
  records.middle = await metrics();
  assert.ok(records.middle.left > 100 && records.middle.left < records.middle.max);
  assert.equal(records.middle.fadeLeft, 'true');
  assert.equal(records.middle.fadeRight, 'true');
  assert.match(records.middle.mask, /linear-gradient/);
  assert.equal(records.middle.active, activeAtStart);
  assert.equal(records.start.plusLeft, records.middle.plusLeft);
  await captureScreenshot(cdp, path.join(evidence, '02-tabs-edge-fades.png'));
  await wheel(-90, 0);
  assert.ok((await metrics()).left < records.middle.left, 'Horizontal trackpad scrolling is retained');
  await cdp.eval(`document.querySelector('${tabs} [aria-selected="true"]').focus({preventScroll:true})`);
  await key('Home', 'Home', 36);
  assert.equal((await metrics()).active, '文件');
  records.keyboard = [];
  for (let i = 0; i < count - 1; i++) {
    await key('ArrowRight', 'ArrowRight', 39);
    const state = await metrics();
    assert.equal(state.focus, 'tab', `Keyboard focus must stay on tabs: ${JSON.stringify(state)}`);
    assert.ok(state.activeLeft >= state.stripLeft - 1 && state.activeRight <= state.stripRight + 1, 'Selected tab must be fully visible');
    records.keyboard.push(state.active);
  }
  const focus = await cdp.eval(`(()=>{const a=document.querySelector('${tabs} [aria-selected="true"]'),p=a.closest('.ui-tab');return{mainOutline:getComputedStyle(a).outlineStyle,tabOutline:getComputedStyle(p).outlineStyle,tabOutlineOffset:getComputedStyle(p).outlineOffset,shadow:getComputedStyle(p).boxShadow,background:getComputedStyle(p).backgroundColor};})()`);
  assert.equal(focus.mainOutline, 'none');
  assert.equal(focus.tabOutline, 'solid');
  assert.ok(parseFloat(focus.tabOutlineOffset) <= -1 && parseFloat(focus.tabOutlineOffset) >= -2.1, 'The full focus ring is inset and survives device-pixel rounding');
  assert.notEqual(focus.shadow, 'none');
  records.focus = focus;
  await captureScreenshot(cdp, path.join(evidence, '03-tab-keyboard-focus.png'));
  await key('ArrowLeft', 'ArrowLeft', 37);
  assert.notEqual((await metrics()).active, records.keyboard.at(-1));
  await key('End', 'End', 35);
  assert.equal((await metrics()).active, records.keyboard.at(-1));
  await click(`${tabs} .ui-tab.is-active .ui-tab-close`);
  assert.equal(await cdp.eval(`document.querySelectorAll('${tabs} [role="tab"]').length`), count - 1);
  await click('[data-testid="right-dock-add"]');
  await wait(`document.querySelector('[data-testid="right-dock-tool-menu"]')`);
  await key('Escape', 'Escape', 27);
  await cdp.eval(`window.fieloraTest.resizeWindow({width:1060,height:820})`);
  await pause();
  await openInfo();
  const bounds = await cdp.eval(`(()=>{const r=document.querySelector('${menu}').getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};})()`);
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.bottom <= bounds.height, JSON.stringify(bounds));
  records.narrowBounds = bounds;
  await captureScreenshot(cdp, path.join(evidence, '04-narrow-menu.png'));
  await cdp.eval(`document.documentElement.dataset.effectiveAppearance='dark'; document.documentElement.style.colorScheme='dark'`);
  await pause();
  const dark = await cdp.eval(`(()=>{const e=document.querySelector('${menu}');return{color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor,source:e.querySelector('img')?.naturalWidth};})()`);
  assert.notEqual(dark.color, dark.background);
  assert.ok(dark.source > 0);
  records.dark = dark;
  await captureScreenshot(cdp, path.join(evidence, '05-workspace-info-dark.png'));
  await key('Escape', 'Escape', 27);
  assert.equal(await cdp.eval(`document.activeElement?.getAttribute('data-testid')`), 'environment-menu-toggle');
  assert.equal(await cdp.eval(`!!document.querySelector('${menu}')`), false);
  await cdp.eval(`document.documentElement.dataset.reduceMotion='true'`);
  await wheel(0, -4000);
  assert.equal((await metrics()).left, 0, 'Reduced motion retains wheel behavior');
  const nonGitRoot = path.join(dataRoot, 'plain-folder');
  await mkdir(nonGitRoot);
  const plain = await cdp.eval(`window.fieloraTest.createProject({title:'普通文件夹',goal:'Non Git state',root_path:${JSON.stringify(nonGitRoot)}})`);
  await cdp.eval('location.reload()');
  await wait(`document.querySelector('[data-testid="project-${plain.field_id}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="project-${plain.field_id}"]').click()`);
  await pause();
  await openInfo();
  const plainText = await cdp.eval(`document.querySelector('${menu}').innerText`);
  assert.match(plainText, /此文件夹未使用 Git/);
  assert.doesNotMatch(plainText, /准备提交|准备推送|工作区改动|没有上游分支/);
  records.nonGit = plainText;
  await writeFile(path.join(evidence, 'metrics.json'), JSON.stringify(records, null, 2));
  console.log('PASS workspace information, draft safety, source icons, native tab wheel/keyboard/fades, narrow layout, non-Git state');
} catch (error) {
  if (cdp) await captureScreenshot(cdp, path.join(evidence, 'failure.png')).catch(() => {});
  await writeFile(path.join(evidence, 'metrics.json'), JSON.stringify(records, null, 2));
  throw error;
} finally {
  cdp?.close();
  await cleanupElectronProcess(child);
  await writeFile(path.join(evidence, 'runtime.log'), output.join(''));
}
