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
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-appearance-'));
const evidence = path.join(root, 'artifacts', 'appearance');
let child;
const output = [];

const wait = (cdp, expression, timeout = 20_000) => waitForExpression(cdp, expression, { timeoutMs: timeout, output });

function setValue(selector, value) {
  return `(()=>{const element=document.querySelector(${JSON.stringify(selector)});const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value');descriptor.set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));})()`;
}

async function screenshot(cdp, name) {
  await captureScreenshot(cdp, path.join(evidence, name));
}

try {
  await mkdir(evidence, { recursive: true });
  const launched = await launchElectron({ root, dataRoot, output });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`);
  assert.equal(await cdp.eval(`Boolean(document.documentElement.dataset.resolvedTheme)`), true);

  await cdp.eval(`document.querySelector('[data-testid="settings-nav"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-screen"]')`);
  assert.equal(await cdp.eval(`Boolean(document.querySelector('[data-testid="settings-category-appearance"]'))`), true);
  await cdp.eval(`document.querySelector('[data-testid="settings-category-appearance"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-appearance"]')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('.theme-preview-card').length`), 3);
  await screenshot(cdp, 'appearance-system.png');

  const lightColors = await cdp.eval(`(()=>{document.querySelector('[data-testid="appearance-theme-light"]').click();const content=getComputedStyle(document.querySelector('.settings-content'));const navigation=getComputedStyle(document.querySelector('.settings-navigation'));return{content:content.backgroundColor,navigation:navigation.backgroundColor};})()`);
  await wait(cdp, `document.documentElement.dataset.resolvedTheme==='light'`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="appearance-theme-light"]').getAttribute('aria-pressed')`), 'true');

  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-dark"]').click()`);
  await wait(cdp, `document.documentElement.dataset.resolvedTheme==='dark'`);
  const darkColors = await cdp.eval(`(()=>{const content=getComputedStyle(document.querySelector('.settings-content'));const navigation=getComputedStyle(document.querySelector('.settings-navigation'));return{content:content.backgroundColor,navigation:navigation.backgroundColor,card:getComputedStyle(document.querySelector('.appearance-card')).backgroundColor,color:getComputedStyle(document.body).color};})()`);
  assert.notDeepEqual(darkColors.content, lightColors.content);
  assert.notDeepEqual(darkColors.navigation, lightColors.navigation);
  assert.match(darkColors.content, /^rgb\((?:1[0-9]|2[0-9]|3[0-9]),/);
  await screenshot(cdp, 'appearance-dark.png');

  await cdp.eval(`[...document.querySelectorAll('.accent-options button')].find((item)=>item.title==='蓝色').click()`);
  await wait(cdp, `getComputedStyle(document.documentElement).getPropertyValue('--fl-color-accent').trim().toUpperCase()==='#326BCB'`);
  await cdp.eval(`[...document.querySelectorAll('[role="radiogroup"][aria-label="界面密度"] button')].find((item)=>item.textContent==='紧凑').click()`);
  await wait(cdp, `document.documentElement.dataset.uiDensity==='compact'`);
  await cdp.eval(`[...document.querySelectorAll('[role="radiogroup"][aria-label="界面圆角"] button')].find((item)=>item.textContent==='大').click()`);
  await wait(cdp, `document.documentElement.dataset.uiRadius==='large'`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-translucent-sidebar"]').click()`);
  await wait(cdp, `document.documentElement.dataset.translucentSidebar==='true'`);
  assert.match(await cdp.eval(`getComputedStyle(document.querySelector('.settings-navigation')).backdropFilter`), /blur/);

  await cdp.eval(`document.querySelector('[data-testid="appearance-reduced-motion"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-reduced-motion-option-REDUCE"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reduced-motion-option-REDUCE"]').click()`);
  await wait(cdp, `document.documentElement.dataset.reduceMotion==='true'`);
  const persisted = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2'))`);
  assert.equal(persisted.appearance.themePreference, 'DARK');
  assert.equal(persisted.appearance.accentPreset, 'BLUE');
  assert.equal(persisted.appearance.density, 'COMPACT');
  assert.equal(persisted.appearance.radius, 'LARGE');

  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`);
  assert.equal(await cdp.eval(`document.documentElement.dataset.resolvedTheme`), 'dark');
  assert.equal(await cdp.eval(`document.documentElement.dataset.uiDensity`), 'compact');

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-settings',{detail:'APPEARANCE'}))`);
  await wait(cdp, `document.querySelector('[data-testid="settings-appearance"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-system"]').click()`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await wait(cdp, `document.documentElement.dataset.resolvedTheme==='light'`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await wait(cdp, `document.documentElement.dataset.resolvedTheme==='dark'`);
  assert.equal(await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2')).appearance.themePreference`), 'SYSTEM');

  await cdp.eval(`document.querySelector('[data-testid="appearance-import-theme"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-import-dialog"]')`);
  await cdp.eval(setValue('[data-testid="appearance-import-dialog"] textarea', '{"version":1,"executable":"alert(1)"}'));
  await cdp.eval(`document.querySelector('[data-testid="appearance-import-dialog"] .dialog-confirm').click()`);
  await wait(cdp, `document.body.innerText.includes('主题格式无效')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-import-dialog"] [aria-label="关闭"]').click()`);

  await cdp.eval(`document.querySelector('[data-testid="settings-category-general"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-general"]')`);
  await cdp.eval(`document.querySelector('[data-testid="startup-destination"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="startup-destination-option-NOW"]')`);
  await cdp.eval(`document.querySelector('[data-testid="startup-destination-option-NOW"]').click()`);
  await cdp.eval(`document.querySelector('[data-testid="settings-category-appearance"]').click()`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reset"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-reset-dialog"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reset-dialog"] .dialog-danger').click()`);
  await wait(cdp, `document.documentElement.dataset.themePreference==='system'&&document.documentElement.dataset.uiDensity==='standard'`);
  const reset = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2'))`);
  assert.equal(reset.startupDestination, 'NOW');
  assert.equal(reset.appearance.accentPreset, 'FIELORA');
  assert.equal(reset.appearance.advancedColorOverrides && Object.keys(reset.appearance.advancedColorOverrides).length, 0);

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log('appearance settings e2e: PASS');
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
}
