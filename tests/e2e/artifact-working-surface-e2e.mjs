import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
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
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-artifact-surface-'));
const projectRoot = path.join(dataRoot, 'project');
const evidenceRoot = path.join(root, 'artifacts', 'artifact-working-surface');
const output = [];
let child;

const wait = (cdp, expression, timeout = 30_000) => waitForExpression(cdp, expression, { timeoutMs: timeout, output });
const click = (cdp, selector) => cdp.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);

async function pollValue(cdp, expression, predicate, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await cdp.eval(expression);
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`poll timeout: ${expression}\n${output.join('')}`);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function fixturePng(width = 320, height = 180) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 3;
      const accent = x > 28 && x < width - 28 && y > 28 && y < height - 28;
      row[offset] = accent ? 65 : 239;
      row[offset + 1] = accent ? 111 + Math.floor((x / width) * 80) : 244;
      row[offset + 2] = accent ? 210 : 252;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function setComposer(cdp, value) {
  await cdp.eval(`(()=>{const input=document.querySelector('[data-testid="conversation-composer"] textarea');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}

async function sendFixture(cdp, conversationId, task) {
  const prior = await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(conversationId)}}).then((runs)=>runs[0]?.id??null)`);
  await setComposer(cdp, task);
  await click(cdp, '[data-testid="send-message"]');
  const runId = await pollValue(
    cdp,
    `window.fielora.agent.list({conversation_id:${JSON.stringify(conversationId)}}).then((runs)=>runs[0]?.id??null)`,
    (value) => Boolean(value && value !== prior),
  );
  const terminal = await pollValue(
    cdp,
    `window.fielora.agent.get({run_id:${JSON.stringify(runId)}}).then((run)=>run.status)`,
    (value) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(value),
    120_000,
  );
  if (terminal !== 'COMPLETED') {
    const diagnostic = await cdp.eval(`Promise.all([window.fielora.agent.get({run_id:${JSON.stringify(runId)}}),window.fielora.agent.toolCalls({run_id:${JSON.stringify(runId)}}),window.fielora.agent.events({run_id:${JSON.stringify(runId)},after_sequence:null,limit:200})])`);
    throw new Error(`fixture run ended as ${terminal}: ${JSON.stringify(diagnostic)}`);
  }
  return runId;
}

async function activateArtifact(cdp, artifactId, surfaceTestId) {
  const tabId = `artifact:${artifactId}`;
  await click(cdp, `[data-tab-id="${tabId}"] .right-dock-tab-main`);
  await wait(cdp, `document.querySelector('[data-testid=${JSON.stringify(surfaceTestId)}]')`);
}

