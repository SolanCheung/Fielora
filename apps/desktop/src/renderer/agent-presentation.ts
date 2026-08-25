import type { AgentEventView, AgentRunView, AgentToolCallView } from '@fielora/contracts';

export type AgentWorkPhaseState = 'completed' | 'active' | 'pending' | 'failed' | 'blocked' | 'skipped';

export interface AgentWorkPhase {
  id: 'UNDERSTAND' | 'INSPECT' | 'SCOPE' | 'MODIFY' | 'VERIFY' | 'VERSION' | 'EXECUTE' | 'FINISH';
  label: string;
  detail: string;
  state: AgentWorkPhaseState;
}

export interface AgentPresentation {
  headline: string;
  narrative: string;
  elapsed: string;
  summary: string[];
  phases: AgentWorkPhase[];
  changedFiles: number;
  passedVerifications: number;
  canonicalPhase: boolean;
  activeStep: number;
  totalSteps: number;
  primaryChange: 'CREATE' | 'MODIFY' | 'DELETE' | 'RENAME' | null;
  outcome: 'RUNNING' | 'SUCCESS' | 'SUCCESS_WITH_WARNING' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
}

export interface AgentResultViewModel {
  outcome: AgentPresentation['outcome'];
  title: string;
  detail: string;
  evidence: string[];
  duration: string;
  changedFiles: number;
  verificationPassed: boolean;
}

export type AgentTerminalStatus = 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type AgentRequestKind = 'ANSWER' | 'ACTION';

/**
 * Presentation routing is intentionally conservative: an explicit answer-only
 * instruction always wins, while requests that ask Fielora to change or run
 * something retain the existing Agent lifecycle.
 */
export function agentRequestKind(task: string): AgentRequestKind {
  const normalized = task.replace(/\s+/g, ' ').trim();
  if (/只(?:需)?回答|仅(?:需)?回答|直接回答/u.test(normalized)) return 'ANSWER';
  const actionSource = normalized.replace(/(?:不要|不需要|无需)(?:修改|改动|写入|执行|运行)(?:其他|任何|项目|文件|代码|内容|命令)*/gu, '');
  if (/(?:修改|改成|调整|新增|添加|删除|移除|修复|实现|重构|创建|写入|替换|恢复|提交|执行|运行|验证|测试|安装|更新|启动|停止|搜索|查找|定位|检查)(?:一下|这个|这些|项目|文件|代码|页面|功能|测试|命令|实现|问题|配置)?/u.test(actionSource)) return 'ACTION';
  if (/不要(?:修改|改动|写入|执行|运行)|不(?:需要|要)(?:修改|改动|写入|执行|运行)|无需(?:修改|改动|写入|执行|运行)/u.test(normalized)) return 'ANSWER';
  if (/(?:回答|解释|说明|概括|总结|介绍|是什么|为什么|是否|有哪些|怎么样|如何理解|项目状态|技术栈)/u.test(normalized)) return 'ANSWER';
  return 'ACTION';
}

