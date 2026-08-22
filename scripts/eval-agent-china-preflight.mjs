import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'evals', 'china-model', 'CN_AGENT_MANIFEST.json');
const genericProfilePath = path.join(root, 'evals', 'china-model', 'profiles', 'generic-current.json');
const qwenProfilePath = path.join(root, 'evals', 'china-model', 'profiles', 'qwen3.7-plus-candidate.json');
const baselineSourcePaths = [
  'crates/fielora-model/src/lib.rs',
  'crates/fielora-agent/src/lib.rs',
  'crates/fielora-core/src/agent_runtime.rs',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function validateEvalDocuments(manifest, profiles) {
  const issues = [];
  if (manifest?.schema_version !== 1 || manifest?.suite !== 'fielora-cn-agent-v0.1') issues.push('MANIFEST_ID_OR_SCHEMA_INVALID');
  if (!Array.isArray(manifest?.cases) || manifest.cases.length !== 8) issues.push('MANIFEST_CASE_COUNT_INVALID');
  const ids = new Set();
  for (const entry of manifest?.cases ?? []) {
    if (!/^CN0[1-8]$/.test(entry.id ?? '')) issues.push('MANIFEST_CASE_ID_INVALID');
    if (ids.has(entry.id)) issues.push('MANIFEST_CASE_ID_DUPLICATE');
    ids.add(entry.id);
    if (!['DEVELOPMENT', 'HOLDOUT', 'HOLDOUT_SECURITY'].includes(entry.split)) issues.push('MANIFEST_SPLIT_INVALID');
    if (entry.status !== 'NOT_RUN') issues.push('UNEVALUATED_CASE_MUST_REMAIN_NOT_RUN');
    if (!Array.isArray(entry.checks) || entry.checks.length === 0) issues.push('MANIFEST_CHECKS_MISSING');
  }
  const profileIds = new Set();
  for (const profile of profiles) {
    if (profile?.schema_version !== 1 || !profile?.profile_id) issues.push('PROFILE_ID_OR_SCHEMA_INVALID');
    if (profileIds.has(profile?.profile_id)) issues.push('PROFILE_ID_DUPLICATE');
    profileIds.add(profile?.profile_id);
    if (!profile?.capability_profile || !profile?.behavior_profile) issues.push('PROFILE_LAYERS_MISSING');
  }
  if (!profileIds.has(manifest?.baseline_profile) || !profileIds.has(manifest?.candidate_profile)) issues.push('MANIFEST_PROFILE_REFERENCE_INVALID');
  return [...new Set(issues)];
}

export function assessQwenConfigs(providers) {
  const matching = providers.filter((provider) => /^qwen/i.test(provider.default_model ?? '') && provider.lifecycle_status !== 'REMOVED');
  const configs = matching.map((provider) => {
    const issues = [];
    let endpointClass = 'MISSING';
    if (provider.lifecycle_status !== 'ACTIVE') issues.push('PROVIDER_NOT_ACTIVE');
    if (!provider.credential_present) issues.push('CREDENTIAL_NOT_PRESENT');
    if (provider.default_model !== 'qwen3.7-plus') issues.push('MODEL_ID_MUST_BE_EXACT_QWEN3_7_PLUS');
    if (provider.provider_kind !== 'OPENAI_COMPATIBLE') issues.push('QWEN_REQUIRES_OPENAI_COMPATIBLE_PROTOCOL');
    if (typeof provider.base_url !== 'string' || !provider.base_url.startsWith('https://')) {
      issues.push('HTTPS_BASE_URL_REQUIRED');
    } else {
      try {
        const hostname = new URL(provider.base_url).hostname.toLowerCase();
        if (hostname === 'coding.dashscope.aliyuncs.com'
          || hostname === 'coding-intl.dashscope.aliyuncs.com') {
          endpointClass = 'ALIBABA_CODING_PLAN';
          issues.push('CODING_PLAN_AUTOMATED_EVAL_PROHIBITED');
        } else if (hostname === 'dashscope.aliyuncs.com'
          || hostname === 'dashscope-us.aliyuncs.com'
          || hostname === 'dashscope-intl.aliyuncs.com'
          || hostname.endsWith('.maas.aliyuncs.com')
          || hostname.endsWith('.dashscope.aliyuncs.com')) {
          endpointClass = 'ALIBABA_MODEL_STUDIO';
        } else {
          endpointClass = 'OTHER_HTTPS';
          issues.push('DASHSCOPE_ENDPOINT_CLASS_REQUIRED');
        }
      } catch {
        endpointClass = 'INVALID';
        issues.push('HTTPS_BASE_URL_REQUIRED');
      }
    }
    return {
      config_id: provider.id,
      display_name: provider.display_name,
      provider_kind: provider.provider_kind,
      model_id: provider.default_model,
      lifecycle_status: provider.lifecycle_status,
      credential_present: Boolean(provider.credential_present),
      base_url_present: typeof provider.base_url === 'string' && provider.base_url.length > 0,
      endpoint_class: endpointClass,
      status: endpointClass === 'ALIBABA_CODING_PLAN'
        ? 'INTERACTIVE_CODING_READY_NOT_EVAL_ELIGIBLE'
        : issues.length === 0 ? 'READY_FOR_BOUNDED_LIVE_AUTHORIZATION' : 'CONFIGURATION_BLOCKED',
      issues,
    };
  });
  return {
    matching_configs: configs.length,
    ready_configs: configs.filter((entry) => entry.status === 'READY_FOR_BOUNDED_LIVE_AUTHORIZATION').length,
    interactive_ready_configs: configs.filter((entry) => entry.status === 'INTERACTIVE_CODING_READY_NOT_EVAL_ELIGIBLE').length,
    configs,
  };
}

const chinaModelFamilies = [
  { family: 'QWEN', model: /^qwen/i, hosts: ['dashscope.aliyuncs.com', 'dashscope-us.aliyuncs.com', 'dashscope-intl.aliyuncs.com'], hostSuffixes: ['.maas.aliyuncs.com', '.dashscope.aliyuncs.com'], interactiveHosts: ['coding.dashscope.aliyuncs.com', 'coding-intl.dashscope.aliyuncs.com'] },
  { family: 'DEEPSEEK', model: /^deepseek/i, hosts: ['api.deepseek.com'], hostSuffixes: [] },
  { family: 'KIMI', model: /^(kimi|moonshot)/i, hosts: ['api.moonshot.cn'], hostSuffixes: [] },
  { family: 'GLM', model: /^glm-/i, hosts: ['open.bigmodel.cn'], hostSuffixes: [] },
  { family: 'MINIMAX', model: /^minimax-/i, hosts: ['api.minimaxi.com', 'api.minimax.io'], hostSuffixes: [] },
  { family: 'DOUBAO', model: /^doubao[-_]/i, hosts: ['ark.cn-beijing.volces.com'], hostSuffixes: [] },
];

export function assessChinaModelConfigs(providers) {
  const families = chinaModelFamilies.map((descriptor) => {
    const configs = providers
      .filter((provider) => provider.lifecycle_status !== 'REMOVED' && descriptor.model.test(provider.default_model ?? ''))
      .map((provider) => {
        const issues = [];
        let endpointClass = 'MISSING';
        if (provider.lifecycle_status !== 'ACTIVE') issues.push('PROVIDER_NOT_ACTIVE');
        if (!provider.credential_present) issues.push('CREDENTIAL_NOT_PRESENT');
        if (provider.provider_kind !== 'OPENAI_COMPATIBLE') issues.push('OPENAI_COMPATIBLE_PROTOCOL_REQUIRED');
        if (typeof provider.base_url !== 'string' || !provider.base_url.startsWith('https://')) {
          issues.push('HTTPS_BASE_URL_REQUIRED');
        } else {
          try {
            const hostname = new URL(provider.base_url).hostname.toLowerCase();
            const interactiveOnly = (descriptor.interactiveHosts ?? []).includes(hostname);
            const official = descriptor.hosts.includes(hostname)
              || descriptor.hostSuffixes.some((suffix) => hostname.endsWith(suffix));
            endpointClass = interactiveOnly ? 'CODING_PLAN_INTERACTIVE_ONLY' : official ? 'OFFICIAL_PROVIDER' : 'OTHER_HTTPS';
            if (interactiveOnly) issues.push('CODING_PLAN_AUTOMATED_EVAL_PROHIBITED');
            else if (!official) issues.push('OFFICIAL_ENDPOINT_CLASS_REQUIRED_FOR_LIVE_EVAL');
          } catch {
            endpointClass = 'INVALID';
            issues.push('HTTPS_BASE_URL_REQUIRED');
          }
        }
        return {
          config_id: provider.id,
          display_name: provider.display_name,
          provider_kind: provider.provider_kind,
          model_id: provider.default_model,
          lifecycle_status: provider.lifecycle_status,
          credential_present: Boolean(provider.credential_present),
          base_url_present: typeof provider.base_url === 'string' && provider.base_url.length > 0,
          endpoint_class: endpointClass,
          status: endpointClass === 'CODING_PLAN_INTERACTIVE_ONLY'
            ? 'INTERACTIVE_CODING_READY_NOT_EVAL_ELIGIBLE'
            : issues.length === 0 ? 'READY_FOR_SEPARATE_BOUNDED_LIVE_EVAL' : 'CONFIGURATION_BLOCKED',
          issues,
        };
      });
    return {
      family: descriptor.family,
      configured: configs.length,
      ready: configs.filter((config) => config.status === 'READY_FOR_SEPARATE_BOUNDED_LIVE_EVAL').length,
      interactive_ready: configs.filter((config) => config.status === 'INTERACTIVE_CODING_READY_NOT_EVAL_ELIGIBLE').length,
      configs,
    };
  });
  return {
    configured_families: families.filter((family) => family.configured > 0).length,
    ready_families: families.filter((family) => family.ready > 0).length,
    interactive_ready_families: families.filter((family) => family.interactive_ready > 0).length,
    families,
  };
}

export function assessLiveAuthorization(environment) {
  const required = ['LIVE_PROVIDER_CALLS', 'PROVIDER', 'MODEL', 'MAX_TOTAL_REQUESTS', 'MAX_TOTAL_COST_CNY', 'MAX_WALL_TIME_SECONDS'];
  const presence = Object.fromEntries(required.map((name) => [name, typeof environment[name] === 'string' && environment[name].length > 0]));
  const positiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0;
  const positiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
  const authorized = environment.LIVE_PROVIDER_CALLS === 'AUTHORIZED'
    && /^qwen(?:\/dashscope)?$/i.test(environment.PROVIDER ?? '')
    && /^qwen3\.7-plus$/i.test(environment.MODEL ?? '')
    && positiveInteger(environment.MAX_TOTAL_REQUESTS)
    && positiveNumber(environment.MAX_TOTAL_COST_CNY)
    && positiveInteger(environment.MAX_WALL_TIME_SECONDS);
  return {
    status: authorized ? 'AUTHORIZED_NOT_RUN' : 'NOT_AUTHORIZED',
    required_presence: presence,
    values_valid: authorized,
    bound: authorized ? {
      max_total_requests: Number(environment.MAX_TOTAL_REQUESTS),
      max_total_cost_cny: Number(environment.MAX_TOTAL_COST_CNY),
      max_wall_time_seconds: Number(environment.MAX_WALL_TIME_SECONDS),
      max_estimated_input_tokens_per_request: 120000,
      max_output_tokens_per_request: 12000,
    } : null,
  };
}

function gitValue(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : 'UNKNOWN';
}

async function queryProviderConfigs() {
  const core = path.join(root, 'target', 'debug', 'fielora-core.exe');
  if (!existsSync(core)) throw new Error('CORE_DEBUG_BINARY_MISSING');
  const environment = { ...process.env, FIELORA_E2E: '0' };
  delete environment.FIELORA_DATA_DIR;
  const child = spawn(core, ['--development'], {
    cwd: root,
    env: environment,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  let sequence = 0;
  lines.on('line', (line) => {
    let frame;
    try { frame = JSON.parse(line); } catch { return; }
    const waiter = frame.id ? pending.get(frame.id) : null;
    if (!waiter) return;
    pending.delete(frame.id);
    clearTimeout(waiter.timer);
    if (frame.error) waiter.reject(new Error(String(frame.error.code ?? 'CORE_REQUEST_FAILED')));
    else waiter.resolve(frame.result);
  });
  child.on('exit', () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('CORE_EXITED_BEFORE_RESPONSE'));
    }
    pending.clear();
  });
  function request(method, params = {}, deadlineMs = 15_000) {
    const id = `china-model-preflight-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('CORE_REQUEST_TIMEOUT'));
      }, deadlineMs + 1_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
        _meta: { protocol: '1.0', trace_id: randomUUID(), deadline_ms: deadlineMs },
      })}\n`);
    });
  }
  try {
    await request('system.hello');
    return await request('query.provider.list_configs');
  } finally {
    try { await request('system.shutdown', {}, 5_000); } catch {}
    child.stdin.end();
    lines.close();
  }
}

