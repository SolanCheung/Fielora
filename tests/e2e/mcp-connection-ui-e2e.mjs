import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  cleanupElectronProcess,
  connectToFieloraApp,
  launchElectron,
  waitForChildExit,
  waitForExpression,
} from './harness/electron-cdp-harness.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-mcp-ui-'));
const projectRoot = path.join(dataRoot, 'project');
const configDirectory = path.join(dataRoot, 'Fielora', 'config');
const configPath = path.join(configDirectory, 'mcp.json');
const fixturePath = path.join(root, 'target', 'debug', 'fielora-mcp-fixture.exe');
const pidPath = path.join(dataRoot, 'mcp-ui.pid');
const missingPath = path.join(dataRoot, 'missing-mcp-server.exe');
const output = [];
let child;

const wait = (cdp, expression, timeout = 20_000) => waitForExpression(cdp, expression, { timeoutMs: timeout, output });
const processExists = (pid) => spawnSync('tasklist.exe', ['/fi', `PID eq ${pid}`, '/fo', 'csv', '/nh'], { windowsHide: true, encoding: 'utf8' }).stdout.includes(`"${pid}"`);
const click = (cdp, selector) => cdp.eval(`document.querySelector(${JSON.stringify(selector)}).click()`);

async function writeConnection(command = fixturePath) {
  await mkdir(configDirectory, { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ mcpServers: { 'fixture-ui': { command, args: ['unknown-readonly-hint', pidPath] } } }, null, 2)}\n`);
}

async function startRun(cdp, setup, suffix) {
  const message = await cdp.eval(`window.fielora.conversation.createMessage({conversation_id:${JSON.stringify(setup.conversationId)},role:'USER',content:${JSON.stringify(`MCP UI ${suffix}`)},status:'COMPLETED',provider_config_id:null,model_id:null,invocation_id:null})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`);
  const run = await cdp.eval(`window.fielora.agent.start({field_id:${JSON.stringify(setup.fieldId)},conversation_id:${JSON.stringify(setup.conversationId)},user_message_id:${JSON.stringify(message.id)},provider_config_id:${JSON.stringify(setup.providerId)},model_id:'__fielora_agent_fixture_slow__',task:${JSON.stringify(`Keep this ${suffix} Run actionable for MCP UI activation.`)},permission:'READ_ONLY',max_steps:4,attachments:[]})`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`);
  return run;
}

async function openRunMcp(cdp, runId) {
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(runId)}] [data-testid="agent-progress-summary"]')`, 20_000);
  await click(cdp, `[data-agent-run-id="${runId}"] [data-testid="agent-progress-summary"]`);
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(runId)}] [data-testid="agent-run-mcp"]')`);
}

async function requestActivation(cdp, runId) {
  await openRunMcp(cdp, runId);
  await click(cdp, `[data-agent-run-id="${runId}"] [data-testid="mcp-activate-fixture-ui"]`);
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(runId)}] [data-testid="agent-approval"]')`);
  assert.equal(await access(pidPath).then(() => true, () => false), false, 'MCP process started before approval');
  assert.equal(await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(runId)}] [data-testid="agent-approval"]')?.innerText.includes('Start local MCP Server “fixture-ui” for this Run')`), true);
}

