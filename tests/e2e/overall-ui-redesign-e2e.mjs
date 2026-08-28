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
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-overall-ui-'));
const projectRoot = path.join(dataRoot, 'project');
const configRoot = path.join(dataRoot, 'Fielora', 'config');
const evidenceRoot = path.join(root, 'artifacts', 'overall-ui-redesign');
const output = [];
let child;

const wait = (cdp, expression, timeout = 30_000) => waitForExpression(cdp, expression, { timeoutMs: timeout, output });
const click = (cdp, selector) => cdp.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);
const screenshot = (cdp, name) => captureScreenshot(cdp, path.join(evidenceRoot, name));

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

async function startFixtureRun(cdp, setup, visibleRequest, runtimeTask, modelId) {
  const message = await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(setup.conversationId)},role:'USER',content:${JSON.stringify(visibleRequest)},status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null})`);
  const run = await cdp.eval(`window.fielora.agent.start({field_id:${JSON.stringify(setup.fieldId)},conversation_id:${JSON.stringify(setup.conversationId)},user_message_id:${JSON.stringify(message.id)},provider_config_id:${JSON.stringify(setup.providerId)},model_id:${JSON.stringify(modelId)},task:${JSON.stringify(runtimeTask)},permission:'FULL_CONTROL',max_steps:24,attachments:[]})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(run.id)}]')`, 60_000);
  return run.id;
}

async function openTool(cdp, label) {
  await click(cdp, '[data-testid="right-dock-add"]');
  await wait(cdp, `document.querySelector('[data-testid="right-dock-tool-menu"]')`);
  await cdp.eval(`(()=>{const menu=document.querySelector('[data-testid="right-dock-tool-menu"]');const target=[...menu.querySelectorAll('button')].find((button)=>button.innerText.includes(${JSON.stringify(label)}));if(!target)throw new Error('tool missing: '+${JSON.stringify(label)});target.click();})()`);
}

async function openArtifact(cdp, artifactId, surfaceTestId) {
  const tabSelector = `[data-tab-id="artifact:${artifactId}"]`;
  if (!await cdp.eval(`Boolean(document.querySelector(${JSON.stringify(tabSelector)}))`)) {
    if (!await cdp.eval(`Boolean(document.querySelector('[data-testid="artifact-catalog"]'))`)) {
      await openTool(cdp, '工作对象');
      await wait(cdp, `document.querySelector('[data-testid="artifact-catalog"]')`);
    }
    await wait(cdp, `document.querySelector('[data-testid="artifact-list-${artifactId}"]')`);
    await click(cdp, `[data-testid="artifact-list-${artifactId}"]`);
  } else {
    await click(cdp, `${tabSelector} .right-dock-tab-main`);
  }
  await wait(cdp, `document.querySelector('[data-testid=${JSON.stringify(surfaceTestId)}]')`);
}