try {
  await Promise.all([mkdir(projectRoot, { recursive: true }), mkdir(evidenceRoot, { recursive: true })]);
  await Promise.all([
    writeFile(path.join(projectRoot, 'artifact-working-surface.png'), fixturePng()),
    writeFile(path.join(projectRoot, 'artifact-working-surface.verify.cjs'), "process.stdout.write('artifact working surface fixture: PASS\\n');\n"),
  ]);
  const launched = await launchElectron({ root, dataRoot, output });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`, 60_000);
  await cdp.eval(`window.fieloraTest.resizeWindow({width:1600,height:1000})`);

  const setup = await cdp.eval(`(async()=>{
    const provider=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'Artifact Surface Fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture_artifact_surface__',custom_endpoint_acknowledged:true});
    await window.fielora.provider.storeCredential({provider_config_id:provider.id,secret:'artifact-surface-fixture-secret'});
    const project=await window.fieloraTest.createProject({title:'Artifact Surface Project',goal:null,root_path:${JSON.stringify(projectRoot)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'Artifact Working Surface Gate',provider_config_id:provider.id,model_id:'__fielora_agent_fixture_artifact_surface__'});
    localStorage.setItem('fielora:project-workspace-width','780');
    localStorage.setItem('fielora:conversation-permission:'+conversation.id,'FULL_CONTROL');
    return{providerId:provider.id,fieldId:project.field_id,conversationId:conversation.id};
  })()`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`, 60_000);

  const setupRunId = await sendFixture(cdp, setup.conversationId, '请创建四种可持久工作对象并在右侧展示。 FIELORA_AGENT_FIXTURE_ARTIFACT_SURFACE_SETUP');
  const setupRun = await cdp.eval(`window.fielora.agent.get({run_id:${JSON.stringify(setupRunId)}})`);
  const artifacts = await cdp.eval(`window.fielora.artifact.list({cursor:null,limit:20,include_archived:true}).then((page)=>page.artifacts)`);
  const createTools = await cdp.eval(`window.fielora.agent.toolCalls({run_id:${JSON.stringify(setupRunId)}})`);
  assert.equal(artifacts.length, 4, JSON.stringify({ setupRun, tools: createTools.map((tool) => ({ name: tool.name, status: tool.status, error_code: tool.error_code, receipt: tool.receipt })) }));
  const byTitle = Object.fromEntries(artifacts.map((artifact) => [artifact.title, artifact]));
  const documentArtifact = byTitle['Artifact 工作面验证文档'];
  const presentationArtifact = byTitle['Artifact 工作面演示'];
  const diagramArtifact = byTitle['Artifact 能力关系图'];
  const spreadsheetArtifact = byTitle['季度销售数据'];
  assert.ok(documentArtifact && presentationArtifact && diagramArtifact && spreadsheetArtifact);
  await wait(cdp, `document.querySelectorAll('.right-dock-tab[data-tab-id^="artifact:"]').length===4`);
  assert.equal(await cdp.eval(`document.querySelectorAll('[data-tab-id="artifact:${documentArtifact.artifact_id}"]').length`), 1);
  assert.equal(createTools.filter((tool) => tool.name === 'artifact.create' && tool.status === 'COMPLETED').length, 4);
  assert.equal(createTools.some((tool) => tool.name === 'artifact.preview' || tool.name === 'artifact.open'), false);

  await activateArtifact(cdp, documentArtifact.artifact_id, 'artifact-document-surface');
  await wait(cdp, `document.querySelector('[data-testid="document-spreadsheet-range"]')&&document.querySelector('[data-testid^="artifact-asset-"]')?.complete`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="artifact-document-surface"]').innerText.includes('精确引用 · R1')`), true);
  await captureScreenshot(cdp, path.join(evidenceRoot, '01-document-surface.png'));

  await activateArtifact(cdp, presentationArtifact.artifact_id, 'artifact-presentation-surface');
  await click(cdp, '[data-testid="artifact-slide-2"]');
  await wait(cdp, `document.querySelector('[data-testid^="artifact-asset-"]')?.complete`);
  await click(cdp, '[data-testid="artifact-slide-1"]');
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="artifact-active-slide"]').innerText.includes('受控产品路径')`), true);
  await captureScreenshot(cdp, path.join(evidenceRoot, '02-presentation-surface.png'));

  await activateArtifact(cdp, diagramArtifact.artifact_id, 'artifact-diagram-surface');
  await wait(cdp, `(()=>{const image=document.querySelector('[data-testid="artifact-diagram-surface"] img');return image?.complete&&image.naturalWidth>0&&image.src.startsWith('data:image/svg+xml;base64,')})()`);
  const diagramRead = await cdp.eval(`window.fielora.artifact.read({artifact_id:${JSON.stringify(diagramArtifact.artifact_id)},revision_id:null})`);
  const diagramPreview = await cdp.eval(`window.fielora.artifact.previewDiagram({artifact_id:${JSON.stringify(diagramArtifact.artifact_id)},revision_id:${JSON.stringify(diagramRead.revision.revision_id)}})`);
  const svg = Buffer.from(diagramPreview.data_url.split(',')[1], 'base64').toString('utf8');
  assert.equal(/<script|foreignObject|file:|(?:xlink:)?href=["']https?:/i.test(svg), false);
  await captureScreenshot(cdp, path.join(evidenceRoot, '03-diagram-surface.png'));

  await activateArtifact(cdp, spreadsheetArtifact.artifact_id, 'artifact-spreadsheet-surface');
  assert.equal(await cdp.eval(`document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-spreadsheet-grid"]').dataset.renderedCells`), '200');
  await click(cdp, '[data-testid="artifact-sheet-status"]');
  assert.equal(await cdp.eval(`document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-spreadsheet-grid"]').innerText.includes('TRUE')`), true);
  await click(cdp, '[data-testid="artifact-sheet-summary"]');
  await captureScreenshot(cdp, path.join(evidenceRoot, '04-spreadsheet-surface.png'));

  await activateArtifact(cdp, documentArtifact.artifact_id, 'artifact-document-surface');
  const updateRun2 = await sendFixture(cdp, setup.conversationId, '继续修改当前文档。 FIELORA_AGENT_FIXTURE_ARTIFACT_SURFACE_UPDATE R2');
  try {
    await wait(cdp, `document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-work-surface"]')?.innerText.includes('R2')`, 10_000);
  } catch {
    const diagnostic = await cdp.eval(`Promise.all([
      window.fielora.artifact.read({artifact_id:${JSON.stringify(documentArtifact.artifact_id)},revision_id:null}),
      window.fielora.agent.toolCalls({run_id:${JSON.stringify(updateRun2)}}),
      Promise.resolve({surface:document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-work-surface"]')?.innerText??null,tabs:[...document.querySelectorAll('.right-dock-tab')].map((tab)=>({id:tab.dataset.tabId,active:tab.classList.contains('active')}))})
    ])`);
    throw new Error(`R2 surface refresh failed: ${JSON.stringify(diagnostic)}`);
  }
  const updateRun3 = await sendFixture(cdp, setup.conversationId, '再补充一版当前文档。 FIELORA_AGENT_FIXTURE_ARTIFACT_SURFACE_UPDATE R3');
  await wait(cdp, `document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-work-surface"]')?.innerText.includes('R3')`);
  await click(cdp, '.right-dock-view:not([hidden]) [data-testid="artifact-revision-1"]');
  await wait(cdp, `document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-work-surface"]')?.dataset.viewMode==='HISTORICAL'`);
  const updateRun4 = await sendFixture(cdp, setup.conversationId, '基于当前选中的历史版本创建新版本。 FIELORA_AGENT_FIXTURE_ARTIFACT_SURFACE_UPDATE R4 FROM HISTORICAL');
  await wait(cdp, `document.querySelector('.right-dock-view:not([hidden]) .artifact-version-banner')?.innerText.includes('存在更新版本')`);
  assert.equal(await cdp.eval(`document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-work-surface"]').innerText.includes('正在查看固定历史版本 R1')`), true);

  const run4Events = await cdp.eval(`window.fielora.agent.events({run_id:${JSON.stringify(updateRun4)},after_sequence:null,limit:200})`);
  const runCreated = run4Events.find((event) => event.kind === 'RUN_CREATED');
  const compiled = run4Events.find((event) => event.kind === 'CONTEXT_COMPILED');
  assert.deepEqual(runCreated.payload.active_work_surface, {
    artifact_id: documentArtifact.artifact_id,
    artifact_type: 'DOCUMENT',
    viewed_revision_id: runCreated.payload.active_work_surface.viewed_revision_id,
    current_revision_id: runCreated.payload.active_work_surface.current_revision_id,
    view_mode: 'HISTORICAL',
    archived: false,
    selected_slide: null,
    selected_sheet_id: null,
  });
  assert.notEqual(runCreated.payload.active_work_surface.viewed_revision_id, runCreated.payload.active_work_surface.current_revision_id);
  assert.equal(compiled.payload.active_work_surface_present, true);
  const boundedContext = JSON.stringify(runCreated.payload.active_work_surface);
  assert.equal(/data:image|blocks|slides|sheets|semantic_sha256|blob|\\\\|:\//i.test(boundedContext), false);
  for (const runId of [updateRun2, updateRun3]) {
    const events = await cdp.eval(`window.fielora.agent.events({run_id:${JSON.stringify(runId)},after_sequence:null,limit:50})`);
    assert.equal(events.find((event) => event.kind === 'RUN_CREATED').payload.active_work_surface.view_mode, 'CURRENT');
  }
  await click(cdp, '.right-dock-view:not([hidden]) [data-testid="artifact-return-current"]');
  await wait(cdp, `document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-work-surface"]')?.dataset.viewMode==='CURRENT'&&document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-work-surface"]').innerText.includes('R4')`);

  await activateArtifact(cdp, presentationArtifact.artifact_id, 'artifact-presentation-surface');
  const presentationContextRun = await sendFixture(cdp, setup.conversationId, '只确认当前工作对象上下文。 FIELORA_AGENT_FIXTURE_ARTIFACT_SURFACE_CONTEXT_ONLY');
  const presentationContextEvents = await cdp.eval(`window.fielora.agent.events({run_id:${JSON.stringify(presentationContextRun)},after_sequence:null,limit:50})`);
  assert.equal(presentationContextEvents.find((event) => event.kind === 'RUN_CREATED').payload.active_work_surface.artifact_id, presentationArtifact.artifact_id);
  assert.equal(presentationContextEvents.find((event) => event.kind === 'RUN_CREATED').payload.active_work_surface.artifact_type, 'PRESENTATION');

  await activateArtifact(cdp, spreadsheetArtifact.artifact_id, 'artifact-spreadsheet-surface');
  const spreadsheetContextRun = await sendFixture(cdp, setup.conversationId, '切换工作对象后再确认上下文。 FIELORA_AGENT_FIXTURE_ARTIFACT_SURFACE_CONTEXT_ONLY');
  const spreadsheetContextEvents = await cdp.eval(`window.fielora.agent.events({run_id:${JSON.stringify(spreadsheetContextRun)},after_sequence:null,limit:50})`);
  const spreadsheetContext = spreadsheetContextEvents.find((event) => event.kind === 'RUN_CREATED').payload.active_work_surface;
  assert.equal(spreadsheetContext.artifact_id, spreadsheetArtifact.artifact_id);
  assert.equal(spreadsheetContext.artifact_type, 'SPREADSHEET');
  assert.equal(spreadsheetContext.selected_sheet_id, 'summary');
  assert.equal(JSON.stringify(spreadsheetContext).includes(presentationArtifact.artifact_id), false);

  for (const artifact of [documentArtifact, presentationArtifact, diagramArtifact, spreadsheetArtifact]) {
    await click(cdp, `[data-testid="right-dock-close-artifact:${artifact.artifact_id}"]`);
    await wait(cdp, `!document.querySelector('[data-tab-id="artifact:${artifact.artifact_id}"]')`);
  }
  const emptyContextRun = await sendFixture(cdp, setup.conversationId, '关闭工作对象后确认上下文为空。 FIELORA_AGENT_FIXTURE_ARTIFACT_SURFACE_CONTEXT_ONLY');
  const emptyContextEvents = await cdp.eval(`window.fielora.agent.events({run_id:${JSON.stringify(emptyContextRun)},after_sequence:null,limit:50})`);
  assert.equal(emptyContextEvents.find((event) => event.kind === 'RUN_CREATED').payload.active_work_surface, null);

  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'p',ctrlKey:true,bubbles:true}))`);
  await wait(cdp, `document.querySelector('[data-tab-id="files"]')`);
  await click(cdp, '[data-testid="right-dock-add"]');
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tool-menu"]')`);
  await cdp.eval(`(()=>{const menu=document.querySelector('[data-testid="right-dock-tool-menu"]');[...menu.querySelectorAll('button')].find((button)=>button.innerText.includes('工作对象')).click();})()`);
  await wait(cdp, `document.querySelector('[data-testid="artifact-catalog"]')`);
  await click(cdp, `[data-testid="artifact-list-${documentArtifact.artifact_id}"]`);
  await wait(cdp, `document.querySelector('[data-testid="artifact-document-surface"]')`);

  const documentRead = await cdp.eval(`window.fielora.artifact.read({artifact_id:${JSON.stringify(documentArtifact.artifact_id)},revision_id:null})`);
  const inlineAsset = documentRead.revision.content.content.blocks.find((block) => block.kind === 'INLINE_IMAGE').source;
  const preview = await cdp.eval(`window.fielora.artifact.previewAsset({asset_id:${JSON.stringify(inlineAsset.asset_id)},expected_content_sha256:${JSON.stringify(inlineAsset.content_sha256)}})`);
  assert.equal(preview.data_url.startsWith('data:image/png;base64,'), true);
  assert.equal(JSON.stringify(preview).includes(projectRoot), false);
  assert.equal(await cdp.eval(`window.fielora.artifact.previewAsset({asset_id:${JSON.stringify(inlineAsset.asset_id)},expected_content_sha256:${JSON.stringify('0'.repeat(64))}}).then(()=>false,()=>true)`), true);

  await click(cdp, '.right-dock-view:not([hidden]) [data-testid="artifact-archive-toggle"]');
  await wait(cdp, `document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-work-surface"]')?.innerText.includes('已归档')`);
  const defaultAfterArchive = await cdp.eval(`window.fielora.artifact.list({cursor:null,limit:20,include_archived:false}).then((page)=>page.artifacts)`);
  assert.equal(defaultAfterArchive.some((artifact) => artifact.artifact_id === documentArtifact.artifact_id), false);
  const archivedHistory = await cdp.eval(`window.fielora.artifact.history({artifact_id:${JSON.stringify(documentArtifact.artifact_id)},before_sequence:null,limit:20})`);
  assert.equal(archivedHistory.revisions.length, 4);
  await click(cdp, '.right-dock-view:not([hidden]) [data-testid="artifact-archive-toggle"]');
  await wait(cdp, `!document.querySelector('.right-dock-view:not([hidden]) [data-testid="artifact-work-surface"]')?.innerText.includes('已归档')`);

  await click(cdp, `[data-testid="right-dock-close-artifact:${documentArtifact.artifact_id}"]`);
  await wait(cdp, `!document.querySelector('[data-tab-id="artifact:${documentArtifact.artifact_id}"]')`);
  await click(cdp, '[data-testid="right-dock-add"]');
  await cdp.eval(`(()=>{const menu=document.querySelector('[data-testid="right-dock-tool-menu"]');[...menu.querySelectorAll('button')].find((button)=>button.innerText.includes('工作对象')).click();})()`);
  await wait(cdp, `document.querySelector('[data-testid="artifact-catalog"]')`);
  await click(cdp, `[data-testid="artifact-list-${documentArtifact.artifact_id}"]`);
  await wait(cdp, `document.querySelector('[data-testid="artifact-document-surface"]')`);

  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`, 60_000);
  assert.equal(await cdp.eval(`document.querySelectorAll('.right-dock-tab[data-tab-id^="artifact:"]').length`), 0);
  await cdp.eval(`(()=>{const event=new KeyboardEvent('keydown',{key:'p',ctrlKey:true,bubbles:true});window.dispatchEvent(event)})()`);
  await click(cdp, '[data-testid="right-dock-add"]');
  await cdp.eval(`(()=>{const menu=document.querySelector('[data-testid="right-dock-tool-menu"]');[...menu.querySelectorAll('button')].find((button)=>button.innerText.includes('工作对象')).click();})()`);
  await wait(cdp, `document.querySelector('[data-testid="artifact-list-${documentArtifact.artifact_id}"]')`);
  await click(cdp, `[data-testid="artifact-list-${documentArtifact.artifact_id}"]`);
  await wait(cdp, `document.querySelector('[data-testid="artifact-document-surface"]')`);

  await cdp.eval(`window.fielora.provider.remove({provider_config_id:${JSON.stringify(setup.providerId)}})`);
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log('artifact working surface e2e: PASS');
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
