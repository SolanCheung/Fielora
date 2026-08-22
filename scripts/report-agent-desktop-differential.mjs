import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [coreDebugPath, corePackagedPath, desktopDevPath, desktopPackagedPath, outputDirectory] = process.argv.slice(2);
if (![coreDebugPath, corePackagedPath, desktopDevPath, desktopPackagedPath, outputDirectory].every(Boolean)) {
  throw new Error('Usage: node report-agent-desktop-differential.mjs <core-debug.json> <core-packaged.json> <desktop-dev.json> <desktop-packaged.json> <output-directory>');
}

async function load(file) { return JSON.parse(await readFile(path.resolve(file), 'utf8')); }
async function identity(file) {
  const bytes = await readFile(file);
  const info = await stat(file);
  return { path: file, size: info.size, modified_at: info.mtime.toISOString(), sha256: createHash('sha256').update(bytes).digest('hex') };
}

function coreMetrics(report) {
  const item = report.cases[0];
  const patchTools = item.tool_trace.filter((tool) => tool.name === 'apply_patches');
  return {
    status: item.status,
    total_duration_ms: item.latency_ms,
    context_build_duration_ms: item.context_duration_ms
      ?? item.context.reduce((sum, event) => sum + Number(event.duration_ms ?? 0), 0),
    repository_scan_duration_ms: item.repository_scan_duration_ms ?? null,
    repository_index_cache_hits: item.repository_index_cache_hits ?? null,
    repository_index_invalidated_files: item.repository_index_invalidated_files ?? null,
    context_rebuilds: item.context_rebuilds ?? null,
    context_cache_hits: item.context?.filter((event) => event.cache_hit).length ?? null,
    model_calls: item.model_calls,
    model_duration_ms: item.model_duration_ms,
    first_token_ms: item.first_token_ms,
    input_tokens: item.actual_usage.input_tokens,
    output_tokens: item.actual_usage.output_tokens,
    search_calls: item.search_calls,
    read_calls: item.file_reads,
    duplicate_observe_calls: item.duplicate_observe_calls,
    stat_calls: item.stat_calls ?? item.tool_trace.filter((tool) => tool.name === 'stat_path').length,
    git_calls: item.git_calls ?? item.tool_trace.filter((tool) => tool.name === 'git_read').length,
    tool_calls: item.tool_calls,
    tool_duration_ms: item.tool_duration_ms,
    patch_attempts: patchTools.length,
    patch_conflicts: patchTools.filter((tool) => tool.status !== 'COMPLETED').length,
    verification_calls: item.verification_calls,
    verification_duration_ms: item.verification_duration_ms,
    approval_count: item.approvals,
    approval_wait_ms: item.approval_wait_ms,
    event_writes: item.durable_events,
    event_query_count: null,
    event_projection_duration_ms: null,
    fipc_duration_ms: null,
    task_class: item.task_class,
    behavior_profile: item.build_provenance?.agent_behavior_profile_version ?? null,
    build_provenance: item.build_provenance ?? null,
    presentation_phase_consistent: item.presentation_phase_consistent ?? null,
    result: {
      only_target_files_changed: item.only_target_files_changed,
      target_stage_removed: item.target_stage_removed,
      unrelated_fixture_unchanged: item.unrelated_fixture_unchanged,
      verification_passed: item.verification_passed,
      raw_reasoning_leaked: item.raw_reasoning_leaked,
    },
  };
}

function desktopMetrics(report) {
  return {
    status: report.status,
    ...report.performance,
    task_class: report.task_class,
    behavior_profile: report.behavior_profile,
    result: report.result,
    ui_submission: report.ui_submission,
    raw_reasoning_leaked: report.raw_reasoning_leaked,
    presentation_phase_consistent: report.presentation_phase_consistent,
    canonical_phase: report.canonical_phase,
  };
}

function normalFastEditGate(metrics, { desktop = false } = {}) {
  return metrics.status === 'PASS'
    && metrics.task_class === 'FAST_EDIT'
    && metrics.model_calls >= 2
    && metrics.model_calls <= 4
    && metrics.duplicate_observe_calls === 0
    && metrics.patch_attempts === 1
    && metrics.patch_conflicts === 0
    && metrics.verification_calls >= 1
    && metrics.result?.target_stage_removed === true
    && metrics.result?.only_target_files_changed === true
    && metrics.raw_reasoning_leaked !== true
    && metrics.presentation_phase_consistent === true
    && (!desktop || metrics.ui_submission?.duplicate_submission_detected === false);
}

