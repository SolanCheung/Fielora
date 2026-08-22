import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  FAST_EDIT_TARGET_FILES,
  FAST_EDIT_TASK,
  createFastEditFixture,
  inspectFastEditFixture,
} from './lib/agent-fast-edit-fixture.mjs';

const root = path.resolve(import.meta.dirname, '..');
const authorization = process.env.FIELORA_CODING_PLAN_INTERACTIVE_TEST;
const desktopMode = process.env.FIELORA_DESKTOP_MODE ?? (process.env.FIELORA_PACKAGED_APP ? 'packaged' : 'dev');
const appPath = process.env.FIELORA_PACKAGED_APP;
const liveCase = process.env.FIELORA_DESKTOP_LIVE_CASE ?? 'READ_ONLY';
const goldenCase = liveCase === 'GOLDEN_EDIT';
const clarificationCase = liveCase === 'CLARIFICATION';
const canonicalDatabase = path.join(process.env.LOCALAPPDATA ?? '', 'Fielora', 'data', 'fielora.db');
const evidenceDirectory = process.env.FIELORA_LIVE_EVIDENCE_DIR
  ?? path.join(root, 'artifacts', 'agent-v0.1', 'qwen', 'live');
const terminalStatuses = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

if (authorization !== 'AUTHORIZED') throw new Error('Set FIELORA_CODING_PLAN_INTERACTIVE_TEST=AUTHORIZED for this explicit live test.');
if (!['dev', 'packaged'].includes(desktopMode)) throw new Error(`Unsupported FIELORA_DESKTOP_MODE: ${desktopMode}`);
if (desktopMode === 'packaged' && !appPath) throw new Error('FIELORA_PACKAGED_APP must point to the packaged Fielora.exe.');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileIdentity(file) {
  try {
    const info = await stat(file);
    const bytes = await readFile(file);
    return { path: file, size: info.size, modified_at: info.mtime.toISOString(), sha256: sha256(bytes) };
  } catch {
    return { path: file, missing: true };
  }
}

async function sourceFingerprint(files) {
  const hash = createHash('sha256');
  for (const relative of [...files].sort()) {
    hash.update(relative);
    try { hash.update(await readFile(path.join(root, relative))); } catch { hash.update('MISSING'); }
  }
  return hash.digest('hex');
}

