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
const evidence = path.join(root, 'artifacts', 'fielora-glass');
let child;
const output = [];

const wait = (cdp, expression, timeout = 20_000) => waitForExpression(cdp, expression, { timeoutMs: timeout, output });
const screenshot = (cdp, name) => captureScreenshot(cdp, path.join(evidence, name));

try {
  await mkdir(evidence, { recursive: true });
  const launched = await launchElectron({ root, dataRoot, output, executablePath: process.env.FIELORA_PACKAGED_APP ?? '' });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`);
  await wait(cdp, `['light','dark'].includes(document.documentElement.dataset.effectiveAppearance)`);
  const initialAppearance = await cdp.eval(`({
    theme:document.documentElement.dataset.officialTheme,
    language:document.documentElement.dataset.designLanguage,
    mode:document.documentElement.dataset.appearanceMode,
    effective:document.documentElement.dataset.effectiveAppearance,
    material:document.documentElement.dataset.material,
  })`);
  assert.deepEqual({ theme: initialAppearance.theme, language: initialAppearance.language, material: initialAppearance.material }, { theme: 'fielora', language: 'fielora-glass', material: 'glass' });
  assert.ok(['system', 'light', 'dark'].includes(initialAppearance.mode));
  assert.ok(['light', 'dark'].includes(initialAppearance.effective));

  await cdp.eval(`document.querySelector('[data-testid="settings-nav"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-screen"]')`);
  await cdp.eval(`document.querySelector('[data-testid="settings-category-appearance"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-appearance"]')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('.appearance-mode-control [role="radio"]').length`), 3);
  assert.equal(await cdp.eval(`document.querySelectorAll('.theme-preview-card').length`), 0);
  assert.equal(await cdp.eval(`Boolean(document.querySelector('[data-testid="official-theme-card"],[data-testid="appearance-import-theme"],.advanced-theme-section'))`), false);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="settings-appearance"]').innerText.includes('Glass 不是一个主题选项')`), false);
  assert.equal(await cdp.eval(`['appearance-font-scale','appearance-reduced-motion','appearance-high-contrast','appearance-smooth-scrolling','appearance-reset'].every((id)=>document.querySelector('[data-testid="'+id+'"]'))`), true);
  assert.equal(await cdp.eval(`Boolean(document.querySelector('[data-testid="settings-screen"]')) && !document.querySelector('.project-context-controls,.utility-control-dock')`), true);

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 420, deviceScaleFactor: 1, mobile: false });
  const settingsScroll = await cdp.eval(`(()=>{const content=document.querySelector('.settings-content');const style=getComputedStyle(content);return{overflowY:style.overflowY,scrollHeight:content.scrollHeight,clientHeight:content.clientHeight};})()`);
  assert.equal(settingsScroll.overflowY, 'auto');
  assert.equal(settingsScroll.scrollHeight > settingsScroll.clientHeight, true);
  await cdp.eval(`document.querySelector('.settings-content').scrollTo({ top: document.querySelector('.settings-content').scrollHeight, behavior: 'instant' })`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await cdp.eval(`document.querySelector('.settings-content').scrollTop > 0`), true);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-light"]').click()`);
  await wait(cdp, `document.documentElement.dataset.effectiveAppearance==='light'`);
  await screenshot(cdp, 'settings-1440-light.png');

  const light = await cdp.eval(`(()=>{const content=getComputedStyle(document.querySelector('.settings-content'));const navigation=getComputedStyle(document.querySelector('.settings-navigation'));return{content:content.backgroundColor,navigation:navigation.backgroundColor};})()`);
  assert.notEqual(light.content, light.navigation);

  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-dark"]').click()`);
  await wait(cdp, `document.documentElement.dataset.effectiveAppearance==='dark'`);
  const dark = await cdp.eval(`(()=>{const content=getComputedStyle(document.querySelector('.settings-content'));const navigation=getComputedStyle(document.querySelector('.settings-navigation'));return{content:content.backgroundColor,navigation:navigation.backgroundColor,color:getComputedStyle(document.body).color};})()`);
  assert.notDeepEqual(dark, light);
  await screenshot(cdp, 'settings-1440-dark.png');

  await cdp.eval(`document.querySelector('[data-testid="appearance-reduced-motion"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-reduced-motion-option-REDUCE"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reduced-motion-option-REDUCE"]').click()`);
  await wait(cdp, `document.documentElement.dataset.reduceMotion==='true'`);
  const persisted = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2'))`);
  assert.equal(persisted.appearance.themePreference, 'DARK');
  assert.equal(persisted.appearance.reducedMotionPreference, 'REDUCE');

  await cdp.eval(`document.documentElement.dataset.material='solid'`);
  await wait(cdp, `getComputedStyle(document.querySelector('.settings-navigation')).backdropFilter==='none'`);
  const fallback = await cdp.eval(`(()=>{const style=getComputedStyle(document.querySelector('.settings-navigation'));return{backdrop:style.backdropFilter,background:style.backgroundColor,color:style.color};})()`);
  assert.equal(fallback.backdrop, 'none');
  assert.notEqual(fallback.background, 'rgba(0, 0, 0, 0)');
  await screenshot(cdp, 'settings-1440-dark-solid-fallback.png');
  await cdp.eval(`document.documentElement.dataset.material='glass'`);

  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-system"]').click()`);
  await wait(cdp, `document.documentElement.dataset.appearanceMode==='system'`);
  assert.equal(await cdp.eval(`document.documentElement.dataset.appearanceMode`), 'system');

  await cdp.eval(`document.querySelector('[data-testid="appearance-reset"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-reset-dialog"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reset-dialog"] .dialog-danger').click()`);
  await wait(cdp, `document.documentElement.dataset.appearanceMode==='system'`);
  const reset = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2'))`);
  assert.equal(reset.appearance.themePreference, 'SYSTEM');
  assert.equal(reset.appearance.uiFontScale, 100);

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log('Fielora Glass appearance settings e2e: PASS');
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
}