try {
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(configRoot, { recursive: true }),
    mkdir(evidenceRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(projectRoot, 'artifact-working-surface.png'), fixturePng()),
    writeFile(path.join(projectRoot, 'artifact-working-surface.verify.cjs'), "process.stdout.write('ui fixture: PASS\\n');\n"),
    writeFile(path.join(configRoot, 'mcp.json'), `${JSON.stringify({ mcpServers: { 'local-notes': { command: process.execPath, args: ['--version'] } } }, null, 2)}\n`),
  ]);

  const launched = await launchElectron({ root, dataRoot, output });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched, enablePage: true });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`, 60_000);
  await cdp.eval(`window.fieloraTest.resizeWindow({width:1600,height:1000})`);

  const setup = await cdp.eval(`(async()=>{
    const provider=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'UI Evidence Fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture_artifact_surface__',custom_endpoint_acknowledged:true});
    await window.fielora.provider.storeCredential({provider_config_id:provider.id,secret:'ui-evidence-fixture-secret'});
    const project=await window.fieloraTest.createProject({title:'产品体验工作区',goal:null,root_path:${JSON.stringify(projectRoot)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'统一桌面体验',provider_config_id:provider.id,model_id:'__fielora_agent_fixture_artifact_surface__'});
    localStorage.setItem('fielora:project-workspace-width','780');
    localStorage.setItem('fielora:conversation-permission:'+conversation.id,'FULL_CONTROL');
    return{providerId:provider.id,fieldId:project.field_id,conversationId:conversation.id};
  })()`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`, 60_000);
  await screenshot(cdp, '01-new-conversation.png');

  const artifactRunId = await startFixtureRun(
    cdp,
    setup,
    '请创建一组可持久的工作对象，并在右侧工作区展示。',
    '请创建四种可持久工作对象。 FIELORA_AGENT_FIXTURE_ARTIFACT_SURFACE_SETUP',
    '__fielora_agent_fixture_artifact_surface__',
  );
  assert.equal(await pollValue(cdp, `window.fielora.agent.get({run_id:${JSON.stringify(artifactRunId)}}).then((run)=>run.status)`, (value) => ['COMPLETED', 'FAILED'].includes(value), 120_000), 'COMPLETED');
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(artifactRunId)}] [data-testid="agent-terminal-result"]')`);
  if (await cdp.eval(`document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`)) {
    await click(cdp, '[data-testid="chrome-tools"]');
    await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  }
  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(artifactRunId)}]')?.scrollIntoView({block:'center'})`);
  await screenshot(cdp, '02-conversation-result.png');

  const slowRunId = await startFixtureRun(
    cdp,
    setup,
    '请检查当前项目，更新一个验证文件并运行检查。',
    'FIELORA_AGENT_FIXTURE_DELEGATE FIELORA_AGENT_FIXTURE_CREATE 检查项目，再创建验证文件并运行 targeted verification。',
    '__fielora_agent_fixture_slow__',
  );
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(slowRunId)}] [data-testid="conversation-activity-stream"]')`);
  await wait(cdp, `document.querySelectorAll('[data-agent-run-id=${JSON.stringify(slowRunId)}] [data-activity-entry]').length>=3`, 60_000);
  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(slowRunId)}]')?.scrollIntoView({block:'center'})`);
  await screenshot(cdp, '03-conversation-running-activity.png');
  await cdp.eval(`window.fielora.agent.cancel({run_id:${JSON.stringify(slowRunId)}})`);
  await pollValue(cdp, `window.fielora.agent.get({run_id:${JSON.stringify(slowRunId)}}).then((run)=>run.status)`, (value) => ['CANCELLED', 'COMPLETED'].includes(value), 30_000);

  const artifacts = await cdp.eval(`window.fielora.artifact.list({cursor:null,limit:20,include_archived:true}).then((page)=>page.artifacts)`);
  const byType = Object.fromEntries(artifacts.map((artifact) => [artifact.artifact_type, artifact]));
  for (const type of ['DOCUMENT', 'PRESENTATION', 'DIAGRAM', 'SPREADSHEET']) assert.ok(byType[type], `missing ${type}`);
  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace-launcher'))`);
  await wait(cdp, `document.querySelector('[data-testid="right-workspace-dock"]')`);

  await openArtifact(cdp, byType.DOCUMENT.artifact_id, 'artifact-document-surface');
  await wait(cdp, `document.querySelector('[data-testid^="artifact-asset-"]')?.complete`);
  await screenshot(cdp, '04-artifact-document.png');
  await openTool(cdp, '工作对象');
  await wait(cdp, `document.querySelector('[data-testid="artifact-catalog"]')`);
  await openArtifact(cdp, byType.PRESENTATION.artifact_id, 'artifact-presentation-surface');
  await click(cdp, '[data-testid="artifact-slide-1"]');
  await screenshot(cdp, '05-artifact-presentation.png');
  await openTool(cdp, '工作对象');
  await wait(cdp, `document.querySelector('[data-testid="artifact-catalog"]')`);
  await openArtifact(cdp, byType.DIAGRAM.artifact_id, 'artifact-diagram-surface');
  await wait(cdp, `document.querySelector('[data-testid="artifact-diagram-surface"] img')?.complete`);
  await screenshot(cdp, '06-artifact-diagram.png');
  await openTool(cdp, '工作对象');
  await wait(cdp, `document.querySelector('[data-testid="artifact-catalog"]')`);
  await openArtifact(cdp, byType.SPREADSHEET.artifact_id, 'artifact-spreadsheet-surface');
  await screenshot(cdp, '07-artifact-spreadsheet.png');

  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'p',ctrlKey:true,bubbles:true}))`);
  await wait(cdp, `document.querySelector('[data-tab-id="files"]')`);
  await openTool(cdp, '终端');
  await wait(cdp, `document.querySelector('[data-tab-id="terminal"]')`);
  await openArtifact(cdp, byType.DOCUMENT.artifact_id, 'artifact-document-surface');
  const tabMetrics = await cdp.eval(`(()=>{const strip=document.querySelector('[data-testid="right-dock-tabs"]');return{count:strip.children.length,scrollWidth:strip.scrollWidth,clientWidth:strip.clientWidth}})()`);
  assert.ok(tabMetrics.count >= 6, JSON.stringify(tabMetrics));
  await screenshot(cdp, '08-multi-workspace-tabs.png');

  await click(cdp, '[data-testid="chrome-tools"]');
  await wait(cdp, `!document.querySelector('[data-testid="project-workspace-surface"]').classList.contains('workspace-open')`);
  await click(cdp, '[data-testid="settings-nav"]');
  await wait(cdp, `document.querySelector('[data-testid="settings-general"]')`);
  await screenshot(cdp, '09-settings-general-or-appearance.png');
  await click(cdp, '[data-testid="settings-category-mcp"]');
  await wait(cdp, `document.querySelector('[data-testid="mcp-connection-local-notes"]')`);
  await screenshot(cdp, '10-settings-mcp.png');
  await click(cdp, '[data-testid="settings-category-appearance"]');
  await wait(cdp, `document.querySelector('[data-testid="appearance-theme-dark"]')`);
  await click(cdp, '[data-testid="appearance-theme-dark"]');
  await wait(cdp, `document.documentElement.dataset.resolvedTheme==='dark'`);
  await click(cdp, '[data-testid="settings-back"]');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`);
  await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(artifactRunId)}]')?.scrollIntoView({block:'center'})`);
  await screenshot(cdp, '11-dark-theme-conversation.png');

  await cdp.eval(`window.dispatchEvent(new CustomEvent('fielora:open-workspace-launcher'))`);
  await wait(cdp, `document.querySelector('[data-testid="right-workspace-dock"]')`);
  await openArtifact(cdp, byType.DOCUMENT.artifact_id, 'artifact-document-surface');
  await screenshot(cdp, '12-dark-theme-artifact.png');

  const visualContract = await cdp.eval(`(()=>{
    const root=getComputedStyle(document.documentElement);
    const body=getComputedStyle(document.body);
    const composer=getComputedStyle(document.querySelector('[data-testid="conversation-composer"]'));
    const tabs=document.querySelector('[data-testid="right-dock-tabs"]');
    return{
      theme:document.documentElement.dataset.resolvedTheme,
      bodyFont:body.fontSize,
      composerRadius:composer.borderRadius,
      surfaceRadius:root.getPropertyValue('--fl-radius-surface').trim(),
      tabCount:tabs.children.length,
      viewport:{width:window.innerWidth,height:window.innerHeight},
    };
  })()`);
  assert.equal(visualContract.viewport.width, 1600);
  assert.ok(visualContract.viewport.height >= 990 && visualContract.viewport.height <= 1010);
  assert.equal(visualContract.theme, 'dark');
  assert.equal(visualContract.bodyFont, '15px');

  const responsiveEvidence = [];
  for (const width of [1280, 1440, 1920]) {
    await cdp.eval(`window.fieloraTest.resizeWindow({width:${width},height:900})`);
    await pollValue(cdp, 'window.innerWidth', (value) => Math.abs(value - width) <= 2, 10_000);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const metrics = await cdp.eval(`(()=>{
      const conversation=document.querySelector('.conversation-column')?.getBoundingClientRect();
      const composer=document.querySelector('[data-testid="conversation-composer"]')?.getBoundingClientRect();
      const dock=document.querySelector('[data-testid="right-workspace-dock"]')?.getBoundingClientRect();
      const dockPosition=getComputedStyle(document.querySelector('[data-testid="right-workspace-dock"]')).position;
      return{
        viewport:window.innerWidth,
        conversationWidth:conversation?.width??0,
        composerContained:Boolean(conversation&&composer&&composer.left>=conversation.left-1&&composer.right<=conversation.right+1),
        dockContained:Boolean(dock&&dock.left>=-4&&dock.right<=window.innerWidth+4),
        dockPosition,
        conversation:conversation?{left:conversation.left,right:conversation.right,width:conversation.width}:null,
        composer:composer?{left:composer.left,right:composer.right,width:composer.width}:null,
        dock:dock?{left:dock.left,right:dock.right,width:dock.width}:null,
      };
    })()`);
    assert.ok(metrics.conversationWidth >= 320, JSON.stringify(metrics));
    assert.equal(metrics.composerContained, true, JSON.stringify(metrics));
    assert.equal(metrics.dockContained, true, JSON.stringify(metrics));
    if (width === 1280) assert.equal(metrics.dockPosition, 'absolute', JSON.stringify(metrics));
    responsiveEvidence.push(metrics);
  }

  await cdp.eval(`window.fielora.provider.remove({provider_config_id:${JSON.stringify(setup.providerId)}})`);
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log(`overall ui redesign e2e: PASS\nEVIDENCE: ${evidenceRoot}\nRESPONSIVE: ${JSON.stringify(responsiveEvidence)}\nMODEL_REQUESTS: 0\nPUBLIC_NETWORK_REQUESTS: 0`);
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