export async function runPreflight(environment = process.env) {
  const [manifestText, genericText, qwenText, ...baselineSourceTexts] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(genericProfilePath, 'utf8'),
    readFile(qwenProfilePath, 'utf8'),
    ...baselineSourcePaths.map((relative) => readFile(path.join(root, relative), 'utf8')),
  ]);
  const manifest = JSON.parse(manifestText);
  const genericProfile = JSON.parse(genericText);
  const qwenProfile = JSON.parse(qwenText);
  const documentIssues = validateEvalDocuments(manifest, [genericProfile, qwenProfile]);
  const providers = await queryProviderConfigs();
  const qwen = assessQwenConfigs(providers);
  const chinaModels = assessChinaModelConfigs(providers);
  const live = assessLiveAuthorization(environment);
  const configReady = qwen.ready_configs > 0;
  const codingPlanReady = qwen.interactive_ready_configs > 0;
  const nextStatus = codingPlanReady
    ? 'QWEN_CODING_PLAN_INTERACTIVE_READY_AUTOMATED_EVAL_BLOCKED'
    : configReady
    ? (live.status === 'AUTHORIZED_NOT_RUN' ? 'READY_FOR_SEPARATE_BOUNDED_LIVE_SMOKE' : 'READY_FOR_LIVE_QWEN_EVAL_AUTHORIZATION_REQUIRED')
    : 'QWEN_CONFIGURATION_BLOCKED';
  return {
    suite: 'fielora-china-model-preflight-v0.1',
    generated_at: new Date().toISOString(),
    external_model_requests: 0,
    credential_bytes_read_by_preflight: false,
    repository: {
      branch: gitValue(['branch', '--show-current']),
      head: gitValue(['rev-parse', 'HEAD']),
      dirty: gitValue(['status', '--short']).length > 0,
    },
    documents: {
      status: documentIssues.length === 0 ? 'PASS' : 'FAIL',
      issues: documentIssues,
      manifest_sha256: sha256(manifestText),
      generic_profile_sha256: sha256(genericText),
      qwen_candidate_sha256: sha256(qwenText),
      baseline_source_sha256: Object.fromEntries(baselineSourcePaths.map((relative, index) => [relative, sha256(baselineSourceTexts[index])])),
      unevaluated_cases: manifest.cases.filter((entry) => entry.status === 'NOT_RUN').length,
      holdout_cases: manifest.cases.filter((entry) => entry.split.startsWith('HOLDOUT')).length,
    },
    qwen_configuration: qwen,
    china_model_configuration: chinaModels,
    live_authorization: live,
    verdict: documentIssues.length > 0 ? 'PREFLIGHT_FAILED' : nextStatus,
    effective_live_bound: live.bound,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const report = await runPreflight();
    console.log(JSON.stringify(report, null, 2));
    if (report.documents.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({
      suite: 'fielora-china-model-preflight-v0.1',
      external_model_requests: 0,
      verdict: 'PREFLIGHT_FAILED',
      error_code: error instanceof Error ? error.message : 'PREFLIGHT_FAILED',
    }, null, 2));
    process.exitCode = 1;
  }
}
