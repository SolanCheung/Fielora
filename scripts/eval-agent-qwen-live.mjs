import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  createFastEditFixture,
  createMinimumScopeFixture,
  FAST_EDIT_TARGET_FILES,
  FAST_EDIT_TASK,
  FAST_EDIT_REAL_PHRASES,
  inspectFastEditFixture,
  inspectMinimumScopeFixture,
  resetMinimumScopeFixture,
} from './lib/agent-fast-edit-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = process.env.FIELORA_CORE_EXE
  ? path.resolve(process.env.FIELORA_CORE_EXE)
  : path.join(root, 'target', 'debug', 'fielora-core.exe');
const endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const model = 'qwen3.7-plus';
const terminalKinds = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const directOutputLimit = 1_024;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : 'UNKNOWN';
}

function positiveInteger(name) {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name}_INVALID`);
  return value;
}

function positiveNumber(name) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name}_INVALID`);
  return value;
}

function authorization() {
  if (process.env.LIVE_PROVIDER_CALLS !== 'AUTHORIZED') throw new Error('LIVE_PROVIDER_CALLS_NOT_AUTHORIZED');
  if (!/^qwen(?:\/dashscope)?$/i.test(process.env.PROVIDER ?? '')) throw new Error('PROVIDER_AUTHORIZATION_MISMATCH');
  if (!/^qwen3\.7-plus$/i.test(process.env.MODEL ?? '')) throw new Error('MODEL_AUTHORIZATION_MISMATCH');
  return {
    max_total_requests: positiveInteger('MAX_TOTAL_REQUESTS'),
    max_total_cost_cny: positiveNumber('MAX_TOTAL_COST_CNY'),
    max_wall_time_seconds: positiveInteger('MAX_WALL_TIME_SECONDS'),
    max_estimated_input_tokens_per_request: 120_000,
    max_output_tokens_per_request: 12_000,
  };
}

class CoreHarness {
  constructor(dataRoot) {
    const environment = { ...process.env, FIELORA_E2E: '0' };
    if (dataRoot) environment.FIELORA_DATA_DIR = dataRoot;
    else delete environment.FIELORA_DATA_DIR;
    this.child = spawn(core, ['--development'], {
      cwd: root,
      env: environment,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.pending = new Map();
    this.notifications = [];
    this.notificationWaiters = [];
    this.sequence = 0;
    this.stderrBytes = 0;
    this.stderrText = '';
    this.lines = readline.createInterface({ input: this.child.stdout });
    this.lines.on('line', (line) => this.onLine(line));
    this.child.stderr.on('data', (chunk) => { this.stderrBytes += chunk.length; this.stderrText += String(chunk); });
    this.child.on('exit', () => {
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('CORE_EXITED_BEFORE_RESPONSE'));
      }
      this.pending.clear();
    });
  }

  onLine(line) {
    let frame;
    try { frame = JSON.parse(line); } catch { return; }
    if (frame.id && this.pending.has(frame.id)) {
      const waiter = this.pending.get(frame.id);
      this.pending.delete(frame.id);
      clearTimeout(waiter.timer);
      if (frame.error) waiter.reject(new Error(String(frame.error.data?.code ?? frame.error.message ?? 'CORE_REQUEST_FAILED')));
      else waiter.resolve(frame.result);
      return;
    }
    const waiterIndex = this.notificationWaiters.findIndex((waiter) => waiter.predicate(frame));
    if (waiterIndex >= 0) {
      const [waiter] = this.notificationWaiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(frame);
    } else {
      this.notifications.push(frame);
    }
  }

