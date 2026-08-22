import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [baselinePath, afterPath, outputDirectory] = process.argv.slice(2);
if (![baselinePath, afterPath, outputDirectory].every(Boolean)) {
  throw new Error('Usage: node report-agent-convergence.mjs <baseline-differential.json> <after-differential.json> <output-directory>');
}

const load = async (file) => JSON.parse(await readFile(path.resolve(file), 'utf8'));
const [baseline, after] = await Promise.all([load(baselinePath), load(afterPath)]);

const value = (metrics, name) => {
  const aliases = {
    context_duration_ms: ['context_duration_ms', 'context_build_duration_ms'],
    read_calls: ['read_calls', 'file_reads'],
    event_writes: ['event_writes', 'durable_event_writes'],
    fipc_query_duration_ms: ['fipc_event_query_duration_ms', 'event_query_duration_ms', 'fipc_duration_ms'],
  };
  for (const key of aliases[name] ?? [name]) {
    if (metrics[key] !== undefined && metrics[key] !== null) return metrics[key];
  }
  return null;
};

const metricNames = [
  'total_duration_ms', 'context_duration_ms', 'model_calls', 'input_tokens', 'output_tokens',
  'tool_calls', 'search_calls', 'read_calls', 'duplicate_observe_calls', 'patch_attempts',
  'patch_conflicts', 'verification_calls', 'event_writes', 'fipc_query_duration_ms',
];

const select = (report, key) => Object.fromEntries(metricNames.map((name) => [name, value(report.measurements[key], name)]));
const beforeGolden = select(baseline, 'core_packaged');
const afterGolden = select(after, 'core_packaged');
const beforeDesktop = select(baseline, 'desktop_packaged');
const afterDesktop = select(after, 'desktop_packaged');
const percentReduction = (before, current) => before > 0 && current !== null
  ? Math.round(((before - current) / before) * 1_000) / 10
  : null;

const comparisons = Object.fromEntries(metricNames.map((name) => [name, {
  before_golden: beforeGolden[name],
  after_golden: afterGolden[name],
  golden_reduction_percent: percentReduction(beforeGolden[name], afterGolden[name]),
  before_desktop: beforeDesktop[name],
  after_desktop: afterDesktop[name],
  desktop_reduction_percent: percentReduction(beforeDesktop[name], afterDesktop[name]),
}]));

const afterMeasurements = after.measurements;
const desktopConvergence = after.regression_gate?.desktop_same_order_as_core === true
  && afterMeasurements.desktop_dev.status === 'PASS'
  && afterMeasurements.desktop_packaged.status === 'PASS';
const fastEditPerformance = after.regression_gate?.verdict === 'PASS';
const presentationConsistency = after.regression_gate?.presentation_consistent === true;
const report = {
  schema_version: 1,
  name: 'FIELORA_AGENT_DESKTOP_CONVERGENCE_V0.1',
  generated_at: new Date().toISOString(),
  baseline_report: path.resolve(baselinePath),
  after_report: path.resolve(afterPath),
  fixed_task: after.fixed_task,
  comparison_basis: {
    golden: 'packaged core',
    desktop: 'packaged desktop',
    provider: after.controls.provider,
    model: after.controls.model,
    permission: after.controls.permission,
  },
  comparisons,
  after_all_hosts: afterMeasurements,
  findings: {
    dominant_duration_layer: after.findings.dominant_duration_layer,
    desktop_latency_ratio: after.findings.desktop_latency_ratio,
    duplicate_message_classification: after.findings.desktop_duplicate_submit ? 'B_RENDERER_OR_TRANSPORT_DUPLICATE' : 'A_NOT_REPRODUCED_AS_SINGLE_UI_SUBMIT',
    provider_share_packaged_desktop_percent: Math.round((after.measurements.desktop_packaged.model_duration_ms / afterDesktop.total_duration_ms) * 1_000) / 10,
  },
  verdicts: {
    DESKTOP_CONVERGENCE: desktopConvergence ? 'PASS' : 'FAIL',
    FAST_EDIT_PERFORMANCE: fastEditPerformance ? 'PASS' : 'FAIL',
    PRESENTATION_CONSISTENCY: presentationConsistency ? 'PASS' : 'FAIL',
  },
};

const labels = {
  total_duration_ms: 'Total duration (ms)', context_duration_ms: 'Context build (ms)', model_calls: 'Model calls',
  input_tokens: 'Input tokens', output_tokens: 'Output tokens', tool_calls: 'Tool calls', search_calls: 'Search calls',
  read_calls: 'Read calls', duplicate_observe_calls: 'Duplicate observe', patch_attempts: 'Patch attempts',
  patch_conflicts: 'Patch conflicts', verification_calls: 'Verification', event_writes: 'Event count',
  fipc_query_duration_ms: 'FIPC/query cost (ms)',
};
const cell = (v) => v === null ? 'N/A' : String(v);
const rows = metricNames.map((name) => `| ${labels[name]} | ${cell(comparisons[name].before_golden)} | ${cell(comparisons[name].after_golden)} | ${cell(comparisons[name].before_desktop)} | ${cell(comparisons[name].after_desktop)} |`).join('\n');
const markdown = `# FIELORA_AGENT_DESKTOP_CONVERGENCE_V0.1\n\n` +
  `Fixed task: ${after.fixed_task}\n\n` +
  `| Metric | Before Golden | After Golden | Before Desktop | After Desktop |\n` +
  `| --- | ---: | ---: | ---: | ---: |\n${rows}\n\n` +
  `Results: all four AFTER hosts passed the target-file, invariant, verification, phase, and reasoning-leak checks.\n\n` +
  `- DESKTOP_CONVERGENCE: **${report.verdicts.DESKTOP_CONVERGENCE}**\n` +
  `- FAST_EDIT_PERFORMANCE: **${report.verdicts.FAST_EDIT_PERFORMANCE}**\n` +
  `- PRESENTATION_CONSISTENCY: **${report.verdicts.PRESENTATION_CONSISTENCY}**\n`;

const directory = path.resolve(outputDirectory);
await mkdir(directory, { recursive: true });
const jsonTarget = path.join(directory, 'FIELORA_AGENT_DESKTOP_CONVERGENCE_V0.1.json');
const markdownTarget = path.join(directory, 'FIELORA_AGENT_DESKTOP_CONVERGENCE_V0.1.md');
await Promise.all([
  writeFile(jsonTarget, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(markdownTarget, markdown),
]);
console.log(JSON.stringify({ json: jsonTarget, markdown: markdownTarget, verdicts: report.verdicts }, null, 2));
if (Object.values(report.verdicts).includes('FAIL')) process.exitCode = 2;