async function buildProvenance() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const coreSources = [
    'crates/fielora-core/src/agent_runtime.rs',
    'crates/fielora-agent/src/lib.rs',
    'crates/fielora-model/src/lib.rs',
  ];
  const rendererSources = [
    'apps/desktop/src/renderer/ProjectWorkspace.tsx',
    'apps/desktop/src/renderer/AgentActivity.tsx',
    'apps/desktop/src/renderer/agent-presentation.ts',
    'apps/desktop/src/fipc.ts',
  ];
  const packagedRoot = desktopMode === 'packaged' ? path.dirname(appPath) : null;
  const executable = desktopMode === 'packaged'
    ? appPath
    : path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
  const coreBinary = desktopMode === 'packaged'
    ? path.join(packagedRoot, 'resources', 'fielora-core.exe')
    : path.join(root, 'target', 'debug', 'fielora-core.exe');
  const rendererBundle = desktopMode === 'packaged'
    ? path.join(packagedRoot, 'resources', 'app.asar')
    : path.join(root, 'apps', 'desktop', '.webpack', 'renderer', 'main_window', 'index.js');
  return {
    schema_version: 1,
    desktop_mode: desktopMode,
    git_head: head.status === 0 ? head.stdout.trim() : null,
    git_dirty: dirty.status === 0 ? dirty.stdout.trim().length > 0 : null,
    source_fingerprint: await sourceFingerprint([...coreSources, ...rendererSources]),
    agent_core_fingerprint: await sourceFingerprint(coreSources),
    renderer_fingerprint: await sourceFingerprint(rendererSources),
    executable: await fileIdentity(executable),
    core_binary: await fileIdentity(coreBinary),
    renderer_bundle: await fileIdentity(rendererBundle),
    measured_at: new Date().toISOString(),
  };
}

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async open() {
    if (this.socket.readyState !== WebSocket.OPEN) await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const value = JSON.parse(String(event.data));
      const pending = this.pending.get(value.id);
      if (!pending) return;
      this.pending.delete(value.id);
      value.error ? pending.reject(new Error(value.error.message)) : pending.resolve(value.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function connect(port, output) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = targets.find((item) => item.type === 'page'
        && (item.url.startsWith('fielora://app') || item.url.includes('main_window')));
      if (target) {
        const cdp = new Cdp(target.webSocketDebuggerUrl);
        await cdp.open();
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        return cdp;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Electron target timeout\n${output.join('')}`);
}

async function wait(cdp, expression, timeout = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await cdp.eval(`Boolean(${expression})`)) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`wait failed: ${expression}`);
}

function setValue(selector, value) {
  return `(()=>{const element=document.querySelector(${JSON.stringify(selector)});const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value');descriptor.set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`;
}

function payloadDuration(events, kind) {
  return events.filter((event) => event.kind === kind).reduce((sum, event) => sum + Number(event.payload?.duration_ms ?? 0), 0);
}

function summarizePerformance({ durationMs, events, tools, approvals, approvalWaitMs, projection, output }) {
  const modelEvents = events.filter((event) => event.kind === 'MODEL_COMPLETED');
  const contextEvents = events.filter((event) => event.kind === 'CONTEXT_COMPILED');
  const verificationIds = new Set(tools.filter((tool) => tool.name === 'run_command' && tool.receipt?.verification_eligible === true).map((tool) => tool.id));
  const observe = new Set();
  let duplicates = 0;
  for (const tool of tools.filter((item) => item.effect === 'OBSERVE')) {
    const key = `${tool.name}:${JSON.stringify(tool.arguments)}`;
    duplicates += Number(observe.has(key));
    observe.add(key);
  }
  const usage = modelEvents.reduce((total, event) => ({
    input_tokens: total.input_tokens + Number(event.payload?.usage?.input_tokens ?? 0),
    output_tokens: total.output_tokens + Number(event.payload?.usage?.output_tokens ?? 0),
  }), { input_tokens: 0, output_tokens: 0 });
  const fipcMetrics = output.join('').split(/\r?\n/).filter((line) => line.includes('[agent-performance]')).flatMap((line) => {
    try { return [JSON.parse(line.slice(line.indexOf('{')))]; } catch { return []; }
  }).filter((metric) => metric.layer === 'FIPC' && metric.method === 'query.agent.events');
  return {
    total_duration_ms: durationMs,
    context_duration_ms: payloadDuration(events, 'CONTEXT_COMPILED'),
    repository_scan_duration_ms: contextEvents.reduce((sum, event) => sum + Number(event.payload?.repository_index_duration_ms ?? 0), 0),
    repository_index_cache_hits: contextEvents.filter((event) => event.payload?.repository_index_cache_hit === true).length,
    repository_index_invalidated_files: contextEvents.reduce((sum, event) => sum + Number(event.payload?.repository_index_invalidated_files ?? 0), 0),
    context_rebuilds: contextEvents.filter((event) => event.payload?.cache_hit !== true).length,
    context_cache_hits: contextEvents.filter((event) => event.payload?.cache_hit === true).length,
    model_calls: modelEvents.length,
    model_duration_ms: payloadDuration(events, 'MODEL_COMPLETED'),
    first_token_ms: modelEvents.map((event) => event.payload?.first_token_ms ?? null),
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    tool_calls: tools.length,
    tool_duration_ms: payloadDuration(events, 'TOOL_COMPLETED'),
    search_calls: tools.filter((tool) => tool.name === 'search_text').length,
    file_reads: tools.filter((tool) => tool.name === 'read_file').length,
    stat_calls: tools.filter((tool) => tool.name === 'stat_path').length,
    git_calls: tools.filter((tool) => tool.name === 'git_read').length,
    duplicate_observe_calls: duplicates,
    patch_attempts: tools.filter((tool) => tool.name === 'apply_patches').length,
    patch_conflicts: tools.filter((tool) => tool.name === 'apply_patches' && tool.status !== 'COMPLETED').length,
    verification_calls: verificationIds.size,
    verification_duration_ms: events.filter((event) => event.kind === 'TOOL_COMPLETED' && verificationIds.has(event.payload?.tool_call_id)).reduce((sum, event) => sum + Number(event.payload?.duration_ms ?? 0), 0),
    approvals,
    approval_wait_ms: approvalWaitMs,
    durable_event_writes: events.length,
    event_query_count: fipcMetrics.length,
    event_query_duration_ms: fipcMetrics.reduce((sum, metric) => sum + Number(metric.duration_ms ?? 0), 0),
    projection_count: projection.length,
    projection_duration_ms: Math.round(projection.reduce((sum, entry) => sum + Number(entry.duration ?? 0), 0)),
    fipc_event_query_count: fipcMetrics.length,
    fipc_event_query_duration_ms: fipcMetrics.reduce((sum, metric) => sum + Number(metric.duration_ms ?? 0), 0),
  };
}

const testRoot = await mkdtemp(path.join(tmpdir(), 'fielora-qwen-desktop-live-'));
const projectRoot = path.join(testRoot, 'project');
const isolatedLocal = path.join(testRoot, 'local');
const isolatedRoaming = path.join(testRoot, 'roaming');
const isolatedDatabase = path.join(isolatedLocal, 'Fielora', 'data', 'fielora.db');
const output = [];
let child;
let cdp;

try {
  await mkdir(path.dirname(isolatedDatabase), { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  await mkdir(evidenceDirectory, { recursive: true });
  const source = new DatabaseSync(canonicalDatabase, { readOnly: true });
  const snapshot = source.serialize();
  source.close();
  await writeFile(isolatedDatabase, snapshot);
  let beforeHashes = null;
  let beforeHash = null;
  const packageFile = path.join(projectRoot, 'package.json');
  if (goldenCase) beforeHashes = await createFastEditFixture(projectRoot);
  else if (!clarificationCase) {
    await writeFile(packageFile, `${JSON.stringify({ name: 'fielora-qwen-live-desktop', private: true }, null, 2)}\n`);
    beforeHash = sha256(await readFile(packageFile));
  } else beforeHash = sha256(JSON.stringify(await readdir(projectRoot)));

  const provenanceBeforeLaunch = await buildProvenance();
  const port = await freePort();
  const runtimePath = [path.dirname(process.execPath), process.env.Path ?? process.env.PATH ?? '']
    .filter(Boolean)
    .join(path.delimiter);
  const env = {
    ...process.env,
    Path: runtimePath,
    PATH: runtimePath,
    APPDATA: isolatedRoaming,
    LOCALAPPDATA: isolatedLocal,
    FIELORA_E2E: '1',
    FIELORA_E2E_DEBUG_PORT: String(port),
    FIELORA_AGENT_PERFORMANCE_TRACE: '1',
  };
  child = desktopMode === 'packaged'
    ? spawn(appPath, [], { env, cwd: path.dirname(appPath), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn(process.execPath, [path.join(root, 'node_modules', '@electron-forge', 'cli', 'dist', 'electron-forge.js'), 'start'], {
      env, cwd: path.join(root, 'apps', 'desktop'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
  child.stdout.on('data', (chunk) => output.push(String(chunk)));
  child.stderr.on('data', (chunk) => output.push(String(chunk)));
  cdp = await connect(port, output);
  await wait(cdp, `document.querySelector('[data-testid="project-workspace"]')`, 90_000);

  const created = await cdp.eval(`(async()=>{const providers=await window.fielora.provider.list();const provider=providers.find((item)=>item.lifecycle_status==='ACTIVE'&&item.credential_present&&item.provider_kind==='OPENAI_COMPATIBLE'&&item.base_url?.replace(/\\/+$/,'')==='https://coding.dashscope.aliyuncs.com/v1');if(!provider)throw new Error('Configured Qwen Coding Plan provider was not found');const project=await window.fieloraTest.createProject({title:${JSON.stringify(goldenCase ? `Qwen ${desktopMode} Fast Edit` : 'Qwen Desktop Live')},goal:'Real desktop differential verification',root_path:${JSON.stringify(projectRoot)}});const conversation=await window.fielora.conversation.create({field_id:project.field_id,title:${JSON.stringify(goldenCase ? 'Golden Fast Edit' : 'Qwen live smoke')},provider_config_id:provider.id,model_id:'qwen3.7-plus'});return{provider:{id:provider.id,kind:provider.provider_kind,baseUrl:provider.base_url,model:provider.default_model},fieldId:project.field_id,conversationId:conversation.id};})()`);
  assert.equal(created.provider.model, 'qwen3.7-plus');
  await cdp.eval('location.reload()');
  await wait(cdp, `document.querySelector('[data-testid="project-${created.fieldId}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="project-${created.fieldId}"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-${created.conversationId}"]')`);
  await cdp.eval(`document.querySelector('[data-testid="conversation-${created.conversationId}"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="conversation-composer"]')`);
  const permission = goldenCase ? 'REVIEW_CHANGES' : 'READ_ONLY';
  if (!clarificationCase) {
    await cdp.eval(`document.querySelector('[data-testid="composer-permission"]').click()`);
    await wait(cdp, `document.querySelector('[data-testid="composer-permission-option-${permission}"]')`);
    await cdp.eval(`document.querySelector('[data-testid="composer-permission-option-${permission}"]').click()`);
  }
  const task = goldenCase ? FAST_EDIT_TASK : clarificationCase
    ? '可以开始帮我修改代码吗'
    : '只读取项目根目录 package.json，告诉我 name 字段；不要修改任何文件。';
  await cdp.eval(setValue('.conversation-composer textarea', task));
  const startedAt = performance.now();
  await cdp.eval(`document.querySelector('.conversation-composer textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
  await wait(cdp, `document.querySelector('[data-testid="agent-run-card"]')`, 30_000);

  const handledApprovals = new Set();
  let approvalWaitMs = 0;
  const approvalStarted = new Map();
  let run;
  const deadline = Date.now() + (goldenCase ? 420_000 : 180_000);
  while (Date.now() < deadline) {
    run = await cdp.eval(`window.fielora.agent.list({conversation_id:${JSON.stringify(created.conversationId)}}).then((items)=>items[0])`);
    if (terminalStatuses.has(run.status)) break;
    if (run.status === 'WAITING_APPROVAL') {
      const requested = await cdp.eval(`window.fielora.agent.events({run_id:${JSON.stringify(run.id)},after_sequence:null,limit:500}).then((items)=>items.filter((item)=>item.kind==='APPROVAL_REQUESTED').at(-1)?.payload?.approval)`);
      if (requested && !handledApprovals.has(requested.id)) {
        approvalStarted.set(requested.id, Date.now());
        await wait(cdp, `document.querySelector('[data-testid="agent-allow-once"]')`, 15_000);
        await cdp.eval(`document.querySelector('[data-testid="agent-allow-once"]').click()`);
        handledApprovals.add(requested.id);
        approvalWaitMs += Date.now() - approvalStarted.get(requested.id);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!run || !terminalStatuses.has(run.status)) throw new Error('DESKTOP_AGENT_TIMEOUT');
  const durationMs = Math.round(performance.now() - startedAt);
  const [conversation, tools, events, messages, projection, coreBuildProvenance] = await Promise.all([
    cdp.eval(`window.fielora.conversation.get({conversation_id:${JSON.stringify(created.conversationId)}})`),
    cdp.eval(`window.fielora.agent.toolCalls({run_id:${JSON.stringify(run.id)}})`),
    cdp.eval(`window.fielora.agent.events({run_id:${JSON.stringify(run.id)},after_sequence:null,limit:500})`),
    cdp.eval(`window.fielora.conversation.listMessages({conversation_id:${JSON.stringify(created.conversationId)}})`),
    cdp.eval(`performance.getEntriesByName('fielora.agent.projection').map((entry)=>({duration:entry.duration,startTime:entry.startTime}))`),
    cdp.eval('window.fielora.core.getBuildProvenance()'),
  ]);
  const userMessageCount = messages.filter((message) => message.role === 'USER' && message.content === task).length;
  const assistant = messages.findLast((message) => message.role === 'ASSISTANT');
  const reasoningLeaked = Boolean(assistant && /<\/?think\b/i.test(assistant.content));
  let inspection = null;
  let projectUnchanged = null;
  if (goldenCase) inspection = await inspectFastEditFixture(projectRoot, beforeHashes);
  else {
    const afterHash = clarificationCase ? sha256(JSON.stringify(await readdir(projectRoot))) : sha256(await readFile(packageFile));
    projectUnchanged = beforeHash === afterHash;
  }
  const verificationPassed = tools.some((tool) => tool.name === 'run_command' && tool.status === 'COMPLETED' && tool.receipt?.verification_eligible === true && tool.receipt?.success === true);
  const canonicalPhase = events.filter((event) => event.kind === 'PHASE_CHANGED').at(-1)?.payload ?? null;
  const phaseConsistency = !goldenCase || (canonicalPhase?.active_phase === 'FINALIZE'
    && ['LOCATE', 'EDIT', 'VERIFY', 'FINALIZE'].every((phase) => canonicalPhase?.phases?.[phase] === 'SUCCEEDED'));
  const pass = goldenCase
    ? run.status === 'COMPLETED' && inspection.targetStageRemoved && inspection.onlyTargetFilesChanged && inspection.unrelatedUnchanged && verificationPassed && phaseConsistency && userMessageCount === 1 && !reasoningLeaked
    : run.status === 'COMPLETED' && projectUnchanged && userMessageCount === 1 && !reasoningLeaked;

  await wait(cdp, `document.querySelector('[data-testid="message-assistant"]')`, 20_000);
  if (goldenCase) {
    await cdp.eval(`document.querySelector('[data-testid="agent-view-execution"]').click()`);
    await wait(cdp, `document.querySelector('[data-testid="agent-activity-body"]')`);
    const projectedPhases = await cdp.eval(`Array.from(document.querySelectorAll('.agent-work-timeline li')).map((item)=>({label:item.querySelector('strong')?.textContent,state:Array.from(item.classList).find((name)=>name.startsWith('status-'))}))`);
    assert.deepEqual(projectedPhases.map((phase) => phase.label), ['检查相关实现', '修改', '验证', '完成']);
    assert.equal(projectedPhases.every((phase) => phase.state === 'status-completed'), true);
    await cdp.eval(`document.querySelector('[aria-label="关闭步骤"]').click()`);
  }
  await cdp.eval(`document.querySelector('[data-testid="message-assistant"] [data-testid="message-copy"]').click()`);
  await wait(cdp, `document.querySelector('[data-testid="message-assistant"] [data-testid="message-copy"]')?.getAttribute('aria-label')==='消息已复制'`, 10_000);
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const stem = `qwen-desktop-${desktopMode}-${liveCase.toLowerCase()}-${timestamp}`;
  await writeFile(path.join(evidenceDirectory, `${stem}.png`), Buffer.from(screenshot.data, 'base64'));
  const evidence = {
    schema_version: 2,
    suite: 'FIELORA_AGENT_DESKTOP_DIFFERENTIAL',
    verdict: pass ? `QWEN_${desktopMode.toUpperCase()}_${liveCase}_PASS` : `QWEN_${desktopMode.toUpperCase()}_${liveCase}_FAIL`,
    status: pass ? 'PASS' : 'FAIL',
    live_case: liveCase,
    task,
    created_at: new Date().toISOString(),
    build_provenance: provenanceBeforeLaunch,
    core_build_provenance: coreBuildProvenance,
    provider: created.provider,
    permission,
    conversation_model: conversation.model_id,
    run: { id: run.id, status: run.status, steps: run.current_step, error_code: run.error_code ?? null },
    behavior_profile: events.find((event) => event.kind === 'RUN_STARTED')?.payload?.behavior_profile ?? null,
    task_class: events.find((event) => event.kind === 'CONTEXT_COMPILED')?.payload?.task_class ?? null,
    performance: summarizePerformance({ durationMs, events, tools, approvals: handledApprovals.size, approvalWaitMs, projection, output }),
    tools: tools.map((tool) => ({
      name: tool.name, effect: tool.effect, status: tool.status, policy_decision: tool.policy_decision,
      error_code: tool.error_code ?? null, success: tool.receipt?.success ?? null,
      verification_eligible: tool.receipt?.verification_eligible ?? null,
    })),
    result: goldenCase ? {
      changed_files: inspection.changedFiles,
      only_target_files_changed: inspection.onlyTargetFilesChanged,
      target_stage_removed: inspection.targetStageRemoved,
      unrelated_fixture_unchanged: inspection.unrelatedUnchanged,
      verification_passed: verificationPassed,
      expected_target_files: FAST_EDIT_TARGET_FILES,
    } : { project_unchanged: projectUnchanged },
    ui_submission: { exact_user_message_count: userMessageCount, duplicate_submission_detected: userMessageCount !== 1 },
    raw_reasoning_leaked: reasoningLeaked,
    canonical_phase: canonicalPhase,
    presentation_phase_consistent: phaseConsistency,
    native_clipboard_action: 'PASS',
    assistant_body_stored_in_evidence: false,
    credential_stored_in_evidence: false,
  };
  const evidencePath = path.join(evidenceDirectory, `${stem}.json`);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ evidence_path: evidencePath, verdict: evidence.verdict, performance: evidence.performance, result: evidence.result }, null, 2));
  if (!pass) process.exitCode = 2;
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (output.length > 0) console.error(output.join('').slice(-20_000));
  process.exitCode = 1;
} finally {
  if (cdp) {
    try { await cdp.eval('void window.fielora.core.quit()'); } catch {}
    cdp.close();
  }
  if (child && child.exitCode === null) await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 15_000)),
  ]);
  if (child && child.exitCode === null) child.kill();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(testRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      break;
    } catch (error) {
      if (attempt === 9) console.error(`EVAL_TEMP_CLEANUP_FAILED:${error instanceof Error ? error.message : String(error)}`);
      else await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