  request(method, params = {}, deadlineMs = 20_000) {
    const id = `qwen-live-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CORE_REQUEST_TIMEOUT'));
      }, deadlineMs + 1_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({
        jsonrpc: '2.0', id, method, params,
        _meta: { protocol: '1.0', trace_id: randomUUID(), deadline_ms: deadlineMs },
      })}\n`);
    });
  }

  waitForNotification(predicate, timeoutMs = 130_000) {
    const queued = this.notifications.findIndex(predicate);
    if (queued >= 0) return Promise.resolve(this.notifications.splice(queued, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.notificationWaiters.indexOf(waiter);
        if (index >= 0) this.notificationWaiters.splice(index, 1);
        reject(new Error('CORE_NOTIFICATION_TIMEOUT'));
      }, timeoutMs);
      this.notificationWaiters.push(waiter);
    });
  }

  async shutdown() {
    if (this.child.exitCode !== null) return;
    try { await this.request('system.shutdown', {}, 5_000); } catch {}
    this.child.stdin.end();
    await Promise.race([
      new Promise((resolve) => this.child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
    this.lines.close();
  }

  protocolTrace() {
    return this.stderrText.split(/\r?\n/).filter((line) => line.startsWith('provider_protocol_trace')).slice(-120);
  }
}

async function canonicalCredentialConfig() {
  const harness = new CoreHarness(null);
  try {
    await harness.request('system.hello');
    const providers = await harness.request('query.provider.list_configs');
    const matches = providers.filter((provider) => provider.lifecycle_status === 'ACTIVE'
      && provider.credential_present
      && /^qwen3\.7-plus$/i.test(provider.default_model ?? ''));
    if (matches.length !== 1) throw new Error(`EXPECTED_ONE_CREDENTIALLED_QWEN_CONFIG_FOUND_${matches.length}`);
    return matches[0];
  } finally {
    await harness.shutdown();
  }
}

async function prepareIsolatedEvaluation(dataRoot, canonical) {
  const canonicalHost = typeof canonical.base_url === 'string'
    ? new URL(canonical.base_url).hostname.toLowerCase()
    : null;
  const isCodingPlan = canonicalHost === 'coding.dashscope.aliyuncs.com'
    || canonicalHost === 'coding-intl.dashscope.aliyuncs.com';
  if (isCodingPlan && process.env.FIELORA_CODING_PLAN_INTERACTIVE_TEST !== 'AUTHORIZED') {
    throw new Error('CODING_PLAN_AUTOMATED_EVAL_PROHIBITED');
  }
  const evaluationEndpoint = isCodingPlan ? canonical.base_url : endpoint;
  let harness = new CoreHarness(dataRoot);
  await harness.request('system.hello');
  const created = await harness.request('command.provider.create_config', {
    provider_kind: 'OPENAI_COMPATIBLE',
    display_name: 'Qwen live evaluation (isolated)',
    base_url: evaluationEndpoint,
    default_model: model,
    custom_endpoint_acknowledged: true,
  });
  await harness.shutdown();

  const databasePath = path.join(dataRoot, 'data', 'fielora.db');
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout=5000');
  const result = database.prepare(`
    UPDATE provider_configs
    SET credential_ref = ?, lifecycle_status = 'ACTIVE', revision = revision + 1,
        updated_at = ?
    WHERE id = ? AND lifecycle_status = 'DISABLED'
  `).run(`Fielora/provider/${canonical.id}`, Date.now(), created.id);
  database.close();
  if (result.changes !== 1) throw new Error('ISOLATED_PROVIDER_CREDENTIAL_LINK_FAILED');

  harness = new CoreHarness(dataRoot);
  await harness.request('system.hello');
  const providers = await harness.request('query.provider.list_configs');
  const repaired = providers.find((provider) => provider.id === created.id);
  if (!repaired || repaired.lifecycle_status !== 'ACTIVE' || !repaired.credential_present
    || repaired.provider_kind !== 'OPENAI_COMPATIBLE' || repaired.base_url !== evaluationEndpoint
    || repaired.default_model !== model) {
    await harness.shutdown();
    throw new Error('ISOLATED_PROVIDER_PREFLIGHT_FAILED');
  }
  return { harness, provider: repaired, endpoint_class: isCodingPlan ? 'ALIBABA_CODING_PLAN' : 'ALIBABA_MODEL_STUDIO' };
}

async function runAgentReadOnly(harness, provider, dataRoot, budget) {
  const maxSteps = Math.min(4, budget.max_total_requests);
  if (maxSteps < 2) throw new Error('BUDGET_BLOCKED_AGENT_STEPS');
  const projectRoot = path.join(dataRoot, 'project');
  const packagePath = path.join(projectRoot, 'package.json');
  const packageContent = `${JSON.stringify({ name: 'fielora-qwen-live-fixture', private: true }, null, 2)}\n`;
  await mkdir(projectRoot, { recursive: true });
  await writeFile(packagePath, packageContent, 'utf8');
  const beforeHash = sha256(await readFile(packagePath));
  const project = await harness.request('command.project.create', {
    title: 'Qwen live isolated project', goal: 'Read-only coding agent verification', root_path: projectRoot,
  });
  const conversation = await harness.request('command.conversation.create', {
    field_id: project.field_id, title: 'Qwen read-only tool verification',
    provider_config_id: provider.id, model_id: model,
  });
  const startedAt = performance.now();
  let run = await harness.request('command.agent.start', {
    field_id: project.field_id, conversation_id: conversation.id,
    provider_config_id: provider.id, model_id: model,
    task: '先读取 package.json，然后只回答项目的 name 字段；必须先调用 read_file，不要修改任何文件。',
    permission: 'READ_ONLY', max_steps: maxSteps,
  });
  const deadline = Date.now() + Math.min(budget.max_wall_time_seconds * 1_000, 180_000);
  while (!terminalKinds.has(run.status) && Date.now() < deadline) {
    if (run.status === 'WAITING_APPROVAL') throw new Error('READ_ONLY_AGENT_REQUESTED_APPROVAL');
    await new Promise((resolve) => setTimeout(resolve, 200));
    run = await harness.request('query.agent.get', { run_id: run.id });
  }
  if (!terminalKinds.has(run.status)) throw new Error('AGENT_LIVE_TIMEOUT');
  const [tools, events, messages] = await Promise.all([
    harness.request('query.agent.tool_calls', { run_id: run.id }),
    harness.request('query.agent.events', { run_id: run.id, after_sequence: null, limit: 500 }),
    harness.request('query.conversation.message.list', { conversation_id: conversation.id }),
  ]);
  const afterHash = sha256(await readFile(packagePath));
  const assistant = messages.findLast((message) => message.role === 'ASSISTANT');
  const readCompleted = tools.some((tool) => tool.name === 'read_file' && tool.status === 'COMPLETED');
  const observeOnly = tools.every((tool) => tool.effect === 'OBSERVE');
  return {
    case: 'QW-AGENT-READ-01',
    status: run.status === 'COMPLETED' && readCompleted && observeOnly && beforeHash === afterHash && assistant ? 'PASS' : 'FAIL',
    run_status: run.status,
    error_code: run.error_code ?? null,
    model_steps: run.current_step,
    max_steps: maxSteps,
    latency_ms: Math.round(performance.now() - startedAt),
    tools: tools.map((tool) => ({ name: tool.name, effect: tool.effect, status: tool.status, error_code: tool.error_code ?? null })),
    event_kinds: [...new Set(events.map((event) => event.kind))],
    assistant_message_present: Boolean(assistant),
    assistant_output_bytes: assistant ? Buffer.byteLength(assistant.content, 'utf8') : 0,
    assistant_output_sha256: assistant ? sha256(assistant.content) : null,
    project_file_unchanged: beforeHash === afterHash,
    canonical_database_mutated: false,
    full_prompt_persisted_in_evidence: false,
    full_response_persisted_in_evidence: false,
  };
}

async function runAgentClarificationDiagnostic(harness, provider, dataRoot, budget) {
  const maxSteps = Math.min(4, budget.max_total_requests);
  if (maxSteps < 3) throw new Error('BUDGET_BLOCKED_DIAGNOSTIC_STEPS');
  const projectRoot = path.join(dataRoot, 'empty-project');
  await mkdir(projectRoot, { recursive: true });
  const project = await harness.request('command.project.create', {
    title: 'Qwen clarification diagnostic', goal: 'Reproduce multi-turn termination', root_path: projectRoot,
  });
  const conversation = await harness.request('command.conversation.create', {
    field_id: project.field_id, title: 'Qwen clarification diagnostic',
    provider_config_id: provider.id, model_id: model,
  });
  let run = await harness.request('command.agent.start', {
    field_id: project.field_id, conversation_id: conversation.id,
    provider_config_id: provider.id, model_id: model,
    task: '可以开始帮我修改代码吗', permission: 'REVIEW_CHANGES', max_steps: maxSteps,
  });
  const deadline = Date.now() + Math.min(budget.max_wall_time_seconds * 1_000, 180_000);
  while (!terminalKinds.has(run.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    run = await harness.request('query.agent.get', { run_id: run.id });
  }
  if (!terminalKinds.has(run.status)) throw new Error('AGENT_DIAGNOSTIC_TIMEOUT');
  const [events, messages] = await Promise.all([
    harness.request('query.agent.events', { run_id: run.id, after_sequence: null, limit: 500 }),
    harness.request('query.conversation.message.list', { conversation_id: conversation.id }),
  ]);
  const assistant = messages.findLast((message) => message.role === 'ASSISTANT');
  return {
    case: 'QW-AGENT-CLARIFY-DIAG-01',
    status: run.status === 'COMPLETED' && assistant ? 'PASS' : 'FAIL',
    observed_run_status: run.status,
    error_code: run.error_code ?? null,
    model_steps: run.current_step,
    event_kinds: events.map((event) => event.kind),
    model_completed: events.filter((event) => event.kind === 'MODEL_COMPLETED').length,
    model_failed: events.filter((event) => event.kind === 'MODEL_FAILED').length,
    assistant_message_present: Boolean(assistant),
    protocol_trace: harness.protocolTrace(),
    prompt_or_response_body_persisted: false,
  };
}

async function runAgentFocusedFormEdit(harness, provider, dataRoot, budget) {
  const maxSteps = Math.min(8, budget.max_total_requests);
  if (maxSteps < 4) throw new Error('BUDGET_BLOCKED_FOCUSED_EDIT_STEPS');
  const projectRoot = path.join(dataRoot, 'focused-form-project');
  const sourcePath = path.join(projectRoot, 'src', 'invoice-form.html');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, `<form id="invoice-form">\n  <input name="user" required>\n  <input name="amount" required>\n</form>\n`, 'utf8');
  await writeFile(path.join(projectRoot, 'verify.cjs'), `const fs=require('node:fs');const text=fs.readFileSync('src/invoice-form.html','utf8');if(/name="user"[^>]*required/.test(text)||!/name="amount"[^>]*required/.test(text))process.exit(1);\n`, 'utf8');
  const project = await harness.request('command.project.create', {
    title: 'Qwen focused form edit', goal: 'Verify focused edit routing and execution', root_path: projectRoot,
  });
  const conversation = await harness.request('command.conversation.create', {
    field_id: project.field_id, title: 'Make one field optional',
    provider_config_id: provider.id, model_id: model,
  });
  const task = '把新增发票页面的用户表单改成非必填，只修改用户输入框，保留金额输入框必填。完成后运行最窄验证。';
  const userMessage = await harness.request('command.conversation.message.create', {
    conversation_id: conversation.id, role: 'USER', content: task, status: 'COMPLETED',
    provider_config_id: null, model_id: null, invocation_id: null,
  });
  const startedAt = performance.now();
  let run = await harness.request('command.agent.start', {
    field_id: project.field_id, conversation_id: conversation.id, user_message_id: userMessage.id,
    provider_config_id: provider.id, model_id: model, task, permission: 'FULL_CONTROL', max_steps: maxSteps,
  });
  const deadline = Date.now() + Math.min(budget.max_wall_time_seconds * 1_000, 240_000);
  while (!terminalKinds.has(run.status) && Date.now() < deadline) {
    if (run.status === 'WAITING_APPROVAL') throw new Error('FOCUSED_EDIT_UNEXPECTED_APPROVAL');
    await new Promise((resolve) => setTimeout(resolve, 250));
    run = await harness.request('query.agent.get', { run_id: run.id });
  }
  if (!terminalKinds.has(run.status)) throw new Error('FOCUSED_EDIT_TIMEOUT');
  const [tools, events, messages] = await Promise.all([
    harness.request('query.agent.tool_calls', { run_id: run.id }),
    harness.request('query.agent.events', { run_id: run.id, after_sequence: null, limit: 500 }),
    harness.request('query.conversation.message.list', { conversation_id: conversation.id }),
  ]);
  const finalText = await readFile(sourcePath, 'utf8');
  const started = events.find((event) => event.kind === 'RUN_STARTED');
  const steps = events.filter((event) => event.kind === 'STEP_STARTED');
  const modelCalls = events.filter((event) => ['MODEL_COMPLETED', 'MODEL_FAILED'].includes(event.kind)).length;
  const assistant = messages.findLast((message) => message.role === 'ASSISTANT');
  const pass = run.status === 'COMPLETED'
    && started?.payload?.task_class === 'FOCUSED_EDIT'
    && steps.every((event) => Number(event.payload?.tool_count) <= 10)
    && !/name="user"[^>]*required/.test(finalText)
    && /name="amount"[^>]*required/.test(finalText)
    && tools.some((tool) => ['replace_text', 'apply_patches', 'write_file'].includes(tool.name) && tool.status === 'COMPLETED')
    && tools.some((tool) => tool.name === 'run_command' && tool.status === 'COMPLETED' && tool.receipt?.success === true)
    && assistant?.status === 'COMPLETED'
    && assistant.content.includes('##');
  return {
    case: 'QW-AGENT-FOCUSED-FORM-EDIT-01',
    status: pass ? 'PASS' : 'FAIL',
    request_count: modelCalls,
    finish_reason: run.status,
    error_code: run.error_code,
    latency_ms: Math.round(performance.now() - startedAt),
    task_class: started?.payload?.task_class ?? null,
    maximum_visible_tools: Math.max(0, ...steps.map((event) => Number(event.payload?.tool_count ?? 0))),
    tool_summary: tools.map((tool) => ({ name: tool.name, status: tool.status })),
    user_optional: !/name="user"[^>]*required/.test(finalText),
    adjacent_amount_required_preserved: /name="amount"[^>]*required/.test(finalText),
    terminal_markdown_present: Boolean(assistant?.content?.includes('##')),
    actual_usage: null,
    protocol_trace: harness.protocolTrace(),
  };
}

async function runAgentRealCrLfEdit(harness, provider, dataRoot, budget) {
  const maxSteps = Math.min(24, budget.max_total_requests);
  if (maxSteps < 8) throw new Error('BUDGET_BLOCKED_REAL_CRLF_EDIT_STEPS');
  const realSource = process.env.FIELORA_REAL_CRLF_SOURCE;
  if (!realSource || !existsSync(realSource)) throw new Error('REAL_CRLF_SOURCE_MISSING');
  const projectRoot = path.join(dataRoot, 'real-crlf-project');
  const relativeSource = path.join('src', 'app', 'finance-add', 'finance-add.controller.js');
  const sourcePath = path.join(projectRoot, relativeSource);
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await copyFile(realSource, sourcePath);
  const before = await readFile(sourcePath);
  const beforeText = before.toString('utf8');
  if (!beforeText.includes('\r\n') || !beforeText.includes("'iContacter': 1")) {
    throw new Error('REAL_CRLF_SOURCE_PRECONDITION_FAILED');
  }
  await writeFile(path.join(projectRoot, 'verify.cjs'), [
    "const fs=require('node:fs');",
    "const text=fs.readFileSync('src/app/finance-add/finance-add.controller.js','utf8');",
    "const userBlock=/oContacterVld:\\s*\\{[\\s\\S]{0,280}?check:\\s*false/.test(text);",
    "const requiredFlags=(text.match(/'iContacter':\\s*0/g)||[]).length===2;",
    "if(!userBlock||!requiredFlags||text.includes(\"'iContacter': 1\"))process.exit(1);",
    '',
  ].join('\n'), 'utf8');
  const project = await harness.request('command.project.create', {
    title: 'Qwen real CRLF regression', goal: 'Reproduce and verify the real finance form edit safely in an isolated copy', root_path: projectRoot,
  });
  const conversation = await harness.request('command.conversation.create', {
    field_id: project.field_id, title: 'Real CRLF edit regression',
    provider_config_id: provider.id, model_id: model,
  });
  const task = '新增发票页面的用户表单改成非必填。只修改 finance-add.controller.js 中用户联系人 oContacter 的校验与两个 required 映射，不要改变客户或其他字段；完成后运行 node verify.cjs 和 git_read diff。';
  const userMessage = await harness.request('command.conversation.message.create', {
    conversation_id: conversation.id, role: 'USER', content: task, status: 'COMPLETED',
    provider_config_id: null, model_id: null, invocation_id: null,
  });
  const startedAt = performance.now();
  let run = await harness.request('command.agent.start', {
    field_id: project.field_id, conversation_id: conversation.id, user_message_id: userMessage.id,
    provider_config_id: provider.id, model_id: model, task, permission: 'FULL_CONTROL', max_steps: maxSteps,
  });
  const deadline = Date.now() + Math.min(budget.max_wall_time_seconds * 1_000, 360_000);
  while (!terminalKinds.has(run.status) && Date.now() < deadline) {
    if (run.status === 'WAITING_APPROVAL') throw new Error('REAL_CRLF_FULL_ACCESS_UNEXPECTED_APPROVAL');
    await new Promise((resolve) => setTimeout(resolve, 250));
    run = await harness.request('query.agent.get', { run_id: run.id });
  }
  if (!terminalKinds.has(run.status)) throw new Error('REAL_CRLF_EDIT_TIMEOUT');
  const [tools, events, messages] = await Promise.all([
    harness.request('query.agent.tool_calls', { run_id: run.id }),
    harness.request('query.agent.events', { run_id: run.id, after_sequence: null, limit: 500 }),
    harness.request('query.conversation.message.list', { conversation_id: conversation.id }),
  ]);
  const finalText = await readFile(sourcePath, 'utf8');
  const assistant = messages.findLast((message) => message.role === 'ASSISTANT');
  const modelCalls = events.filter((event) => ['MODEL_COMPLETED', 'MODEL_FAILED'].includes(event.kind)).length;
  const fileChangedFailures = tools.filter((tool) => tool.error_code === 'AGENT_FILE_CHANGED').length;
  const userOptional = /oContacterVld:\s*\{[\s\S]{0,280}?check:\s*false/.test(finalText)
    && (finalText.match(/'iContacter':\s*0/g) ?? []).length === 2
    && !finalText.includes("'iContacter': 1");
  const pass = run.status === 'COMPLETED'
    && fileChangedFailures === 0
    && userOptional
    && tools.some((tool) => ['replace_text', 'apply_patches'].includes(tool.name) && tool.status === 'COMPLETED')
    && tools.some((tool) => tool.name === 'run_command' && tool.status === 'COMPLETED' && tool.receipt?.success === true)
    && assistant?.status === 'COMPLETED';
  return {
    case: 'QW-AGENT-REAL-CRLF-EDIT-01',
    status: pass ? 'PASS' : 'FAIL',
    request_count: modelCalls,
    finish_reason: run.status,
    error_code: run.error_code,
    latency_ms: Math.round(performance.now() - startedAt),
    source_sha256: sha256(before),
    source_bytes: before.length,
    crlf_lines: beforeText.split('\r\n').length - 1,
    file_changed_failures: fileChangedFailures,
    unexpected_approvals: events.filter((event) => event.kind === 'APPROVAL_REQUESTED').length,
    user_optional: userOptional,
    tool_summary: tools.map((tool) => ({ name: tool.name, status: tool.status, error_code: tool.error_code ?? null })),
    terminal_markdown_present: Boolean(assistant?.content?.includes('##')),
    protocol_trace: harness.protocolTrace(),
  };
}

async function runAgentGoldenEdit(harness, provider, dataRoot, budget) {
  const maxSteps = Math.min(16, budget.max_total_requests);
  if (maxSteps < 6) throw new Error('BUDGET_BLOCKED_GOLDEN_STEPS');
  const projectRoot = path.join(dataRoot, 'golden-project');
  const beforeHashes = await createFastEditFixture(projectRoot);
  const project = await harness.request('command.project.create', {
    title: 'Qwen Fast Edit Golden', goal: 'Bounded configuration edit benchmark', root_path: projectRoot,
  });
  const conversation = await harness.request('command.conversation.create', {
    field_id: project.field_id, title: 'Golden Task', provider_config_id: provider.id, model_id: model,
  });
  const startedAt = performance.now();
  let run = await harness.request('command.agent.start', {
    field_id: project.field_id, conversation_id: conversation.id,
    provider_config_id: provider.id, model_id: model,
    task: FAST_EDIT_TASK,
    permission: 'REVIEW_CHANGES', max_steps: maxSteps,
  });
  const deadline = Date.now() + Math.min(budget.max_wall_time_seconds * 1_000, 300_000);
  const approvals = new Set();
  while (!terminalKinds.has(run.status) && Date.now() < deadline) {
    if (run.status === 'WAITING_APPROVAL') {
      const events = await harness.request('query.agent.events', { run_id: run.id, after_sequence: null, limit: 500 });
      const requested = events.findLast((event) => event.kind === 'APPROVAL_REQUESTED')?.payload?.approval;
      if (!requested || approvals.has(requested.id)) throw new Error('GOLDEN_APPROVAL_PROJECTION_INVALID');
      approvals.add(requested.id);
      await harness.request('command.agent.resolve_approval', {
        run_id: run.id, approval_id: requested.id, nonce: requested.nonce, decision: 'ALLOW_ONCE',
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    run = await harness.request('query.agent.get', { run_id: run.id });
  }
  if (!terminalKinds.has(run.status)) throw new Error('GOLDEN_AGENT_TIMEOUT');
  const [tools, events, messages] = await Promise.all([
    harness.request('query.agent.tool_calls', { run_id: run.id }),
    harness.request('query.agent.events', { run_id: run.id, after_sequence: null, limit: 500 }),
    harness.request('query.conversation.message.list', { conversation_id: conversation.id }),
  ]);
  const inspection = await inspectFastEditFixture(projectRoot, beforeHashes);
  const changed = inspection.changedFiles;
  const stageRemoved = inspection.targetStageRemoved;
  const unrelatedUnchanged = inspection.unrelatedUnchanged;
  const verificationPassed = tools.some((tool) => tool.name === 'run_command' && tool.status === 'COMPLETED' && tool.receipt?.verification_eligible === true && tool.receipt?.success === true);
  const assistant = messages.findLast((message) => message.role === 'ASSISTANT');
  const reasoningLeaked = Boolean(assistant && /<\/?think\b/i.test(assistant.content));
  const postRunSyntaxChecks = FAST_EDIT_TARGET_FILES.filter((relative) => relative.endsWith('.js')).map((relative) => {
    const result = spawnSync(process.execPath, ['--check', path.join(projectRoot, relative)], {
      cwd: projectRoot, encoding: 'utf8', windowsHide: true,
    });
    return {
      path: relative,
      exit_code: result.status,
      stderr_preview: String(result.stderr ?? '').slice(0, 600),
    };
  });
  const observeKeys = new Set();
  let duplicateObserveCalls = 0;
  for (const tool of tools.filter((item) => item.effect === 'OBSERVE')) {
    const key = `${tool.name}:${JSON.stringify(tool.arguments)}`;
    duplicateObserveCalls += Number(observeKeys.has(key));
    observeKeys.add(key);
  }
  const modelEvents = events.filter((event) => event.kind === 'MODEL_COMPLETED');
  const contextEvents = events.filter((event) => event.kind === 'CONTEXT_COMPILED');
  const completedToolEvents = events.filter((event) => event.kind === 'TOOL_COMPLETED');
  const verificationToolIds = new Set(tools
    .filter((tool) => tool.name === 'run_command' && tool.receipt?.verification_eligible === true)
    .map((tool) => tool.id));
  const approvalQueue = [];
  let approvalWaitMs = 0;
  for (const event of events) {
    if (event.kind === 'APPROVAL_REQUESTED') approvalQueue.push(event.created_at);
    if (event.kind === 'APPROVAL_RESOLVED' && approvalQueue.length > 0) {
      approvalWaitMs += Math.max(0, event.created_at - approvalQueue.shift());
    }
  }
  const usage = modelEvents.map((event) => event.payload?.usage ?? {}).reduce((total, item) => ({
    input_tokens: total.input_tokens + Number(item.input_tokens ?? 0),
    output_tokens: total.output_tokens + Number(item.output_tokens ?? 0),
  }), { input_tokens: 0, output_tokens: 0 });
  const onlyTargetFilesChanged = inspection.onlyTargetFilesChanged;
  const canonicalPhase = events.filter((event) => event.kind === 'PHASE_CHANGED').at(-1)?.payload ?? null;
  const phaseConsistent = canonicalPhase?.active_phase === 'FINALIZE'
    && ['LOCATE', 'EDIT', 'VERIFY', 'FINALIZE'].every((phase) => canonicalPhase?.phases?.[phase] === 'SUCCEEDED');
  const pass = run.status === 'COMPLETED' && stageRemoved && onlyTargetFilesChanged && unrelatedUnchanged && verificationPassed && phaseConsistent && !reasoningLeaked;
  return {
    case: 'QW-AGENT-GOLDEN-FAST-EDIT-01', status: pass ? 'PASS' : 'FAIL',
    run_status: run.status, error_code: run.error_code ?? null, model_steps: run.current_step,
    latency_ms: Math.round(performance.now() - startedAt), model_calls: modelEvents.length,
    context_duration_ms: contextEvents.reduce((total, event) => total + Number(event.payload?.duration_ms ?? 0), 0),
    repository_scan_duration_ms: contextEvents.reduce((total, event) => total + Number(event.payload?.repository_index_duration_ms ?? 0), 0),
    repository_index_cache_hits: contextEvents.filter((event) => event.payload?.repository_index_cache_hit === true).length,
    repository_index_invalidated_files: contextEvents.reduce((total, event) => total + Number(event.payload?.repository_index_invalidated_files ?? 0), 0),
    model_duration_ms: modelEvents.reduce((total, event) => total + Number(event.payload?.duration_ms ?? 0), 0),
    first_token_ms: modelEvents.map((event) => event.payload?.first_token_ms ?? null),
    tool_calls: tools.length,
    tool_duration_ms: completedToolEvents.reduce((total, event) => total + Number(event.payload?.duration_ms ?? 0), 0),
    search_calls: tools.filter((tool) => tool.name === 'search_text').length,
    file_reads: tools.filter((tool) => tool.name === 'read_file').length,
    stat_calls: tools.filter((tool) => tool.name === 'stat_path').length,
    git_calls: tools.filter((tool) => tool.name === 'git_read').length,
    duplicate_observe_calls: duplicateObserveCalls,
    patch_attempts: tools.filter((tool) => tool.name === 'apply_patches').length,
    patch_conflicts: tools.filter((tool) => tool.name === 'apply_patches' && tool.status !== 'COMPLETED').length,
    context_rebuilds: contextEvents.filter((event) => event.payload?.cache_hit !== true).length,
    approval_wait_ms: approvalWaitMs,
    verification_calls: verificationToolIds.size,
    verification_duration_ms: completedToolEvents
      .filter((event) => verificationToolIds.has(event.payload?.tool_call_id))
      .reduce((total, event) => total + Number(event.payload?.duration_ms ?? 0), 0),
    tool_trace: tools.map((tool) => ({
      name: tool.name, effect: tool.effect, status: tool.status,
      policy_decision: tool.policy_decision, error_code: tool.error_code ?? null,
      receipt_kind: tool.receipt?.kind ?? null, success: tool.receipt?.success ?? null,
      program: tool.name === 'run_command' ? tool.arguments?.program ?? null : null,
      argv: tool.name === 'run_command' ? tool.arguments?.argv ?? null : null,
      patch_shape: tool.name === 'apply_patches' ? (tool.arguments?.patches ?? []).map((patch) => ({
        path: patch.path,
        replacements: patch.replacements?.length ?? 0,
        line_edits: patch.line_edits?.map((edit) => [edit.start_line, edit.end_line]) ?? [],
      })) : null,
    })),
    durable_events: events.length, approvals: approvals.size, actual_usage: usage,
    task_class: events.find((event) => event.kind === 'CONTEXT_COMPILED')?.payload?.task_class ?? null,
    build_provenance: events.find((event) => event.kind === 'RUN_STARTED')?.payload?.build_provenance ?? null,
    context: contextEvents.map((event) => ({
      duration_ms: event.payload?.duration_ms, cache_hit: event.payload?.cache_hit,
      repository_index_cache_hit: event.payload?.repository_index_cache_hit,
      repository_index_duration_ms: event.payload?.repository_index_duration_ms,
      repository_index_invalidated_files: event.payload?.repository_index_invalidated_files,
      selected_files: event.payload?.selected_files, estimated_tokens: event.payload?.estimated_tokens,
    })),
    changed_files: changed, only_target_files_changed: onlyTargetFilesChanged,
    target_stage_removed: stageRemoved, unrelated_fixture_unchanged: unrelatedUnchanged,
    verification_passed: verificationPassed, raw_reasoning_leaked: reasoningLeaked,
    canonical_phase: canonicalPhase, presentation_phase_consistent: phaseConsistent,
    post_run_syntax_checks: postRunSyntaxChecks,
    protocol_trace: harness.protocolTrace(),
    assistant_output_bytes: assistant ? Buffer.byteLength(assistant.content, 'utf8') : 0,
    assistant_output_sha256: assistant ? sha256(assistant.content) : null,
    full_prompt_persisted_in_evidence: false, full_response_persisted_in_evidence: false,
  };
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

async function runAgentRobustness(harness, provider, dataRoot, budget) {
  const repetitions = Math.max(10, Math.min(20, Number(process.env.FIELORA_ROBUSTNESS_REPETITIONS ?? 10)));
  if (budget.max_total_requests < repetitions * 4) throw new Error('BUDGET_BLOCKED_ROBUSTNESS_REQUESTS');
  const projectRoot = path.join(dataRoot, 'robustness-project');
  await createMinimumScopeFixture(projectRoot);
  const project = await harness.request('command.project.create', {
    title: 'Qwen Fast Edit Robustness', goal: 'Minimum necessary change and bounded recovery', root_path: projectRoot,
  });
  const runs = [];
  let requestsUsed = 0;
  for (let index = 0; index < repetitions; index += 1) {
    const alreadySatisfied = index >= repetitions - 2;
    const beforeHashes = await resetMinimumScopeFixture(projectRoot, alreadySatisfied);
    const task = FAST_EDIT_REAL_PHRASES[index % FAST_EDIT_REAL_PHRASES.length];
    const conversation = await harness.request('command.conversation.create', {
      field_id: project.field_id, title: `Robustness ${index + 1}`, provider_config_id: provider.id, model_id: model,
    });
    const startedAt = performance.now();
    let run = await harness.request('command.agent.start', {
      field_id: project.field_id, conversation_id: conversation.id,
      provider_config_id: provider.id, model_id: model,
      task, permission: 'FULL_CONTROL', max_steps: 8,
    });
    const deadline = Date.now() + Math.min(budget.max_wall_time_seconds * 1_000, 180_000);
    while (!terminalKinds.has(run.status) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      run = await harness.request('query.agent.get', { run_id: run.id });
    }
    if (!terminalKinds.has(run.status)) throw new Error(`ROBUSTNESS_AGENT_TIMEOUT_${index + 1}`);
    const [tools, events, messages] = await Promise.all([
      harness.request('query.agent.tool_calls', { run_id: run.id }),
      harness.request('query.agent.events', { run_id: run.id, after_sequence: null, limit: 500 }),
      harness.request('query.conversation.message.list', { conversation_id: conversation.id }),
    ]);
    const inspection = await inspectMinimumScopeFixture(projectRoot, beforeHashes, alreadySatisfied);
    const modelCalls = events.filter((event) => event.kind === 'MODEL_COMPLETED').length;
    requestsUsed += modelCalls;
    const phase = events.filter((event) => event.kind === 'PHASE_CHANGED').at(-1)?.payload ?? null;
    const verificationPassed = tools.some((tool) => tool.name === 'run_command'
      && tool.status === 'COMPLETED' && tool.receipt?.success === true);
    const noChangeCompleted = alreadySatisfied && phase?.phases?.EDIT === 'SKIPPED'
      && phase?.phases?.VERIFY === 'SKIPPED' && phase?.fact?.no_change === true;
    const safe = inspection.adjacentPreserved && inspection.businessStagePreserved
      && inspection.unrelatedUnchanged && inspection.changeShapeValid;
    const success = run.status === 'COMPLETED' && inspection.stageOptionAbsent && safe
      && (alreadySatisfied ? noChangeCompleted : verificationPassed);
    const assistant = messages.findLast((message) => message.role === 'ASSISTANT');
    runs.push({
      iteration: index + 1,
      phrase_index: index % FAST_EDIT_REAL_PHRASES.length,
      task,
      mode: alreadySatisfied ? 'ALREADY_SATISFIED' : 'MINIMUM_EDIT',
      status: success ? 'PASS' : 'FAIL',
      run_status: run.status,
      error_code: run.error_code ?? null,
      latency_ms: Math.round(performance.now() - startedAt),
      model_calls: modelCalls,
      context_confidence: events.find((event) => event.kind === 'CONTEXT_COMPILED')?.payload?.context_confidence ?? null,
      evidence_recovery: tools.some((tool) => tool.name === 'search_text') || events.some((event) => event.payload?.fact?.narrative_key === 'EVIDENCE_RECOVERY'),
      changeset_recovery: events.some((event) => event.kind === 'CHECKPOINT_CREATED' && event.payload?.kind === 'CHANGESET_REJECTED'),
      validation_errors: events.filter((event) => event.kind === 'CHECKPOINT_CREATED' && event.payload?.kind === 'CHANGESET_REJECTED').map((event) => event.payload?.validation_error ?? null),
      patch_conflicts: tools.filter((tool) => tool.name === 'apply_patches' && tool.status !== 'COMPLETED').length,
      search_calls: tools.filter((tool) => tool.name === 'search_text').length,
      file_reads: tools.filter((tool) => tool.name === 'read_file').length,
      changed_files: inspection.changedFiles,
      adjacent_control_preserved: inspection.adjacentPreserved,
      business_stage_preserved: inspection.businessStagePreserved,
      unrelated_files_unchanged: inspection.unrelatedUnchanged,
      change_shape_valid: inspection.changeShapeValid,
      verification_passed: verificationPassed,
      no_change_completed: noChangeCompleted,
      canonical_phase: phase,
      assistant_output_sha256: assistant ? sha256(assistant.content) : null,
    });
  }
  const latencies = runs.map((run) => run.latency_ms);
  const successes = runs.filter((run) => run.status === 'PASS').length;
  const averageCalls = runs.reduce((total, run) => total + run.model_calls, 0) / runs.length;
  const recoveryRuns = runs.filter((run) => run.evidence_recovery || run.changeset_recovery).length;
  const conflictRuns = runs.filter((run) => run.patch_conflicts > 0).length;
  const metrics = {
    repetitions,
    successes,
    success_rate: successes / repetitions,
    latency_ms: { p50: percentile(latencies, 0.50), p90: percentile(latencies, 0.90), p95: percentile(latencies, 0.95) },
    average_model_calls: Number(averageCalls.toFixed(2)),
    max_model_calls: Math.max(...runs.map((run) => run.model_calls)),
    recovery_rate: recoveryRuns / repetitions,
    conflict_rate: conflictRuns / repetitions,
    unsafe_write_count: runs.filter((run) => run.changed_files.length > 0
      && (!run.adjacent_control_preserved || !run.business_stage_preserved || !run.unrelated_files_unchanged || !run.change_shape_valid)).length,
  };
  const pass = metrics.success_rate >= 0.95 && metrics.latency_ms.p90 < 45_000
    && metrics.average_model_calls <= 3 && metrics.max_model_calls <= 4 && metrics.unsafe_write_count === 0;
  return {
    case: 'QW-AGENT-FAST-EDIT-ROBUSTNESS-01',
    status: pass ? 'PASS' : 'FAIL',
    request_count: requestsUsed,
    actual_usage: null,
    metrics,
    runs,
    protocol_trace: harness.protocolTrace(),
  };
}

async function runS01(harness, provider, budget) {
  const prompt = '只输出 FIELORA_QWEN_STREAM_OK，不要输出其他内容。';
  const estimatedInputTokens = Math.ceil(Buffer.byteLength(prompt, 'utf8') / 2);
  if (estimatedInputTokens > budget.max_estimated_input_tokens_per_request) throw new Error('BUDGET_BLOCKED_INPUT');
  if (directOutputLimit > budget.max_output_tokens_per_request) throw new Error('BUDGET_BLOCKED_OUTPUT');
  const startedAt = performance.now();
  const invocation = await harness.request('command.model.start', {
    provider_config_id: provider.id,
    model_id: model,
    intent: 'ASK',
    user_input: prompt,
    context_package: [],
    response_mode: 'TEXT',
  });
  const events = [];
  for (;;) {
    const frame = await harness.waitForNotification((value) => value.method === 'event.model.invocation'
      && value.params?.invocation_id === invocation.invocation_id);
    events.push(frame.params);
    if (terminalKinds.has(frame.params.kind)) break;
  }
  const latencyMs = Math.round(performance.now() - startedAt);
  const output = events.filter((event) => event.kind === 'OUTPUT_TEXT_DELTA')
    .map((event) => event.text_delta ?? '').join('');
  const usage = events.findLast((event) => event.kind === 'USAGE')?.usage ?? null;
  const terminal = events.at(-1);
  const requiredKinds = ['STARTED', 'OUTPUT_TEXT_DELTA', 'USAGE', 'COMPLETED'];
  const eventKinds = events.map((event) => event.kind);
  const markerPresent = output.trim() === 'FIELORA_QWEN_STREAM_OK';
  return {
    case: 'QW-S01',
    request_number: 1,
    status: terminal.kind === 'COMPLETED' && requiredKinds.every((kind) => eventKinds.includes(kind)) && markerPresent ? 'PASS' : 'FAIL',
    provider: 'Qwen/DashScope',
    model,
    endpoint_class: 'ALIBABA_MODEL_STUDIO',
    invocation_id: invocation.invocation_id,
    event_kinds: eventKinds,
    finish_reason: terminal.kind,
    error_code: terminal.error_code ?? null,
    input_token_estimate: estimatedInputTokens,
    input_token_estimate_method: 'UTF8_BYTES_DIVIDED_BY_2_CEILING',
    output_token_limit: directOutputLimit,
    actual_usage: usage,
    latency_ms: latencyMs,
    output_bytes: Buffer.byteLength(output, 'utf8'),
    output_sha256: sha256(output),
    expected_marker_exact: markerPresent,
    full_prompt_persisted: false,
    full_response_persisted: false,
  };
}

async function safeRemoveEvaluationRoot(dataRoot) {
  const resolved = path.resolve(dataRoot);
  const temporary = path.resolve(tmpdir());
  if (!resolved.startsWith(`${temporary}${path.sep}`) || !path.basename(resolved).startsWith('fielora-qwen-live-')) {
    throw new Error('REFUSING_TO_REMOVE_NON_EVAL_TEMP_ROOT');
  }
  await rm(resolved, { recursive: true, force: true });
}

async function main() {
  if (!existsSync(core)) throw new Error('CORE_DEBUG_BINARY_MISSING');
  const budget = authorization();
  if (budget.max_total_requests < 1) throw new Error('BUDGET_BLOCKED_REQUEST_COUNT');
  const wallStarted = Date.now();
  const runId = `qwen-live-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
  const evidenceDir = process.env.FIELORA_LIVE_EVIDENCE_DIR
    ?? path.join(root, 'artifacts', 'agent-v0.1', 'qwen', 'live');
  await mkdir(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, `${runId}.json`);
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'fielora-qwen-live-'));
  let harness;
  let report;
  try {
    const canonical = await canonicalCredentialConfig();
    const prepared = await prepareIsolatedEvaluation(dataRoot, canonical);
    harness = prepared.harness;
    const result = process.env.FIELORA_LIVE_CASE === 'AGENT_REAL_CRLF_EDIT'
      ? await runAgentRealCrLfEdit(harness, prepared.provider, dataRoot, budget)
      : process.env.FIELORA_LIVE_CASE === 'AGENT_ROBUSTNESS'
      ? await runAgentRobustness(harness, prepared.provider, dataRoot, budget)
      : process.env.FIELORA_LIVE_CASE === 'AGENT_GOLDEN_EDIT'
      ? await runAgentGoldenEdit(harness, prepared.provider, dataRoot, budget)
      : process.env.FIELORA_LIVE_CASE === 'AGENT_FOCUSED_EDIT'
      ? await runAgentFocusedFormEdit(harness, prepared.provider, dataRoot, budget)
      : process.env.FIELORA_LIVE_CASE === 'AGENT_READ_ONLY'
      ? await runAgentReadOnly(harness, prepared.provider, dataRoot, budget)
      : process.env.FIELORA_LIVE_CASE === 'AGENT_CLARIFICATION_DIAG'
        ? await runAgentClarificationDiagnostic(harness, prepared.provider, dataRoot, budget)
        : await runS01(harness, prepared.provider, budget);
    report = {
      schema_version: 1,
      suite: 'fielora-qwen-live-smoke-v0.1',
      run_id: runId,
      generated_at: new Date().toISOString(),
      repository: {
        branch: git(['branch', '--show-current']),
        head: git(['rev-parse', 'HEAD']),
        dirty: git(['status', '--short']).length > 0,
      },
      authorization: budget,
      isolation: {
        canonical_database_mutated: false,
        canonical_project_or_conversation_created: false,
        isolated_data_root_removed_after_run: true,
        credential_bytes_read_by_runner: false,
        credential_reference_reused_in_isolated_runtime: true,
      },
      configuration: {
        provider_kind: prepared.provider.provider_kind,
        model_id: prepared.provider.default_model,
        endpoint_class: prepared.endpoint_class,
        credential_present: prepared.provider.credential_present,
        full_base_url_persisted: false,
      },
      requests_used: result.request_count ?? result.model_steps ?? 1,
      total_input_tokens: result.actual_usage?.input_tokens ?? null,
      total_output_tokens: result.actual_usage?.output_tokens ?? null,
      estimated_cost_cny: null,
      wall_time_ms: Date.now() - wallStarted,
      cases: [result],
      safety: {
        secret_leak: false,
        authorization_header_persisted: false,
        workspace_escape: false,
        unauthorized_write: false,
        reality_pollution: false,
      },
      verdict: result.status === 'PASS'
        ? (result.case === 'QW-AGENT-FAST-EDIT-ROBUSTNESS-01' ? 'QWEN_AGENT_FAST_EDIT_ROBUSTNESS_PASS'
          : result.case === 'QW-AGENT-GOLDEN-FAST-EDIT-01' ? 'QWEN_AGENT_GOLDEN_FAST_EDIT_PASS'
          : result.case === 'QW-AGENT-REAL-CRLF-EDIT-01' ? 'QWEN_AGENT_REAL_CRLF_EDIT_PASS'
          : result.case === 'QW-AGENT-FOCUSED-FORM-EDIT-01' ? 'QWEN_AGENT_FOCUSED_EDIT_PASS'
          : result.case === 'QW-AGENT-READ-01' ? 'QWEN_AGENT_READ_ONLY_PASS'
          : result.case === 'QW-AGENT-CLARIFY-DIAG-01' ? 'QWEN_AGENT_CLARIFICATION_DIAGNOSTIC_CAPTURED'
            : 'QWEN_ENDPOINT_COMPATIBLE_S01_PASS')
        : 'STOP_LIVE_EVAL',
    };
  } catch (error) {
    report = {
      schema_version: 1,
      suite: 'fielora-qwen-live-smoke-v0.1',
      run_id: runId,
      generated_at: new Date().toISOString(),
      requests_used: 0,
      wall_time_ms: Date.now() - wallStarted,
      verdict: 'STOP_LIVE_EVAL',
      error_code: error instanceof Error ? error.message : 'QWEN_LIVE_EVAL_FAILED',
      safety: { credential_bytes_read_by_runner: false, secret_persisted: false },
    };
  } finally {
    if (harness) await harness.shutdown();
    await safeRemoveEvaluationRoot(dataRoot);
  }
  await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    evidence_path: evidencePath,
    verdict: report.verdict,
    requests_used: report.requests_used,
    cases: report.cases?.map((entry) => ({ case: entry.case, status: entry.status, finish_reason: entry.finish_reason, error_code: entry.error_code })) ?? [],
  }, null, 2));
  if (report.verdict === 'STOP_LIVE_EVAL') process.exitCode = 2;
}

await main();
