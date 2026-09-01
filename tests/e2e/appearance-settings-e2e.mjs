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
const visualReview = path.join(root, 'apps', 'desktop', 'out', 'visual-review-current');
let child;
let cdp;
let originalPreferenceStorage;
let preferenceStorageRestored = false;
const output = [];

const wait = (cdp, expression, timeout = 20_000) => waitForExpression(cdp, expression, { timeoutMs: timeout, output });

try {
  await mkdir(visualReview, { recursive: true });
  const launched = await launchElectron({ root, dataRoot, output, executablePath: process.env.FIELORA_PACKAGED_APP ?? '' });
  child = launched.child;
  cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`);
  originalPreferenceStorage = await cdp.eval(`({current:localStorage.getItem('fielora.ui.preferences.v2'),legacy:localStorage.getItem('fielora.ui.preferences.v1')})`);
  await cdp.eval(`localStorage.removeItem('fielora.ui.preferences.v2');localStorage.removeItem('fielora.ui.preferences.v1');location.reload()`);
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
  const settingsRails = [];
  for (const [category, section] of [['general', 'settings-general'], ['shortcuts', 'settings-shortcuts'], ['appearance', 'settings-appearance']]) {
    await cdp.eval(`document.querySelector('[data-testid="settings-category-${category}"]').click()`);
    await wait(cdp, `document.querySelector('[data-testid="${section}"]')`);
    settingsRails.push(await cdp.eval(`(()=>{const rect=document.querySelector('[data-testid="${section}"]').getBoundingClientRect();return{left:rect.left,width:rect.width};})()`));
  }
  assert.equal(Math.max(...settingsRails.map((rail) => rail.left)) - Math.min(...settingsRails.map((rail) => rail.left)) <= 1, true, JSON.stringify(settingsRails));
  assert.equal(Math.max(...settingsRails.map((rail) => rail.width)) - Math.min(...settingsRails.map((rail) => rail.width)) <= 1, true, JSON.stringify(settingsRails));
  await cdp.eval(`document.querySelector('[data-testid="settings-category-appearance"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="settings-appearance"]')`);
  assert.equal(await cdp.eval(`document.querySelectorAll('.appearance-mode-control [role="radio"]').length`), 3);
  assert.equal(await cdp.eval(`document.querySelectorAll('.theme-preview-card').length`), 0);
  assert.equal(await cdp.eval(`Boolean(document.querySelector('[data-testid="official-theme-card"],[data-testid="appearance-import-theme"],.advanced-theme-section'))`), false);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="settings-appearance"]').innerText.includes('Glass 不是一个主题选项')`), false);
  assert.equal(await cdp.eval(`['appearance-sidebar-background-summary','appearance-workspace-background-hex','appearance-ui-font','appearance-ui-font-size','appearance-code-font','appearance-code-font-size','appearance-surface-contrast','appearance-action-color-hex','appearance-reduced-motion','appearance-high-contrast','appearance-smooth-scrolling','appearance-reset'].every((id)=>document.querySelector('[data-testid="'+id+'"]'))`), true);
  assert.equal(await cdp.eval(`document.querySelectorAll('input[type="color"]').length`), 0);
  assert.equal(await cdp.eval(`Boolean(document.querySelector('[data-testid="settings-screen"]')) && !document.querySelector('.project-context-controls,.utility-control-dock')`), true);

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 420, deviceScaleFactor: 1, mobile: false });
  const settingsScroll = await cdp.eval(`(()=>{const content=document.querySelector('.settings-content');const style=getComputedStyle(content);return{overflowY:style.overflowY,scrollHeight:content.scrollHeight,clientHeight:content.clientHeight};})()`);
  assert.equal(settingsScroll.overflowY, 'auto');
  assert.equal(settingsScroll.scrollHeight > settingsScroll.clientHeight, true);
  await cdp.eval(`document.querySelector('.settings-content').scrollTo({ top: document.querySelector('.settings-content').scrollHeight, behavior: 'instant' })`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await cdp.eval(`document.querySelector('.settings-content').scrollTop > 0`), true);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.eval(`document.querySelector('.settings-content').scrollTo({ top: 0, behavior: 'instant' })`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-light"]').click()`);
  await wait(cdp, `document.documentElement.dataset.effectiveAppearance==='light'`);
  const sidebarDefault = await cdp.eval(`(()=>{const stored=JSON.parse(localStorage.getItem('fielora.ui.preferences.v2'));return{summary:document.querySelector('[data-testid="appearance-sidebar-background-summary"]').textContent,override:stored.appearance.sidebarBackgroundOverride,gradientOverride:stored.appearance.sidebarBackgroundGradientOverride};})()`);
  assert.deepEqual(sidebarDefault, { summary: '主题渐变', override: null, gradientOverride: null });
  const chromeContinuity = await cdp.eval(`(()=>{const top=getComputedStyle(document.querySelector('[data-brand-chrome="top"]'));const navigation=getComputedStyle(document.querySelector('.settings-navigation[data-brand-chrome="navigation"]'));return{topImage:top.backgroundImage,navigationImage:navigation.backgroundImage,override:document.documentElement.style.getPropertyValue('--fl-sidebar-background')};})()`);
  assert.equal(chromeContinuity.navigationImage, chromeContinuity.topImage);
  assert.equal(chromeContinuity.override, '');
  await captureScreenshot(cdp, path.join(visualReview, 'appearance-refined-light-1440.png'));
  const customizationGeometry = await cdp.eval(`(()=>{const rows=[...document.querySelectorAll('.appearance-customization-card .appearance-setting-row')];const controls=rows.map((row)=>row.lastElementChild.getBoundingClientRect());const heading=document.querySelector('#appearance-customization-title');const description=heading.nextElementSibling;return{rowHeights:rows.map((row)=>row.getBoundingClientRect().height),controlHeights:controls.map((rect)=>rect.height),copyHeights:rows.map((row)=>row.firstElementChild.getBoundingClientRect().height),rowBoxSizing:rows.map((row)=>getComputedStyle(row).boxSizing),rowPadding:rows.map((row)=>getComputedStyle(row).padding),controlLefts:controls.map((rect)=>rect.left),controlRights:controls.map((rect)=>rect.right),descriptionBelowTitle:description.getBoundingClientRect().top>=heading.getBoundingClientRect().bottom};})()`);
  assert.equal(Math.max(...customizationGeometry.rowHeights) <= 62, true, JSON.stringify(customizationGeometry));
  assert.equal(Math.max(...customizationGeometry.controlLefts) - Math.min(...customizationGeometry.controlLefts) <= 1, true, JSON.stringify(customizationGeometry));
  assert.equal(Math.max(...customizationGeometry.controlRights) - Math.min(...customizationGeometry.controlRights) <= 1, true, JSON.stringify(customizationGeometry));
  assert.equal(customizationGeometry.descriptionBelowTitle, true);

  await cdp.eval(`(()=>{const input=document.querySelector('[data-testid="appearance-surface-contrast"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'0');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(cdp, `JSON.parse(localStorage.getItem('fielora.ui.preferences.v2')).appearance.surfaceContrast===0 && document.documentElement.style.getPropertyValue('--fl-brand-chrome-active').includes('0.00%') && document.documentElement.style.getPropertyValue('--fl-brand-chrome-selection-shadow')==='none' && getComputedStyle(document.querySelector('[data-testid="settings-category-appearance"]')).boxShadow==='none'`);
  await new Promise((resolve) => setTimeout(resolve, 180));
  const lowContrastNavigation = await cdp.eval(`(()=>{const button=document.querySelector('[data-testid="settings-category-appearance"]');const style=getComputedStyle(button);return{background:style.backgroundColor,shadow:style.boxShadow,activeToken:style.getPropertyValue('--fl-brand-chrome-active'),shadowToken:style.getPropertyValue('--fl-brand-chrome-selection-shadow')};})()`);
  await cdp.eval(`(()=>{const input=document.querySelector('[data-testid="appearance-surface-contrast"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'100');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(cdp, `JSON.parse(localStorage.getItem('fielora.ui.preferences.v2')).appearance.surfaceContrast===100 && document.documentElement.style.getPropertyValue('--fl-brand-chrome-active').includes('29.00%') && document.documentElement.style.getPropertyValue('--fl-brand-chrome-selection-shadow').includes('12.00%') && getComputedStyle(document.querySelector('[data-testid="settings-category-appearance"]')).boxShadow!=='none'`);
  await new Promise((resolve) => setTimeout(resolve, 180));
  const highContrastNavigation = await cdp.eval(`(()=>{const button=document.querySelector('[data-testid="settings-category-appearance"]');const style=getComputedStyle(button);return{background:style.backgroundColor,shadow:style.boxShadow,activeToken:style.getPropertyValue('--fl-brand-chrome-active'),shadowToken:style.getPropertyValue('--fl-brand-chrome-selection-shadow')};})()`);
  const contrastNavigationEvidence = JSON.stringify({ lowContrastNavigation, highContrastNavigation });
  assert.notEqual(highContrastNavigation.background, lowContrastNavigation.background, contrastNavigationEvidence);
  assert.equal(lowContrastNavigation.shadow, 'none', contrastNavigationEvidence);
  assert.notEqual(highContrastNavigation.shadow, 'none', contrastNavigationEvidence);
  await cdp.eval(`(()=>{const input=document.querySelector('[data-testid="appearance-surface-contrast"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'42');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(cdp, `JSON.parse(localStorage.getItem('fielora.ui.preferences.v2')).appearance.surfaceContrast===42 && document.documentElement.style.getPropertyValue('--fl-brand-chrome-selection-shadow')===''`);

  const light = await cdp.eval(`(()=>{const content=getComputedStyle(document.querySelector('.settings-content'));const navigation=getComputedStyle(document.querySelector('.settings-navigation'));return{content:content.backgroundColor,navigation:navigation.backgroundColor};})()`);
  assert.notEqual(light.content, light.navigation);

  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-dark"]').click()`);
  await wait(cdp, `document.documentElement.dataset.effectiveAppearance==='dark'`);
  const dark = await cdp.eval(`(()=>{const content=getComputedStyle(document.querySelector('.settings-content'));const navigation=getComputedStyle(document.querySelector('.settings-navigation'));return{content:content.backgroundColor,navigation:navigation.backgroundColor,color:getComputedStyle(document.body).color};})()`);
  assert.notDeepEqual(dark, light);

  await cdp.eval(`document.querySelector('[data-testid="appearance-theme-light"]').click()`);
  await wait(cdp, `document.documentElement.dataset.effectiveAppearance==='light'`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-sidebar-background-mode"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-sidebar-background-mode-option-SOLID"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-sidebar-background-mode-option-SOLID"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-sidebar-background-hex"]:not([readonly])')`);
  await cdp.eval(`(()=>{const input=document.querySelector('[data-testid="appearance-sidebar-background-hex"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'#DDEEFF');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(cdp, `document.documentElement.style.getPropertyValue('--fl-brand-chrome-canvas')==='#DDEEFF'`);
  const customSidebar = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2')).appearance.sidebarBackgroundOverride`);
  assert.equal(customSidebar, '#DDEEFF');
  const customChromeContinuity = await cdp.eval(`(()=>{const top=getComputedStyle(document.querySelector('[data-brand-chrome="top"]'));const navigation=getComputedStyle(document.querySelector('.settings-navigation[data-brand-chrome="navigation"]'));return{top:top.backgroundImage,nav:navigation.backgroundImage,legacy:document.documentElement.style.getPropertyValue('--fl-sidebar-background')};})()`);
  assert.equal(customChromeContinuity.top, customChromeContinuity.nav);
  assert.equal(customChromeContinuity.legacy, '');

  await cdp.eval(`document.querySelector('[data-testid="appearance-sidebar-background-picker"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-sidebar-background-popover"]')`);
  const pickerGeometry = await cdp.eval(`(()=>{const rect=document.querySelector('[data-testid="appearance-sidebar-background-popover"]').getBoundingClientRect();return{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height,viewportWidth:innerWidth,viewportHeight:innerHeight};})()`);
  assert.equal(pickerGeometry.left >= 12 && pickerGeometry.top >= 12 && pickerGeometry.right <= pickerGeometry.viewportWidth - 12 && pickerGeometry.bottom <= pickerGeometry.viewportHeight - 12, true, JSON.stringify(pickerGeometry));
  await captureScreenshot(cdp, path.join(visualReview, 'appearance-color-picker-bounded-light-1440.png'));
  await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await wait(cdp, `!document.querySelector('[data-testid="appearance-sidebar-background-popover"]')`);

  await cdp.eval(`document.querySelector('[data-testid="appearance-workspace-background-mode"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-workspace-background-mode-option-GRADIENT"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-workspace-background-mode-option-GRADIENT"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-workspace-background-from-hex"]') && document.querySelector('[data-testid="appearance-workspace-background-to-hex"]')`);
  await cdp.eval(`(()=>{for(const [id,value] of [['appearance-workspace-background-from-hex','#FFFDF8'],['appearance-workspace-background-to-hex','#EEF7FF']]){const input=document.querySelector('[data-testid="'+id+'"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await wait(cdp, `document.documentElement.style.getPropertyValue('--fl-surface-content').includes('#FFFDF8') && document.documentElement.style.getPropertyValue('--fl-surface-content').includes('#EEF7FF')`);
  const workspaceGradient = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2')).appearance.workspaceBackgroundGradientOverride`);
  assert.deepEqual(workspaceGradient, { from: '#FFFDF8', to: '#EEF7FF' });
  await captureScreenshot(cdp, path.join(visualReview, 'appearance-gradient-picker-light-1440.png'));

  await cdp.eval(`document.querySelector('[data-testid="appearance-reduced-motion"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-reduced-motion-option-REDUCE"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reduced-motion-option-REDUCE"]').click()`);
  await wait(cdp, `document.documentElement.dataset.reduceMotion==='true'`);
  const persisted = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2'))`);
  assert.equal(persisted.appearance.themePreference, 'LIGHT');
  assert.equal(persisted.appearance.reducedMotionPreference, 'REDUCE');

  await cdp.eval(`document.documentElement.dataset.material='solid'`);
  await wait(cdp, `getComputedStyle(document.querySelector('.settings-navigation')).backdropFilter==='none'`);
  const fallback = await cdp.eval(`(()=>{const style=getComputedStyle(document.querySelector('.settings-navigation'));return{backdrop:style.backdropFilter,background:style.backgroundColor,backgroundImage:style.backgroundImage,color:style.color};})()`);
  assert.equal(fallback.backdrop, 'none');
  assert.equal(fallback.background === 'rgba(0, 0, 0, 0)' && fallback.backgroundImage === 'none', false);
  await cdp.eval(`document.documentElement.dataset.material='glass'`);

  await cdp.eval(`document.querySelector('[data-testid="appearance-reset"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="appearance-reset-dialog"]')`);
  await cdp.eval(`document.querySelector('[data-testid="appearance-reset-dialog"] .dialog-confirm').click()`);
  await wait(cdp, `!JSON.parse(localStorage.getItem('fielora.ui.preferences.v2')).appearance.sidebarBackgroundOverride`);
  const reset = await cdp.eval(`JSON.parse(localStorage.getItem('fielora.ui.preferences.v2'))`);
  assert.equal(reset.appearance.themePreference, 'LIGHT');
  assert.equal(reset.appearance.reducedMotionPreference, 'REDUCE');
  assert.equal(reset.appearance.sidebarBackgroundOverride, null);
  assert.equal(reset.appearance.sidebarBackgroundGradientOverride, null);
  assert.equal(reset.appearance.workspaceBackgroundOverride, null);
  assert.equal(reset.appearance.workspaceBackgroundGradientOverride, null);
  assert.equal(reset.appearance.uiFontSize, 15);
  assert.equal(reset.appearance.codeFontSize, 13);
  assert.equal(reset.appearance.surfaceContrast, 42);
  assert.equal(reset.appearance.actionColorOverride, null);

  await cdp.eval(`(()=>{const saved=${JSON.stringify(originalPreferenceStorage)};if(saved.current===null)localStorage.removeItem('fielora.ui.preferences.v2');else localStorage.setItem('fielora.ui.preferences.v2',saved.current);if(saved.legacy===null)localStorage.removeItem('fielora.ui.preferences.v1');else localStorage.setItem('fielora.ui.preferences.v1',saved.legacy);})()`);
  preferenceStorageRestored = true;
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log('Fielora Glass appearance settings e2e: PASS');
} finally {
  if (cdp && !preferenceStorageRestored && originalPreferenceStorage) {
    try {
      await cdp.eval(`(()=>{const saved=${JSON.stringify(originalPreferenceStorage)};if(saved.current===null)localStorage.removeItem('fielora.ui.preferences.v2');else localStorage.setItem('fielora.ui.preferences.v2',saved.current);if(saved.legacy===null)localStorage.removeItem('fielora.ui.preferences.v1');else localStorage.setItem('fielora.ui.preferences.v1',saved.legacy);})()`);
    } catch {}
  }
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
}