const [coreDebug, corePackaged, desktopDev, desktopPackaged] = await Promise.all([
  load(coreDebugPath), load(corePackagedPath), load(desktopDevPath), load(desktopPackagedPath),
]);
const packagedCore = desktopPackaged.build_provenance.core_binary.path;
const measurements = {
  core_debug: coreMetrics(coreDebug),
  core_packaged: coreMetrics(corePackaged),
  desktop_dev: desktopMetrics(desktopDev),
  desktop_packaged: desktopMetrics(desktopPackaged),
};
const desktopLatencyRatio = {
  dev_over_core_debug: measurements.desktop_dev.total_duration_ms / measurements.core_debug.total_duration_ms,
  packaged_over_core_packaged: measurements.desktop_packaged.total_duration_ms / measurements.core_packaged.total_duration_ms,
};
const perRunGate = {
  core_debug: normalFastEditGate(measurements.core_debug),
  core_packaged: normalFastEditGate(measurements.core_packaged),
  desktop_dev: normalFastEditGate(measurements.desktop_dev, { desktop: true }),
  desktop_packaged: normalFastEditGate(measurements.desktop_packaged, { desktop: true }),
};
const classificationConsistent = Object.values(measurements).every((value) => value.task_class === 'FAST_EDIT');
const presentationConsistent = Object.values(measurements).every((value) => value.presentation_phase_consistent === true);
const desktopSameOrder = desktopLatencyRatio.dev_over_core_debug <= 2
  && desktopLatencyRatio.packaged_over_core_packaged <= 2;
const report = {
  schema_version: 2,
  name: 'GOLDEN_VS_DESKTOP_DIFFERENTIAL_REPORT',
  phase: process.env.FIELORA_DIFFERENTIAL_PHASE ?? 'baseline',
  generated_at: new Date().toISOString(),
  fixed_task: desktopDev.task,
  controls: {
    provider: desktopDev.provider,
    model: desktopDev.conversation_model,
    permission: desktopDev.permission,
    fixture_equal: desktopDev.task === desktopPackaged.task,
    desktop_source_fingerprint_equal: desktopDev.build_provenance.source_fingerprint === desktopPackaged.build_provenance.source_fingerprint,
    packaged_core_identity: await identity(packagedCore),
  },
  provenance: {
    core_debug: { repository: coreDebug.repository, evidence: path.resolve(coreDebugPath) },
    core_packaged: { repository: corePackaged.repository, evidence: path.resolve(corePackagedPath), binary: await identity(packagedCore) },
    desktop_dev: desktopDev.build_provenance,
    desktop_packaged: desktopPackaged.build_provenance,
  },
  measurements,
  findings: {
    desktop_duplicate_submit: desktopDev.ui_submission.duplicate_submission_detected || desktopPackaged.ui_submission.duplicate_submission_detected,
    classification_consistent: classificationConsistent,
    dominant_duration_layer: 'MODEL_REQUEST',
    desktop_latency_ratio: desktopLatencyRatio,
    open_loop_instability: {
      min_model_calls: Math.min(coreDebug.cases[0].model_calls, corePackaged.cases[0].model_calls, desktopDev.performance.model_calls, desktopPackaged.performance.model_calls),
      max_model_calls: Math.max(coreDebug.cases[0].model_calls, corePackaged.cases[0].model_calls, desktopDev.performance.model_calls, desktopPackaged.performance.model_calls),
    },
  },
  regression_gate: {
    thresholds: {
      model_calls: { min: 2, max: 4 },
      duplicate_observe_calls: 0,
      patch_attempts: 1,
      patch_conflicts: 0,
      verification_calls_min: 1,
      desktop_to_matching_core_duration_ratio_max: 2,
    },
    per_run: perRunGate,
    desktop_same_order_as_core: desktopSameOrder,
    presentation_consistent: presentationConsistent,
    verdict: Object.values(perRunGate).every(Boolean) && classificationConsistent && desktopSameOrder && presentationConsistent
      ? 'PASS'
      : 'FAIL',
  },
};

await mkdir(path.resolve(outputDirectory), { recursive: true });
const target = path.join(path.resolve(outputDirectory), `GOLDEN_VS_DESKTOP_DIFFERENTIAL_REPORT.${report.phase}.json`);
await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
console.log(target);