try {
  await Promise.all([mkdir(projectRoot, { recursive: true }), mkdir(configDirectory, { recursive: true })]);
  await access(fixturePath);
  const launched = await launchElectron({ root, dataRoot, output });
  child = launched.child;
  const cdp = await connectToFieloraApp({ ...launched });
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`);

  // Passive Settings and refresh: missing -> malformed -> valid. None may
  // resolve or start the configured executable.
  await click(cdp, '[data-testid="settings-nav"]');
  await wait(cdp, `document.querySelector('[data-testid="settings-screen"]')`);
  await click(cdp, '[data-testid="settings-category-mcp"]');
  await wait(cdp, `document.querySelector('[data-testid="mcp-config-not-found"]')`);
  assert.equal(await access(pidPath).then(() => true, () => false), false);
  await writeFile(configPath, '{ malformed');
  await click(cdp, '[data-testid="mcp-refresh"]');
  await wait(cdp, `document.querySelector('[data-testid="mcp-config-malformed"]')`);
  assert.equal(await access(pidPath).then(() => true, () => false), false);
  await writeConnection();
  await click(cdp, '[data-testid="mcp-refresh"]');
  await wait(cdp, `document.querySelector('[data-testid="mcp-connection-fixture-ui"]')`);
  assert.equal(await cdp.eval(`document.querySelector('[data-testid="mcp-connection-fixture-ui"]')?.innerText.includes('Local STDIO · 已配置')`), true);
  assert.equal(await access(pidPath).then(() => true, () => false), false);

  const setup = await cdp.eval(`(async()=>{
    const provider=await window.fielora.provider.create({provider_kind:'OPENAI_COMPATIBLE',display_name:'MCP UI Fixture',base_url:'https://example.com/v1',default_model:'__fielora_agent_fixture_slow__',custom_endpoint_acknowledged:true});
    await window.fielora.provider.storeCredential({provider_config_id:provider.id,secret:'mcp-ui-fixture-secret'});
    const project=await window.fieloraTest.createProject({title:'MCP UI Project',goal:null,root_path:${JSON.stringify(projectRoot)}});
    const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:'MCP UI Gate',provider_config_id:provider.id,model_id:'__fielora_agent_fixture_slow__'});
    return{providerId:provider.id,fieldId:project.field_id,conversationId:conversation.id};
  })()`);
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="conversation-${setup.conversationId}"]')`);

  // Approve path: UI proposal -> ordinary PROCESS Approval -> one local
  // process -> runtime-derived Tool count -> Run teardown.
  const approvedRun = await startRun(cdp, setup, 'approved');
  await requestActivation(cdp, approvedRun.id);
  const proposedTools = await cdp.eval(`window.fielora.agent.toolCalls({run_id:${JSON.stringify(approvedRun.id)}})`);
  const proposed = proposedTools.find((tool) => tool.name === 'mcp.activate_connection');
  assert.equal(proposed.effect, 'PROCESS');
  assert.equal(proposed.policy_decision, 'ASK');
  assert.equal(proposed.status, 'WAITING_APPROVAL');
  await click(cdp, `[data-agent-run-id="${approvedRun.id}"] [data-testid="agent-allow-once"]`);
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(approvedRun.id)}] [data-testid="agent-run-mcp-fixture-ui"]')?.dataset.activationState==='ACTIVE_IN_CURRENT_RUN'`, 20_000);
  const pid = Number.parseInt(await readFile(pidPath, 'utf8'), 10);
  assert.equal(processExists(pid), true);
  assert.equal(await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(approvedRun.id)}] [data-testid="agent-run-mcp-fixture-ui"]')?.innerText.includes('1 Tools discovered')`), true);
  assert.equal(await cdp.eval(`document.querySelector('[data-agent-run-id=${JSON.stringify(approvedRun.id)}] [data-testid="agent-run-mcp-fixture-ui"]')?.innerText.includes('unknown Tools → DESTRUCTIVE')`), true);
  const completedTools = await cdp.eval(`window.fielora.agent.toolCalls({run_id:${JSON.stringify(approvedRun.id)}})`);
  const activation = completedTools.find((tool) => tool.name === 'mcp.activate_connection');
  assert.equal(activation.status, 'COMPLETED');
  assert.equal(activation.receipt.kind, 'MCP_CONNECTION_ACTIVATION');
  const durable = JSON.stringify(completedTools);
  assert.equal(durable.includes(fixturePath), false);
  assert.equal(durable.includes(pidPath), false);
  const activationEvents = await cdp.eval(`window.fielora.agent.events({run_id:${JSON.stringify(approvedRun.id)},after_sequence:null,limit:200})`);
  assert.equal(activationEvents.some((event) => event.kind === 'VERIFICATION_RECORDED'), false);
  await click(cdp, '[data-testid="stop-agent"]');
  await wait(cdp, `window.fielora.agent.get({run_id:${JSON.stringify(approvedRun.id)}}).then((run)=>run.status==='CANCELLED')`);
  const endedAt = Date.now();
  while (processExists(pid) && Date.now() - endedAt < 4_000) await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(processExists(pid), false);
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(approvedRun.id)}] [data-testid="agent-execution-detail-toggle"]')`);
  await click(cdp, `[data-agent-run-id="${approvedRun.id}"] [data-testid="agent-execution-detail-toggle"]`);
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(approvedRun.id)}] [data-testid="agent-run-mcp-fixture-ui"]')?.dataset.activationState==='NOT_ACTIVE'`);

  // Deny path never starts a process.
  await rm(pidPath, { force: true });
  const deniedRun = await startRun(cdp, setup, 'denied');
  await requestActivation(cdp, deniedRun.id);
  await cdp.eval(`(()=>{const approval=document.querySelector('[data-agent-run-id=${JSON.stringify(deniedRun.id)}] [data-testid="agent-approval"]');[...approval.querySelectorAll('button')].find((button)=>button.textContent==='拒绝').click();})()`);
  await wait(cdp, `window.fielora.agent.toolCalls({run_id:${JSON.stringify(deniedRun.id)}}).then((tools)=>tools.some((tool)=>tool.name==='mcp.activate_connection'&&tool.status==='DENIED'))`);
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(deniedRun.id)}] [data-testid="agent-run-mcp-fixture-ui"]')?.dataset.activationState==='ACTIVATION_DENIED'`);
  assert.equal(await access(pidPath).then(() => true, () => false), false);
  await cdp.eval(`window.fielora.agent.cancel({run_id:${JSON.stringify(deniedRun.id)}})`);
  await wait(cdp, `window.fielora.agent.get({run_id:${JSON.stringify(deniedRun.id)}}).then((run)=>run.status==='CANCELLED')`);

  // Activation-time executable admission failure is visible and still starts
  // no process. Passive config remains syntactically configured.
  await writeConnection(missingPath);
  const failedRun = await startRun(cdp, setup, 'failed');
  await requestActivation(cdp, failedRun.id);
  await click(cdp, `[data-agent-run-id="${failedRun.id}"] [data-testid="agent-allow-once"]`);
  await wait(cdp, `window.fielora.agent.toolCalls({run_id:${JSON.stringify(failedRun.id)}}).then((tools)=>tools.some((tool)=>tool.name==='mcp.activate_connection'&&tool.status==='FAILED'))`, 20_000);
  const failedTools = await cdp.eval(`window.fielora.agent.toolCalls({run_id:${JSON.stringify(failedRun.id)}})`);
  assert.equal(failedTools.find((tool) => tool.name === 'mcp.activate_connection').error_code, 'EXECUTABLE_NOT_FOUND');
  await wait(cdp, `document.querySelector('[data-agent-run-id=${JSON.stringify(failedRun.id)}] [data-testid="agent-run-mcp-fixture-ui"]')?.dataset.activationState==='ACTIVATION_FAILED'`);
  assert.equal(await access(pidPath).then(() => true, () => false), false);
  await cdp.eval(`window.fielora.agent.cancel({run_id:${JSON.stringify(failedRun.id)}})`);
  await wait(cdp, `window.fielora.agent.get({run_id:${JSON.stringify(failedRun.id)}}).then((run)=>run.status==='CANCELLED')`);

  await cdp.eval(`window.fielora.provider.remove({provider_config_id:${JSON.stringify(setup.providerId)}})`);
  await cdp.eval('void window.fielora.core.quit()');
  cdp.close();
  await waitForChildExit(child);
  console.log('mcp connection ui e2e: PASS');
} finally {
  await cleanupElectronProcess(child);
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
}
