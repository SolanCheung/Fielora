import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  cleanupElectronProcess,
  connectToFieloraApp,
  launchElectron,
  pollUntil,
  waitForChildExit,
  waitForExpression,
} from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-screenshot-evidence-'));
const projectRoot = path.join(dataRoot, 'project');
const libraryImage = path.join(dataRoot, 'normal-library-image.png');
const migratedLibraryRoot = path.join(dataRoot, 'LibraryRoot-B');
const portableTarget = path.join(dataRoot, 'screenshot-privacy.fielora');
const fixturePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const output = [];
let launched;
let cdp;
let server;

function portableManifest(bytes) {
  const magicLength = Buffer.from('FIELORA_PROFILE\0', 'ascii').byteLength;
  const length = bytes.readUInt32BE(magicLength);
  return JSON.parse(bytes.subarray(magicLength + 4, magicLength + 4 + length).toString('utf8'));
}

try {
  await mkdir(projectRoot, { recursive: true });
  await mkdir(migratedLibraryRoot, { recursive: true });
  await writeFile(path.join(projectRoot, 'README.md'), '# Screenshot fixture\n');
  await writeFile(libraryImage, fixturePng);
  server = createServer((request, response) => {
    if (request.url !== '/viewport') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end('<!doctype html><html><head><title>Durable Screenshot Fixture</title><style>html,body{margin:0;background:#f4efe7;color:#19232d;font-family:system-ui}.hero{height:100vh;display:grid;place-items:center}.proof{padding:48px;border:3px solid #6048a8;background:white}h1{margin:0 0 12px;font-size:40px}</style></head><body><main class="hero"><section class="proof"><h1>Viewport Evidence</h1><p>Product capture primitive · deterministic fixture</p></section></main></body></html>');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server did not bind');
  const fixtureUrl = `http://127.0.0.1:${address.port}/viewport`;

  launched = await launchElectron({
    root,
    dataRoot,
    output,
    extraEnv: {
      FIELORA_E2E_PROJECT_PATH: projectRoot,
      FIELORA_E2E_LIBRARY_PATHS: JSON.stringify([libraryImage]),
      FIELORA_E2E_LIBRARY_ROOT_TARGET: migratedLibraryRoot,
      FIELORA_E2E_PROFILE_EXPORT_TARGET: portableTarget,
    },
  });
  cdp = await connectToFieloraApp({ port: launched.port, output, enablePage: true });
  await waitForExpression(cdp, `document.querySelector('[data-testid="project-workspace"]') && window.fieloraTest`, { timeoutMs: 60_000, output });
  await waitForExpression(cdp, `window.fielora.project.list().then(()=>true).catch(()=>false)`, { timeoutMs: 30_000, output });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const setup = await cdp.eval(`(async()=>{
    const imported=await window.fielora.library.addFiles();
    const libraryImage=imported.find((item)=>item.original_filename==='normal-library-image.png');
    const project=await window.fieloraTest.createProject({title:'Screenshot Evidence Project',goal:'Durable viewport proof',root_path:${JSON.stringify(projectRoot)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'Viewport proof',provider_config_id:null,model_id:null});
    const libraryBefore=(await window.fielora.library.list({media_kind:null,include_deleted:true,limit:500})).length;
    await window.fielora.browser.show({x:80,y:100,width:920,height:640});
    await window.fielora.browser.navigate({url:${JSON.stringify(fixtureUrl)}});
    return {project,conversation,libraryImage,libraryBefore};
  })()`);
  await waitForExpression(cdp, `window.fielora.browser.getState().then((state)=>state.url===${JSON.stringify(fixtureUrl)}&&!state.is_loading&&state.surface.visible)`, { timeoutMs: 30_000, output });

  const captured = await cdp.eval(`window.fielora.browser.captureScreenshot()`);
  assert.equal(captured.source_kind, 'BROWSER_VIEWPORT');
  assert.equal(captured.captured_url, fixtureUrl);
  assert.match(captured.page_id, /^page_/u);
  assert.ok(captured.navigation_generation >= 1);
  assert.equal(captured.visibility, 'INTERNAL');
  assert.equal(captured.export_policy, 'EXCLUDED');
  assert.equal(captured.sync_policy, 'LOCAL_ONLY');
  assert.equal(captured.mime_type, 'image/png');
  assert.match(captured.content_sha256, /^[0-9a-f]{64}$/u);

  const durable = await cdp.eval(`window.fielora.screenshot.get({screenshot_evidence_id:${JSON.stringify(captured.id)}})`);
  assert.equal(durable.id, captured.id);
  assert.equal(durable.content_sha256, captured.content_sha256);
  assert.equal(await cdp.eval(`window.fielora.library.list({media_kind:null,include_deleted:true,limit:500}).then((items)=>items.length)`), setup.libraryBefore);

  const referenceId = `resultref_${'9'.repeat(32)}`;
  const message = await cdp.eval(`window.fielora.conversation.createMessage({
    conversation_id:${JSON.stringify(setup.conversation.id)},role:'ASSISTANT',
    content:${JSON.stringify(`## 页面验证\n\n当前实际界面：\n\n![Viewport Evidence](fielora-reference:${referenceId})\n\n对应验证已记录。`)},
    status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null,
    references:[{id:${JSON.stringify(referenceId)},label:'Viewport Evidence',target:{kind:'IMAGE',source:'SCREENSHOT_EVIDENCE',screenshot_evidence_id:${JSON.stringify(captured.id)},expected_sha256:${JSON.stringify(captured.content_sha256)},mime_type:'image/png'},provenance:{kind:'SCREENSHOT_EVIDENCE',screenshot_evidence_id:${JSON.stringify(captured.id)}}}]
  })`);
  assert.equal(message.references[0].target.screenshot_evidence_id, captured.id);

  const migration = await cdp.eval(`window.fielora.storage.migrateLibraryRoot()`);
  assert.equal(migration.root, migratedLibraryRoot);
  const migratedPreview = await cdp.eval(`window.fielora.screenshot.preview({screenshot_evidence_id:${JSON.stringify(captured.id)},expected_content_sha256:${JSON.stringify(captured.content_sha256)}})`);
  assert.equal(migratedPreview.screenshot_evidence_id, captured.id);
  assert.equal(migratedPreview.content_sha256, captured.content_sha256);
  assert.match(migratedPreview.data_url, /^data:image\/png;base64,/u);

  const exported = await cdp.eval(`window.fielora.profile.export({include_library:true,preferences:{version:2,startupDestination:'PROJECTS',appearance:{themePreference:'SYSTEM',accentPreset:'FIELORA',customAccent:'#6546C7',density:'STANDARD',contrast:'STANDARD',radius:'STANDARD',uiFont:'SYSTEM',codeFont:'SYSTEM_MONO',uiFontScale:100,translucentSidebar:false,softElevation:true,reducedMotionPreference:'SYSTEM',smoothScrolling:true,pointerCursor:true,highContrast:false,advancedColorOverrides:{}}}})`);
  assert.equal(exported.path, portableTarget);
  const manifest = portableManifest(await readFile(portableTarget));
  assert.ok(manifest.files.some((file) => file.path.endsWith(setup.libraryImage.content_hash)), 'normal Library image blob must be exported');
  assert.ok(manifest.files.every((file) => !file.path.endsWith(captured.content_sha256)), 'ScreenshotEvidence blob must be excluded');

  await cdp.eval(`window.fielora.browser.hide()`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForExpression(cdp, `document.querySelector('[data-testid="project-workspace"]')&&document.querySelector('[data-testid="markdown-inline-image"] img')`, { timeoutMs: 30_000, output });
  assert.deepEqual(await cdp.eval(`(()=>{const figure=document.querySelector('[data-testid="markdown-inline-image"]');return{source:figure.querySelector('figcaption span')?.textContent,before:figure.previousElementSibling?.textContent,next:figure.nextElementSibling?.textContent};})()`), {
    source: '页面截图', before: '当前实际界面：', next: '对应验证已记录。',
  });
  await cdp.eval(`document.querySelector('[data-testid="markdown-inline-image"] button').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="image-preview"]')`, { timeoutMs: 10_000, output });
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="image-preview"] img')?.getAttribute('alt')`), '页面截图');
  await cdp.eval(`document.querySelector('[aria-label="关闭图片预览"]').click()`);

  await cdp.eval(`window.fieloraTest.killCore()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="startup-screen"]')`, { timeoutMs: 5_000, output });
  await waitForExpression(cdp, `window.fielora.screenshot.get({screenshot_evidence_id:${JSON.stringify(captured.id)}}).then((value)=>value.id===${JSON.stringify(captured.id)}).catch(()=>false)`, { timeoutMs: 20_000, output });
  const recovered = await pollUntil(async () => {
    try {
      return await cdp.eval(`window.fielora.conversation.listMessages({conversation_id:${JSON.stringify(setup.conversation.id)}}).then((messages)=>messages.find((item)=>item.id===${JSON.stringify(message.id)}))`);
    } catch { return null; }
  }, { timeoutMs: 20_000, intervalMs: 100, errorMessage: () => `Conversation recovery timed out\n${output.join('')}` });
  assert.equal(recovered.references[0].target.screenshot_evidence_id, captured.id);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitForExpression(cdp, `document.querySelector('[data-testid="markdown-inline-image"] img')`, { timeoutMs: 20_000, output });
  await cdp.eval(`document.querySelector('[data-testid="markdown-inline-image"] button').click()`);
  await waitForExpression(cdp, `document.querySelector('[data-testid="image-preview"]')`, { timeoutMs: 10_000, output });

  await cdp.eval('void window.fielora.core.quit()');
  cdp.close(); cdp = undefined;
  await Promise.race([waitForChildExit(launched.child), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  console.log('DURABLE_SCREENSHOT_EVIDENCE_E2E: PASS');
} finally {
  cdp?.close();
  await cleanupElectronProcess(launched?.child);
  if (server) await new Promise((resolve) => server.close(resolve));
  if (path.resolve(dataRoot).startsWith(path.resolve(tmpdir()))) await rm(dataRoot, { recursive: true, force: true }).catch(() => undefined);
}