export function stripTerminalHeading(content: string): string {
  return content.replace(/^\s{0,3}#{1,6}\s+[^\r\n]+\r?\n(?:\s*\r?\n)?/, '').trim();
}

export function agentTerminalTitle(status: AgentTerminalStatus, presentation: AgentPresentation | null): string {
  if (status === 'FAILED') return presentation && presentation.changedFiles > 0 ? '只完成了部分修改' : '这次没有完成';
  if (status === 'CANCELLED') return '这次工作已停止';
  if (presentation?.headline === '目标状态已经满足' || presentation?.headline === '未执行修改') return '无需修改';
  if (presentation?.primaryChange === 'CREATE') return '已经创建文件';
  if (presentation?.primaryChange === 'DELETE') return '已完成删除';
  if (presentation?.primaryChange === 'RENAME') return '已完成重命名';
  if (presentation && presentation.changedFiles > 0) return '已完成修改';
  if (presentation && presentation.passedVerifications > 0) return '已完成验证';
  return '已经完成';
}

function naturalResultParagraph(content: string): string {
  const generic = /^(?:Fielora Agent fixture|任务(?:已经)?完成|处理完成)[。.!\s]/i;
  const paragraphs = stripTerminalHeading(content)
    .split(/\r?\n\s*\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value
      && !/^(?:[-*+]\s|\d+[.)]\s|```|#{1,6}\s)/.test(value)
      && !/^\*\*[^*\r\n]+(?:[:：]\*\*|\*\*\s*[:：])/.test(value)
      && !/^(?:修改|验证|文件|结果)[:：]/.test(value)
      && !generic.test(value));
  return paragraphs.slice(0, 2).join('\n\n')
    .replace(/\*\*([^*\r\n]+)\*\*/g, '$1')
    .replace(/__([^_\r\n]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\r\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\r\n]+)_(?!_)/g, '$1');
}

export function agentTerminalBody(status: AgentTerminalStatus, content: string, presentation: AgentPresentation | null): string {
  const persistedBody = naturalResultParagraph(content);
  if (status !== 'COMPLETED' || presentation?.headline === '目标状态已经满足' || presentation?.headline === '未执行修改') {
    return presentation?.narrative || persistedBody;
  }
  return persistedBody || presentation?.narrative || '本次任务已经完成。';
}

export function buildAgentResultViewModel(
  status: AgentTerminalStatus,
  content: string,
  presentation: AgentPresentation | null,
  tools: readonly AgentToolCallView[] = [],
): AgentResultViewModel {
  const evidence: string[] = [];
  if (presentation?.changedFiles) {
    const changeLabel = presentation.primaryChange === 'CREATE' ? '新增'
      : presentation.primaryChange === 'DELETE' ? '删除'
        : presentation.primaryChange === 'RENAME' ? '重命名'
          : '修改';
    evidence.push(`${presentation.changedFiles} 个文件${changeLabel}`);
  }
  if (presentation?.passedVerifications) evidence.push('验证通过');
  const concrete = concreteTerminalResult(status, presentation, tools);
  return {
    outcome: presentation?.outcome ?? (status === 'COMPLETED' ? 'SUCCESS' : status),
    title: concrete?.title ?? agentTerminalTitle(status, presentation),
    detail: concrete?.detail ?? agentTerminalBody(status, content, presentation),
    evidence,
    duration: presentation?.elapsed ?? '',
    changedFiles: presentation?.changedFiles ?? 0,
    verificationPassed: Boolean(presentation?.passedVerifications),
  };
}

function fileName(path: string): string {
  return path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path;
}

function boundedInline(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized && normalized.length <= 180 ? normalized : null;
}

function concreteTerminalResult(
  status: AgentTerminalStatus,
  presentation: AgentPresentation | null,
  tools: readonly AgentToolCallView[],
): { title: string; detail: string } | null {
  if (status !== 'COMPLETED' || !presentation?.primaryChange || presentation.changedFiles < 1) return null;
  const mutations = tools.filter((tool) => tool.status === 'COMPLETED' && ['WORKSPACE_WRITE', 'DESTRUCTIVE'].includes(tool.effect));
  const mutation = mutations.at(-1);
  if (!mutation?.arguments || typeof mutation.arguments !== 'object') return null;
  const root = mutation.arguments as Record<string, unknown>;
  const patch = Array.isArray(root.patches) && root.patches[0] && typeof root.patches[0] === 'object'
    ? root.patches[0] as Record<string, unknown>
    : root;
  const path = typeof patch.path === 'string' ? patch.path : typeof root.to === 'string' ? root.to : argumentPaths(mutation).at(-1);
  if (!path) return null;
  const name = fileName(path);
  const verification = [...tools].reverse().find((tool) => tool.status === 'COMPLETED' && tool.effect === 'PROCESS' && receiptPassed(tool));
  const command = verification ? boundedInline(toolDetail(verification)) : null;
  const scope = presentation.changedFiles === 1 ? '没有修改其他文件。' : `本次共涉及 ${presentation.changedFiles} 个文件。`;
  const verified = command ? `并已通过 \`${command}\`；` : '';

  if (presentation.primaryChange === 'CREATE') {
    const created = boundedInline(patch.content ?? root.content);
    return {
      title: `已创建 ${name}`,
      detail: `${created ? `文件内容为 \`${created}\`，` : '目标内容已经写入，'}${verified}${scope}`,
    };
  }
  if (presentation.primaryChange === 'DELETE') return { title: `已删除 ${name}`, detail: `${verified}${scope}` };
  if (presentation.primaryChange === 'RENAME') {
    const previous = typeof root.from === 'string' ? fileName(root.from) : null;
    return { title: previous ? `已将 ${previous} 重命名为 ${name}` : `已重命名为 ${name}`, detail: `${verified}${scope}` };
  }

  const replacement = Array.isArray(patch.replacements) && patch.replacements[0] && typeof patch.replacements[0] === 'object'
    ? patch.replacements[0] as Record<string, unknown>
    : patch;
  const before = boundedInline(replacement.old_text);
  const after = boundedInline(replacement.new_text);
  return {
    title: `已更新 ${name}`,
    detail: `${before && after ? `已将 \`${before}\` 调整为 \`${after}\`，` : '目标修改已经应用，'}${verified}${scope}`,
  };
}

export function agentOpeningNarrative(presentation: AgentPresentation): string {
  return presentation.narrative;
}

export function toolTitle(name: string): string {
  const labels: Record<string, string> = {
    list_files: '查看项目文件', read_file: '读取文件', search_text: '搜索代码', stat_path: '检查文件信息', run_command: '运行验证',
    create_file: '创建文件', replace_text: '修改文件', apply_patches: '批量修改文件', write_file: '写入文件', delete_file: '删除文件', move_file: '移动文件',
    git_read: '检查 Git 变更', git_status: '检查 Git 状态', git_stage: '暂存变更', git_unstage: '取消暂存',
    git_commit: '创建 Git 提交', git_push: '推送分支', git_create_branch: '创建分支', git_switch_branch: '切换分支',
  };
  return labels[name] ?? name.replaceAll('_', ' ');
}

export function toolDetail(tool: AgentToolCallView): string {
  if (!tool.arguments || typeof tool.arguments !== 'object') return toolTitle(tool.name);
  const values = tool.arguments as Record<string, unknown>;
  let detail = '';
  if (tool.name === 'run_command') detail = [values.program, ...(Array.isArray(values.argv) ? values.argv.slice(0, 5) : [])].filter(Boolean).map(String).join(' ');
  else if (Array.isArray(values.paths)) detail = values.paths.slice(0, 3).map(String).join('、');
  else if (Array.isArray(values.patches)) detail = values.patches.slice(0, 3).map((patch) => patch && typeof patch === 'object' && 'path' in patch ? String((patch as { path: unknown }).path) : '').filter(Boolean).join('、');
  else if (typeof values.path === 'string') detail = values.path;
  else if (typeof values.from === 'string' && typeof values.to === 'string') detail = `${values.from} → ${values.to}`;
  else if (typeof values.branch === 'string') detail = values.branch;
  else if (typeof values.objective === 'string') detail = values.objective;
  return (detail || toolTitle(tool.name)).slice(0, 140);
}

export function approvalActionLabel(tool: AgentToolCallView | null): string {
  if (!tool) return '允许一次';
  if (tool.effect === 'PROCESS') return '允许运行';
  if (tool.effect === 'DESTRUCTIVE') return '允许删除';
  if (tool.effect === 'WORKSPACE_WRITE') return '允许修改';
  if (tool.name.startsWith('git_')) return '允许 Git 操作';
  return '允许一次';
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 1) return '不到 1 秒';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

export function agentCompletionTimeLabel(timestamp: number, completed = true): string {
  const value = new Date(timestamp);
  if (!Number.isFinite(timestamp) || Number.isNaN(value.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  const date = `${value.getFullYear()}/${pad(value.getMonth() + 1)}/${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  return `${completed ? '完成于' : '结束于'} ${date} ${time}`;
}

function receiptPassed(tool: AgentToolCallView): boolean {
  if (!tool.receipt || typeof tool.receipt !== 'object') return false;
  const receipt = tool.receipt as { verification_eligible?: unknown; success?: unknown };
  return receipt.verification_eligible === true && receipt.success === true;
}

function argumentPaths(tool: AgentToolCallView): string[] {
  if (!tool.arguments || typeof tool.arguments !== 'object') return [];
  const values = tool.arguments as Record<string, unknown>;
  const paths = Array.isArray(values.paths) ? values.paths.filter((value): value is string => typeof value === 'string') : [];
  if (Array.isArray(values.patches)) {
    for (const patch of values.patches) {
      if (patch && typeof patch === 'object' && 'path' in patch && typeof (patch as { path: unknown }).path === 'string') {
        paths.push((patch as { path: string }).path);
      }
    }
  }
  for (const key of ['path', 'from', 'to']) if (typeof values[key] === 'string') paths.push(values[key]);
  return paths;
}

type PhaseId = AgentWorkPhase['id'];

function phaseIdForTool(tool: AgentToolCallView): PhaseId {
  if (tool.name.startsWith('git_')) return 'VERSION';
  if (tool.effect === 'OBSERVE') return 'INSPECT';
  if (tool.effect === 'WORKSPACE_WRITE' || tool.effect === 'DESTRUCTIVE') return 'MODIFY';
  if (tool.effect === 'PROCESS') return 'VERIFY';
  return 'EXECUTE';
}

function phaseDetail(tools: AgentToolCallView[]): string {
  const latest = tools.at(-1)!;
  const suffix = tools.length > 1 ? ` · ${tools.length} 项操作` : '';
  return `${toolDetail(latest)}${suffix}`;
}

function failureNarrative(errorCode: string | null, changedFiles: number): string {
  const cause = ({
    PROVIDER_PROTOCOL_ERROR: '模型服务没有接受或没有正确返回本次请求。',
    PROVIDER_RATE_LIMITED: '模型服务暂时繁忙。',
    CREDENTIAL_REJECTED: '当前模型凭据没有通过验证，请更新模型设置后重试。',
    AGENT_MAX_STEPS: '这次工作达到了步骤上限，还没有形成完整结果。',
    AGENT_MAX_STEPS_REACHED: '这次工作达到了步骤上限，还没有形成完整结果。',
    AGENT_FILE_CHANGED: '文件在写入前确实发生了变化，Agent 没有覆盖新内容。',
    AGENT_TEXT_MATCH_FAILED: '这次精确修改没有唯一匹配，Agent 已改用更明确的行范围继续处理。',
    AGENT_PATCH_CONFLICT: '修改范围存在歧义，Agent 没有扩大写入范围。',
    FAST_EDIT_EVIDENCE_RECOVERY_FAILED: '补充读取目标范围时失败，现有证据不足以安全修改。',
    FAST_EDIT_CHANGESET_INVALID: '自动补充证据并重试后，修改范围仍不能通过安全校验。',
    FAST_EDIT_PATCH_RETRY_EXHAUSTED: '文件在修改前持续变化，Agent 已停止重试并保留现状。',
  } as Record<string, string>)[errorCode ?? ''] ?? '工作在形成完整结果前中断了。';
  return changedFiles > 0
    ? `${cause} 项目中已有 ${changedFiles} 个文件发生变化，建议先查看修改再决定是否继续。`
    : `${cause} 项目文件没有发生变化。`;
}

type CanonicalPhaseName = 'LOCATE' | 'EDIT' | 'VERIFY' | 'FINALIZE';
type CanonicalPhaseStatus = 'NOT_STARTED' | 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'BLOCKED' | 'SKIPPED';

interface CanonicalPhasePayload {
  active_phase: CanonicalPhaseName;
  phases: Record<CanonicalPhaseName, CanonicalPhaseStatus>;
  fact?: { narrative_key?: string; target_entity?: string | null; candidate_files?: number; affected_files?: number; changed_files?: number; evidence_files?: number; context_confidence?: string; no_change?: boolean };
}

function canonicalPayload(events: readonly AgentEventView[]): CanonicalPhasePayload | null {
  const event = [...events].reverse().find((item) => item.kind === 'PHASE_CHANGED');
  if (!event?.payload || typeof event.payload !== 'object') return null;
  const payload = event.payload as Partial<CanonicalPhasePayload>;
  if (!payload.active_phase || !payload.phases) return null;
  return payload as CanonicalPhasePayload;
}

function resultOutcome(run: AgentRunView, events: readonly AgentEventView[], changedFiles: number): AgentPresentation['outcome'] {
  const completed = [...events].reverse().find((event) => event.kind === 'RUN_COMPLETED');
  const explicit = completed?.payload && typeof completed.payload === 'object'
    ? (completed.payload as { outcome?: unknown }).outcome
    : null;
  if (explicit === 'SUCCESS_WITH_WARNING') return explicit;
  if (run.status === 'COMPLETED') return 'SUCCESS';
  if (run.status === 'FAILED') return changedFiles > 0 ? 'PARTIAL' : 'FAILED';
  if (run.status === 'CANCELLED') return 'CANCELLED';
  return 'RUNNING';
}

function canonicalState(status: CanonicalPhaseStatus): AgentWorkPhaseState {
  if (status === 'SUCCEEDED') return 'completed';
  if (status === 'RUNNING') return 'active';
  if (status === 'FAILED' || status === 'PARTIAL') return 'failed';
  if (status === 'BLOCKED') return 'blocked';
  if (status === 'SKIPPED') return 'skipped';
  return 'pending';
}

function canonicalDetail(name: CanonicalPhaseName, payload: CanonicalPhasePayload): string {
  const fact = payload.fact ?? {};
  const entity = fact.target_entity ? `“${fact.target_entity}”` : '目标配置';
  const state = payload.phases[name];
  if (state === 'SKIPPED') return name === 'EDIT' ? '无需修改项目文件' : '没有修改，因此无需运行验证';
  if (state === 'BLOCKED') return name === 'VERIFY' ? '没有形成可验证修改，本阶段未执行' : '前一步未完成，本阶段未执行';
  if (name === 'LOCATE') return fact.evidence_files ? `已核对 ${fact.evidence_files} 个直接相关文件` : fact.context_confidence === 'LOW' ? `正在补充${entity}的直接证据` : fact.candidate_files ? `已定位 ${fact.candidate_files} 个候选文件` : `定位${entity}的相关实现`;
  if (name === 'EDIT') return fact.narrative_key === 'PATCH_CONFLICT_RECOVERY'
    ? `文件内容已变化，正在有界重试一次`
    : fact.changed_files ? `修改 ${fact.changed_files} 个文件` : `生成并应用完整修改集`;
  if (name === 'VERIFY') return fact.changed_files ? `确认 ${fact.changed_files} 个文件没有残留配置` : `运行与修改范围匹配的检查`;
  return fact.changed_files ? `整理 ${fact.changed_files} 个文件的结果` : '整理可验证结果';
}

function primaryChangeFor(tools: readonly AgentToolCallView[]): AgentPresentation['primaryChange'] {
  const mutations = tools.filter((tool) => ['WORKSPACE_WRITE', 'DESTRUCTIVE'].includes(tool.effect));
  if (mutations.length === 0) return null;
  if (mutations.every((tool) => tool.name === 'create_file')) return 'CREATE';
  if (mutations.every((tool) => tool.name === 'delete_file')) return 'DELETE';
  if (mutations.every((tool) => tool.name === 'move_file')) return 'RENAME';
  return 'MODIFY';
}

function activeStepFor(phases: readonly AgentWorkPhase[], terminal: boolean): number {
  const active = phases.findIndex((phase) => activeStepState(phase.state));
  if (active >= 0) return active + 1;
  const pending = phases.findIndex((phase) => phase.state === 'pending');
  if (pending >= 0) return pending + 1;
  let lastCompleted = -1;
  phases.forEach((phase, index) => { if (phase.state === 'completed') lastCompleted = index; });
  return terminal ? phases.length : Math.max(1, lastCompleted + 2);
}

function activeStepState(state: AgentWorkPhaseState): boolean {
  return state === 'active' || state === 'failed' || state === 'blocked';
}

function taskFileNames(task: string): string[] {
  const matches = task.match(/(?:[\p{L}\p{N}_@.-]+[\\/])*(?:[\p{L}\p{N}_@.-]+)\.(?:[cm]?[jt]sx?|html?|css|scss|json|md|rs|toml|ya?ml|py|vue|svelte)/giu) ?? [];
  return [...new Set(matches.map(fileName))].slice(0, 3);
}

function taskProjectName(task: string): string | null {
  return task.match(/([\p{L}\p{N}_.-]+)\s+Project\b/iu)?.[1] ?? null;
}

function taskVerificationCommand(task: string): string | null {
  const command = task.match(/(?:运行|执行)\s+((?:node|pnpm|npm|yarn|bun|npx|cargo)\b[^，。；\r\n]*)/iu)?.[1]
    ?.replace(/\s+(?:进行)?验证\s*$/u, '')
    .trim();
  return command ? command.slice(0, 120) : null;
}

function planLabels(task: string): Record<'INSPECT' | 'SCOPE' | 'MODIFY' | 'VERIFY' | 'FINISH', string> {
  const files = taskFileNames(task);
  const target = files[0] ?? null;
  const project = taskProjectName(task);
  const verification = taskVerificationCommand(task);
  const root = project ? `${project} 项目根目录` : '项目根目录';
  const count = files.length || 1;

  if (/(?:创建|新建|新增文件)/u.test(task)) return {
    INSPECT: `定位 ${root}`,
    SCOPE: target ? `确认没有同名 ${target}` : '确认目标文件尚不存在',
    MODIFY: target ? `创建 ${target}` : '创建目标文件',
    VERIFY: verification ? `运行 ${verification}` : target ? `检查 ${target}` : '验证新文件',
    FINISH: `核对只新增 ${count} 个文件`,
  };
  if (/(?:删除|移除)/u.test(task)) return {
    INSPECT: target ? `定位 ${target}` : '定位目标内容',
    SCOPE: target ? `确认只删除 ${target}` : '确认删除范围',
    MODIFY: target ? `删除 ${target}` : '删除目标内容',
    VERIFY: verification ? `运行 ${verification}` : '检查删除结果',
    FINISH: `核对只删除 ${count} 个文件`,
  };
  if (/(?:重命名|移动文件)/u.test(task)) return {
    INSPECT: target ? `定位 ${target}` : '定位目标文件',
    SCOPE: files.length > 1 ? `确认 ${files[0]} → ${files[1]}` : '确认移动范围',
    MODIFY: files.length > 1 ? `重命名为 ${files[1]}` : '重命名目标文件',
    VERIFY: verification ? `运行 ${verification}` : '检查引用与结果',
    FINISH: '核对只发生本次重命名',
  };
  if (/(?:Git|提交|分支|推送)/iu.test(task)) return { INSPECT: '核对当前 Git 变更', SCOPE: '确认本次提交文件', MODIFY: '执行指定 Git 操作', VERIFY: '确认仓库最终状态', FINISH: '核对提交与任务一致' };
  if (/(?:执行|运行|测试|验证)/u.test(task) && !/(?:修改|改成|调整|修复|实现|重构|写入)/u.test(task)) return {
    INSPECT: target ? `定位 ${target}` : '确认执行目标',
    SCOPE: project ? `检查 ${project} 项目运行条件` : '检查运行条件',
    MODIFY: verification ? `执行 ${verification}` : '执行目标命令',
    VERIFY: '核对命令退出状态',
    FINISH: '整理本次运行结果',
  };
  return {
    INSPECT: target ? `定位 ${target}` : project ? `定位 ${project} 项目相关实现` : '定位相关实现',
    SCOPE: target ? `确认只修改 ${target}` : '确认修改范围',
    MODIFY: target ? `更新 ${target}` : '修改目标代码',
    VERIFY: verification ? `运行 ${verification}` : target ? `验证 ${target}` : '运行相关验证',
    FINISH: target ? `核对只修改 ${count} 个文件` : '核对修改与验证结果',
  };
}

function genericPlan(
  run: AgentRunView,
  events: readonly AgentEventView[],
  tools: readonly AgentToolCallView[],
): AgentWorkPhase[] {
  const labels = planLabels(run.task);
  const observes = tools.filter((tool) => tool.effect === 'OBSERVE');
  const mutations = tools.filter((tool) => ['WORKSPACE_WRITE', 'DESTRUCTIVE'].includes(tool.effect));
  const verifications = tools.filter((tool) => tool.effect === 'PROCESS');
  const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status);
  const started = run.current_step > 0 || events.some((event) => ['RUN_STARTED', 'STEP_STARTED', 'CONTEXT_COMPILED'].includes(event.kind));
  const latestActive = [...tools].reverse().find((tool) => ['RUNNING', 'WAITING_APPROVAL', 'PROPOSED'].includes(tool.status)) ?? null;
  const failed = [...tools].reverse().find((tool) => ['FAILED', 'DENIED', 'UNKNOWN'].includes(tool.status)) ?? null;
  const activeId = latestActive ? phaseIdForTool(latestActive) : null;
  const failedId = failed ? phaseIdForTool(failed) : null;
  const laterStarted = mutations.length > 0 || verifications.length > 0;
  const phase = (id: PhaseId, label: string, detail: string, touched: boolean): AgentWorkPhase => {
    let state: AgentWorkPhaseState = 'pending';
    if (failedId === id) state = 'failed';
    else if (activeId === id) state = 'active';
    else if (touched) state = 'completed';
    else if (failedId && ['VERIFY', 'FINISH'].includes(id)) state = 'blocked';
    else if (terminal) state = id === 'FINISH' && run.status === 'COMPLETED' ? 'completed' : 'skipped';
    return { id, label, detail, state };
  };
  const inspectTouched = observes.length > 0 || laterStarted || terminal;
  const scopeTouched = laterStarted || terminal || observes.some((tool) => tool.status === 'COMPLETED');
  const phases: AgentWorkPhase[] = [
    phase('INSPECT', labels.INSPECT, observes.length ? phaseDetail(observes) : started ? '正在核对任务与项目上下文' : '等待开始', inspectTouched),
    phase('SCOPE', labels.SCOPE, scopeTouched ? '修改与执行范围已由当前任务约束' : '等待定位完成', scopeTouched),
    phase('MODIFY', labels.MODIFY, mutations.length ? phaseDetail(mutations) : '尚未执行文件操作', mutations.length > 0),
    phase('VERIFY', labels.VERIFY, verifications.length ? phaseDetail(verifications) : '尚未运行验证', verifications.length > 0),
    phase('FINISH', labels.FINISH, run.status === 'COMPLETED' ? '结果已写入当前对话' : run.status === 'FAILED' ? '工作在完成前中断' : run.status === 'CANCELLED' ? '已按你的要求停止' : '等待执行完成', terminal),
  ];
  if (started && phases.every((item) => item.state !== 'active') && !terminal) {
    const firstPending = phases.find((item) => item.state === 'pending');
    if (firstPending) firstPending.state = 'active';
  }
  return phases;
}

function canonicalNarrative(payload: CanonicalPhasePayload, run: AgentRunView, changedFiles: number): { headline: string; narrative: string } {
  const fact = payload.fact ?? {};
  const entity = fact.target_entity ? `“${fact.target_entity}”` : '目标配置';
  if (run.status === 'COMPLETED' && (fact.no_change || fact.narrative_key === 'ALREADY_SATISFIED')) return { headline: '目标状态已经满足', narrative: `检查后确认${entity}已经不在指定位置中，没有改动项目文件。` };
  if (run.status === 'COMPLETED' && fact.narrative_key === 'NO_SAFE_MINIMAL_CHANGE') return { headline: '未执行修改', narrative: `现有证据无法形成只针对${entity}的安全最小修改，项目文件保持不变。` };
  if (run.status === 'COMPLETED') return { headline: '已经完成', narrative: fact.target_entity
    ? `${entity}已经按本次请求完成调整，其他范围保持不变。`
    : `本次修改已经完成，范围保持在 ${changedFiles} 个直接相关文件内。` };
  if (run.status === 'FAILED') return { headline: changedFiles > 0 ? '只完成了部分修改' : '这次没有修改项目', narrative: failureNarrative(run.error_code, changedFiles) };
  if (run.status === 'WAITING_APPROVAL') return { headline: '需要你确认下一步', narrative: payload.active_phase === 'VERIFY' ? '修改已经应用，批准后只运行与本次变更匹配的验证。' : `找到了${entity}的相关配置，批准后只修改这次列出的文件。` };
  if (payload.active_phase === 'LOCATE' && fact.narrative_key === 'EVIDENCE_RECOVERY') return { headline: '正在补充直接证据', narrative: `初始上下文不能证明${entity}的准确位置，正在进行一次有界搜索和并行读取。` };
  if (payload.active_phase === 'LOCATE') return { headline: '正在定位相关实现', narrative: `我先确认${entity}所在的准确页面和控件范围。` };
  if (payload.active_phase === 'EDIT' && fact.narrative_key === 'PATCH_CONFLICT_RECOVERY') return { headline: '正在重新匹配修改', narrative: '第一次修改没有完全匹配当前文件，我正在重新读取相关文件后重试一次，不会扩大修改范围。' };
  if (payload.active_phase === 'EDIT') return { headline: '已找到相关配置', narrative: `已经定位${entity}的相关实现，正在应用一个完整、受范围约束的修改集。` };
  if (payload.active_phase === 'VERIFY') return { headline: '正在验证修改', narrative: `修改已经应用，正在确认没有残留的${entity}配置。` };
  return { headline: '正在整理结果', narrative: '修改和验证已经完成，正在整理可核对的结果。' };
}

export function buildAgentPresentation(
  run: AgentRunView,
  events: readonly AgentEventView[],
  tools: readonly AgentToolCallView[],
  now = Date.now(),
): AgentPresentation {
  const finishedAt = run.finished_at ?? (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status) ? run.updated_at : now);
  const elapsed = formatElapsed(finishedAt - run.created_at);
  const completedMutations = tools.filter((tool) =>
    tool.status === 'COMPLETED' && (tool.effect === 'WORKSPACE_WRITE' || tool.effect === 'DESTRUCTIVE'),
  );
  const changedPaths = new Set(completedMutations.flatMap(argumentPaths));
  const changedFiles = changedPaths.size || completedMutations.length;
  const eventVerificationPasses = events.filter((event) => event.kind === 'VERIFICATION_RECORDED'
    && event.payload && typeof event.payload === 'object'
    && (event.payload as { receipt?: { outcome?: unknown } }).receipt?.outcome === 'PASS').length;
  const passedVerifications = Math.max(tools.filter(receiptPassed).length, eventVerificationPasses);
  const activeTool = [...tools].reverse().find((tool) => ['RUNNING', 'WAITING_APPROVAL', 'PROPOSED'].includes(tool.status)) ?? tools.at(-1) ?? null;
  const canonical = canonicalPayload(events);

  if (canonical) {
    const wording = canonicalNarrative(canonical, run, changedFiles);
    const summary = [elapsed];
    if (changedFiles > 0) summary.push(`${changedFiles} 个文件修改`);
    if (passedVerifications > 0) summary.push('验证通过');
    const mapping: Array<[CanonicalPhaseName, AgentWorkPhase['id'], string]> = [
      ['LOCATE', 'INSPECT', planLabels(run.task).INSPECT],
      ['EDIT', 'MODIFY', planLabels(run.task).MODIFY],
      ['VERIFY', 'VERIFY', planLabels(run.task).VERIFY],
      ['FINALIZE', 'FINISH', planLabels(run.task).FINISH],
    ];
    const phases = mapping.map(([name, id, label]) => ({
      id, label, detail: canonicalDetail(name, canonical), state: canonicalState(canonical.phases[name]),
    }));
    return {
      ...wording, elapsed, summary, phases, changedFiles, passedVerifications, canonicalPhase: true,
      activeStep: activeStepFor(phases, ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)), totalSteps: phases.length,
      primaryChange: primaryChangeFor(tools), outcome: resultOutcome(run, events, changedFiles),
    };
  }

  let headline = '正在理解任务';
  let narrative = '我先确认这次请求在当前项目中的具体位置和影响范围。';
  if (run.status === 'QUEUED') {
    headline = '正在准备工作';
    narrative = '我会先核对项目上下文，再决定需要检查和修改的最小范围。';
  } else if (run.status === 'RUNNING' && activeTool) {
    const phase = phaseIdForTool(activeTool);
    headline = phase === 'INSPECT' ? '正在检查相关实现' : phase === 'MODIFY' ? '正在修改项目' : phase === 'VERIFY' ? '正在验证' : phase === 'VERSION' ? '正在检查版本变更' : '正在继续处理';
    narrative = phase === 'INSPECT'
      ? '我正在确认请求涉及的实现边界，找到准确位置后再决定是否修改。'
      : phase === 'MODIFY' ? '已经确认修改范围，只处理与本次请求直接相关的文件。'
        : phase === 'VERIFY' ? '修改已经完成，我在确认结果没有影响其他范围。'
          : phase === 'VERSION' ? '代码修改与验证已经完成，我正在核对本次版本变更。'
            : '我已经确认下一步，只会继续处理当前任务范围。';
  } else if (run.status === 'WAITING_APPROVAL') {
    headline = '需要你确认下一步';
    narrative = activeTool ? `下一步将${toolTitle(activeTool.name)}。确认后只执行界面中列出的这一次操作。` : '下一步操作需要你的确认，批准范围只对这一次有效。';
  } else if (run.status === 'PAUSED') {
    headline = '工作已暂停';
    narrative = changedFiles > 0 ? `目前已有 ${changedFiles} 个文件发生变化，可以继续或先查看修改。` : '当前没有项目文件变化，可以随时继续。';
  } else if (run.status === 'COMPLETED') {
    headline = '已经完成';
    narrative = changedFiles > 0
      ? `本次修改已经完成，范围保持在 ${changedFiles} 个直接相关文件内。`
      : '检查和处理已经完成，项目文件没有发生额外变化。';
  } else if (run.status === 'FAILED') {
    headline = '这次没有完成';
    narrative = failureNarrative(run.error_code, changedFiles);
  } else if (run.status === 'CANCELLED') {
    headline = '这次工作已停止';
    narrative = changedFiles > 0 ? `停止前已有 ${changedFiles} 个文件发生变化，可以先查看修改。` : '停止前没有修改项目文件。';
  }

  const summary = [elapsed];
  if (changedFiles > 0) summary.push(`${changedFiles} 个文件修改`);
  if (passedVerifications > 0) summary.push(`${passedVerifications} 项验证通过`);

  const phases = genericPlan(run, events, tools);
  return {
    headline, narrative, elapsed, summary, phases, changedFiles, passedVerifications, canonicalPhase: false,
    activeStep: activeStepFor(phases, ['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)), totalSteps: phases.length,
    primaryChange: primaryChangeFor(tools), outcome: resultOutcome(run, events, changedFiles),
  };
}
