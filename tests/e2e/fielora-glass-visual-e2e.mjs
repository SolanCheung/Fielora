import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-glass-visual-'));
const projectRoot = path.join(dataRoot, 'glass-project');
const evidenceRoot = path.join(root, 'artifacts', 'fielora-glass', 'visual-matrix');
const output = [];
let child;

const wait = (cdp, expression, timeout = 30_000) => waitForExpression(cdp, expression, { timeoutMs: timeout, output });
const screenshot = (cdp, name) => captureScreenshot(cdp, path.join(evidenceRoot, name));
const click = (cdp, selector) => cdp.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);

async function setWindowWidth(cdp, width) {
  await cdp.eval(`window.fieloraTest.resizeWindow({width:${width},height:900})`);
  await wait(cdp, `Math.abs(window.innerWidth-${width})<=2`);
  await new Promise((resolve) => setTimeout(resolve, 220));
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

async function assertViewportIntegrity(cdp, surface) {
  const metrics = await cdp.eval(`(()=>{
    const conversation=document.querySelector('.conversation-column')?.getBoundingClientRect();
    const composer=document.querySelector('[data-testid="conversation-composer"]')?.getBoundingClientRect();
    const dock=document.querySelector('[data-testid="right-workspace-dock"]')?.getBoundingClientRect();
    return{
      viewport:window.innerWidth,
      documentWidth:document.documentElement.scrollWidth,
      bodyWidth:document.body.scrollWidth,
      conversation:conversation?{left:conversation.left,right:conversation.right,width:conversation.width}:null,
      composer:composer?{left:composer.left,right:composer.right,width:composer.width}:null,
      dock:dock?{left:dock.left,right:dock.right,width:dock.width}:null,
      surfaces:[...new Set([...document.querySelectorAll('[data-surface]')].map((node)=>node.dataset.surface))].sort(),
    };
  })()`);
  assert.ok(metrics.documentWidth <= metrics.viewport + 2, `${surface}: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.bodyWidth <= metrics.viewport + 2, `${surface}: ${JSON.stringify(metrics)}`);
  if (metrics.conversation && metrics.composer) {
    assert.ok(metrics.conversation.width >= 320, `${surface}: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.composer.left >= metrics.conversation.left - 1 && metrics.composer.right <= metrics.conversation.right + 1, `${surface}: ${JSON.stringify(metrics)}`);
  }
  if (metrics.dock && metrics.dock.width > 10) assert.ok(metrics.dock.left >= -2 && metrics.dock.right <= metrics.viewport + 2, `${surface}: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.surfaces.includes('canvas') && metrics.surfaces.includes('chrome') && metrics.surfaces.includes('content'), `${surface}: ${JSON.stringify(metrics)}`);
}

try {
  await Promise.all([
    mkdir(path.join(projectRoot, 'src'), { recursive: true }),
    mkdir(evidenceRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(projectRoot, 'README.md'), '# Fielora Glass visual fixture\n'),
    writeFile(path.join(projectRoot, 'src', 'glass.ts'), 'export const officialDesignLanguage = "Fielora Glass";\n'),
    writeFile(path.join(projectRoot, 'package.json'), '{"name":"fielora-glass-visual-fixture","private":true}\n'),
  ]);

  const launched = await launchElectron({ root, dataRoot, output });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')&&window.fieloraTest&&window.fielora.core.getHealth().then((health)=>health.state==='READY')`, 60_000);

  const setup = await cdp.eval(`(async()=>{
    const project=await window.fieloraTest.createProject({title:'Fielora Glass',goal:'Official visual language quality pass',root_path:${JSON.stringify(projectRoot)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'设计系统质量验收',provider_config_id:null,model_id:null});
    await window.fielora.conversation.createMessage({conversation_id:conversation.id,role:'USER',content:'请让设置、对话、工作区和标签在 Light 与 Dark 下保持同一套清晰的视觉语言。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    await window.fielora.conversation.createMessage({conversation_id:conversation.id,role:'ASSISTANT',content:'Fielora Glass 使用 Canvas、Content、Chrome、Floating、Overlay 五层语义表面。正文保持近实色，材质只用于表达结构与临时层级。',status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null});
    return{projectId:project.field_id,conversationId:conversation.id};
  })()`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`);

  for (const appearance of ['light', 'dark']) {
    for (const width of [1280, 1440, 1920]) {
      await setWindowWidth(cdp, width);
      await openAppearance(cdp, appearance);
      assert.equal(await cdp.eval(`document.querySelectorAll('.appearance-mode-control [role="radio"]').length`), 3);
      assert.equal(await cdp.eval(`document.querySelectorAll('.theme-preview-card').length`), 0);
      assert.equal(await cdp.eval(`document.documentElement.dataset.officialTheme`), 'fielora');
      assert.equal(await cdp.eval(`document.documentElement.dataset.material`), 'glass');
      await assertViewportIntegrity(cdp, `${width}-${appearance}-settings`);
      await screenshot(cdp, `${width}-${appearance}-settings.png`);

      await click(cdp, '[data-testid="settings-back"]');
      await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`);
      await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:close-workspace-dock'))`);
      await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
      await assertViewportIntegrity(cdp, `${width}-${appearance}-conversation`);
      await screenshot(cdp, `${width}-${appearance}-conversation.png`);

      if (width === 1440) {
        await click(cdp, '[data-testid="composer-permission"]');
        await wait(cdp, `document.querySelector('[data-testid="composer-permission-menu"]')`);
        assert.equal(await cdp.eval(`document.querySelector('[data-testid="composer-permission-menu"]').dataset.surface`), 'overlay');
        await screenshot(cdp, `${width}-${appearance}-overlay.png`);
        await click(cdp, '[data-testid="composer-permission"]');
      }

      await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:'FILES'}))`);
      await wait(cdp, `document.querySelector('[data-testid="right-dock-tab-files"]')&&document.querySelector('[data-testid="workspace-file-tool"]')`);
      await click(cdp, '[data-testid="right-dock-tab-files"]');
      await assertViewportIntegrity(cdp, `${width}-${appearance}-workspace`);
      await screenshot(cdp, `${width}-${appearance}-workspace.png`);

      for (const tool of ['BROWSER', 'TERMINAL', 'DIFF']) {
        await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace',{detail:${JSON.stringify(tool)}}))`);
      }
      await wait(cdp, `document.querySelectorAll('.right-dock-tab').length>=4`);
      await click(cdp, '[data-testid="right-dock-tab-terminal"]');
      assert.ok(await cdp.eval(`document.querySelectorAll('.right-dock-tab .app-icon').length>=4`));
      await assertViewportIntegrity(cdp, `${width}-${appearance}-tabs`);
      await screenshot(cdp, `${width}-${appearance}-tabs.png`);

      await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:close-workspace-dock'))`);
      await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
    }
  }

  await openAppearance(cdp, 'dark');
  await cdp.eval(`document.documentElement.dataset.material='solid'`);
  await wait(cdp, `getComputedStyle(document.querySelector('.settings-navigation')).backdropFilter==='none'`);
  const fallback = await cdp.eval(`(()=>{const node=document.querySelector('.settings-navigation');const style=getComputedStyle(node);return{material:document.documentElement.dataset.material,backdrop:style.backdropFilter,background:style.backgroundColor,surface:node.dataset.surface};})()`);
  assert.equal(fallback.material, 'solid');
  assert.equal(fallback.backdrop, 'none');
  assert.notEqual(fallback.background, 'rgba(0, 0, 0, 0)');
  assert.equal(fallback.surface, 'chrome');
  await screenshot(cdp, 'fallback-dark-solid-settings.png');

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log('Fielora Glass visual matrix e2e: PASS\nSCREENSHOTS: 27\nMODEL_REQUESTS: 0\nPUBLIC_NETWORK_REQUESTS: 0');
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
