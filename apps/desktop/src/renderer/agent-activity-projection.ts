import type { AgentEventView, AgentToolCallView } from '@fielora/contracts';

export type ConversationActivityGroupKind = 'INSPECT' | 'CHANGE' | 'VERIFY' | 'COMMAND' | 'VERSION' | 'NETWORK' | 'OTHER' | 'MIXED';

export interface ConversationToolActivityEntry {
  id: string;
  kind: 'TOOL';
  sequence: number;
  occurredAt: number;
  completedAt: number | null;
  activityKind: Exclude<ConversationActivityGroupKind, 'MIXED'>;
  tool: AgentToolCallView;
  status: AgentToolCallView['status'];
  toolId: string;
}

export interface ConversationVerificationActivityEntry {
  id: string;
  kind: 'VERIFICATION';
  sequence: number;
  occurredAt: number;
  completedAt: number;
  activityKind: 'VERIFY';
  title: string;
  detail: string;
  status: 'COMPLETED' | 'FAILED';
}

export type ConversationActivityEntry = ConversationToolActivityEntry | ConversationVerificationActivityEntry;

export interface ConversationActivityGroupItem {
  id: string;
  kind: 'GROUP';
  sequence: number;
  occurredAt: number;
  completedAt: number | null;
  groupKind: ConversationActivityGroupKind;
  title: string;
  entries: ConversationActivityEntry[];
}

export interface ConversationActivityNarrativeItem {
  id: string;
  kind: 'NARRATIVE';
  sequence: number;
  occurredAt: number;
  step: number;
  text: string;
}

export interface ConversationActivityPhaseItem {
  id: string;
  kind: 'PHASE';
  sequence: number;
  occurredAt: number;
  title: string;
  phase: 'LOCATE' | 'EDIT' | 'VERIFY' | 'FINALIZE' | 'PAUSED' | 'RESUMED' | 'RECOVERY';
}

export interface ConversationActivityApprovalItem {
  id: string;
  kind: 'APPROVAL';
  sequence: number;
  occurredAt: number;
  completedAt: number | null;
  approvalId: string;
  toolCallId: string;
  decision: 'ALLOW_ONCE' | 'DENY' | null;
}

export type ConversationActivityItem = ConversationActivityGroupItem | ConversationActivityNarrativeItem | ConversationActivityPhaseItem | ConversationActivityApprovalItem;

export function reconcileLiveNarrative(
  items: readonly ConversationActivityItem[],
  liveText: string,
  step: number,
): string {
  if (!liveText.trim()) return '';
  const durableTurnArrived = items.some((item) => item.kind === 'NARRATIVE' && item.step === step);
  return durableTurnArrived ? '' : liveText;
}

type EventPayload = Record<string, unknown>;

function payloadOf(event: AgentEventView): EventPayload | null {
  return event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? event.payload as EventPayload
    : null;
}

function payloadString(payload: EventPayload | null, key: string): string {
  return typeof payload?.[key] === 'string' ? payload[key] as string : '';
}

function payloadNumber(payload: EventPayload | null, key: string): number {
  return typeof payload?.[key] === 'number' && Number.isSafeInteger(payload[key]) ? payload[key] as number : 0;
}

function toolIdFor(event: AgentEventView): string {
  return payloadString(payloadOf(event), 'tool_call_id');
}

function terminalToolEvent(event: AgentEventView): boolean {
  return ['TOOL_COMPLETED', 'TOOL_FAILED', 'TOOL_DENIED', 'TOOL_CANCELLED', 'TOOL_UNKNOWN'].includes(event.kind);
}

function verificationPassed(event: AgentEventView): boolean {
  const receipt = payloadOf(event)?.receipt;
  return Boolean(receipt && typeof receipt === 'object' && !Array.isArray(receipt)
    && (receipt as EventPayload).outcome === 'PASS');
}

function toolIsVerification(tool: AgentToolCallView, verificationToolIds: ReadonlySet<string>): boolean {
  if (verificationToolIds.has(tool.id)) return true;
  return Boolean(tool.receipt && typeof tool.receipt === 'object' && !Array.isArray(tool.receipt)
    && (tool.receipt as EventPayload).verification_eligible === true);
}

function activityKindFor(tool: AgentToolCallView, verificationToolIds: ReadonlySet<string>): Exclude<ConversationActivityGroupKind, 'MIXED'> {
  if (toolIsVerification(tool, verificationToolIds)) return 'VERIFY';
  if (tool.name.startsWith('git_')) return 'VERSION';
  if (tool.effect === 'OBSERVE') return 'INSPECT';
  if (tool.effect === 'WORKSPACE_WRITE' || tool.effect === 'DESTRUCTIVE') return 'CHANGE';
  if (tool.effect === 'PROCESS') return 'COMMAND';
  if (tool.effect === 'NETWORK') return 'NETWORK';
  return 'OTHER';
}

function argumentPaths(tool: AgentToolCallView): string[] {
  if (!tool.arguments || typeof tool.arguments !== 'object' || Array.isArray(tool.arguments)) return [];
  const root = tool.arguments as Record<string, unknown>;
  const paths = new Set<string>();
  for (const key of ['path', 'from', 'to']) {
    if (typeof root[key] === 'string' && root[key]) paths.add(root[key] as string);
  }
  if (Array.isArray(root.paths)) root.paths.forEach((path) => { if (typeof path === 'string' && path) paths.add(path); });
  if (Array.isArray(root.patches)) root.patches.forEach((patch) => {
    if (patch && typeof patch === 'object' && !Array.isArray(patch) && typeof (patch as EventPayload).path === 'string') {
      paths.add((patch as EventPayload).path as string);
    }
  });
  return [...paths];
}

function activityPhrase(kind: Exclude<ConversationActivityGroupKind, 'MIXED'>, entries: readonly ConversationActivityEntry[], active: boolean): string {
  const matching = entries.filter((entry) => entry.activityKind === kind);
  if (kind === 'INSPECT') {
    const onlyFileInspection = matching.every((entry) => entry.kind !== 'TOOL' || ['list_files', 'read_file', 'search_text', 'stat_path'].includes(entry.tool.name));
    return onlyFileInspection ? (active ? '正在读取相关文件' : '已读取相关文件') : (active ? '正在检查相关信息' : '检查了相关信息');
  }
  if (kind === 'CHANGE') {
    const completed = matching.filter((entry) => entry.status === 'COMPLETED');
    const count = new Set(completed.flatMap((entry) => entry.kind === 'TOOL' ? argumentPaths(entry.tool) : [])).size;
    return active ? '正在编辑文件' : count > 0 ? `已编辑 ${count} 个文件` : completed.length ? '已编辑文件' : '尝试修改文件';
  }
  if (kind === 'VERIFY') return active ? '正在运行针对性验证' : '运行了针对性验证';
  if (kind === 'COMMAND') return active ? '正在运行命令' : '运行了命令';
  if (kind === 'VERSION') {
    const onlyRead = matching.every((entry) => entry.kind !== 'TOOL' || ['git_read', 'git_status'].includes(entry.tool.name));
    return onlyRead ? (active ? '正在检查 Git 状态' : '检查了 Git 状态') : (active ? '正在处理版本变更' : '处理了版本变更');
  }
  if (kind === 'NETWORK') return active ? '正在访问外部服务' : '访问了外部服务';
  return active ? '正在执行操作' : '执行了操作';
}

function groupTitle(entries: readonly ConversationActivityEntry[]): string {
  const active = entries.some((entry) => !['COMPLETED', 'FAILED', 'DENIED', 'CANCELLED', 'UNKNOWN'].includes(entry.status));
  const failed = entries.some((entry) => entry.status === 'FAILED' || entry.status === 'UNKNOWN');
  const kinds = [...new Set(entries.map((entry) => entry.activityKind))];
  if (!active && failed && kinds.length === 1 && kinds[0] === 'VERIFY') return '针对性验证未通过';
  const title = kinds.map((kind) => activityPhrase(kind, entries, active)).join('并');
  return !active && failed ? `${title}，其中有操作未完成` : title;
}

function groupKind(entries: readonly ConversationActivityEntry[]): ConversationActivityGroupKind {
  const kinds = [...new Set(entries.map((entry) => entry.activityKind))];
  return kinds.length === 1 ? kinds[0] ?? 'OTHER' : 'MIXED';
}

function phaseMarker(event: AgentEventView): ConversationActivityPhaseItem | null {
  if (event.kind === 'RUN_PAUSED') return { id: `phase-${event.sequence}`, kind: 'PHASE', sequence: event.sequence, occurredAt: event.created_at, phase: 'PAUSED', title: '任务已暂停' };
  if (event.kind === 'RUN_RESUMED') return { id: `phase-${event.sequence}`, kind: 'PHASE', sequence: event.sequence, occurredAt: event.created_at, phase: 'RESUMED', title: '任务已继续' };
  if (event.kind === 'RECOVERY_RECONCILED') return { id: `phase-${event.sequence}`, kind: 'PHASE', sequence: event.sequence, occurredAt: event.created_at, phase: 'RECOVERY', title: '已恢复并核对执行状态' };
  return null;
}

function approvalIdentity(event: AgentEventView): { approvalId: string; toolCallId: string } | null {
  const payload = payloadOf(event);
  const approval = payload?.approval;
  if (approval && typeof approval === 'object' && !Array.isArray(approval)) {
    const value = approval as EventPayload;
    const approvalId = payloadString(value, 'id');
    const toolCallId = payloadString(value, 'tool_call_id');
    if (approvalId && toolCallId) return { approvalId, toolCallId };
  }
  const approvalId = payloadString(payload, 'approval_id');
  const toolCallId = payloadString(payload, 'tool_call_id');
  return approvalId && toolCallId ? { approvalId, toolCallId } : null;
}

function narrativeFor(event: AgentEventView): ConversationActivityNarrativeItem | null {
  if (event.kind !== 'ASSISTANT_NARRATIVE') return null;
  const payload = payloadOf(event);
  const text = payloadString(payload, 'text').trim();
  if (!text) return null;
  return {
    id: `narrative-${event.sequence}`,
    kind: 'NARRATIVE',
    sequence: event.sequence,
    occurredAt: event.created_at,
    step: payloadNumber(payload, 'step'),
    text,
  };
}

export function buildConversationActivityProjection(
  events: readonly AgentEventView[],
  tools: readonly AgentToolCallView[],
): ConversationActivityItem[] {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const toolById = new Map(tools.map((tool) => [tool.id, tool]));
  const terminalByTool = new Map<string, AgentEventView>();
  const verificationToolIds = new Set<string>();
  const approvalToolIds = new Set<string>();
  for (const event of ordered) {
    const toolId = toolIdFor(event);
    if (toolId && terminalToolEvent(event)) terminalByTool.set(toolId, event);
    if (event.kind === 'APPROVAL_REQUESTED') {
      const identity = approvalIdentity(event);
      if (identity) approvalToolIds.add(identity.toolCallId);
    }
    if (event.kind === 'VERIFICATION_RECORDED') {
      const receipt = payloadOf(event)?.receipt;
      if (receipt && typeof receipt === 'object' && !Array.isArray(receipt)) {
        const receiptToolId = payloadString(receipt as EventPayload, 'tool_call_id');
        if (receiptToolId) verificationToolIds.add(receiptToolId);
      }
    }
  }

  const items: ConversationActivityItem[] = [];
  const approvals = new Map<string, ConversationActivityApprovalItem>();
  const projectedToolIds = new Set<string>();
  let currentGroup: ConversationActivityGroupItem | null = null;
  let lastPhase = '';

  const appendEntry = (entry: ConversationActivityEntry) => {
    if (!currentGroup) {
      currentGroup = {
        id: `group-${entry.sequence}`,
        kind: 'GROUP',
        sequence: entry.sequence,
        occurredAt: entry.occurredAt,
        completedAt: null,
        groupKind: entry.activityKind,
        title: '',
        entries: [],
      };
      items.push(currentGroup);
    }
    currentGroup.entries.push(entry);
    const terminalTimes = currentGroup.entries.map((candidate) => candidate.completedAt);
    currentGroup.completedAt = terminalTimes.every((value) => value !== null)
      ? Math.max(...terminalTimes as number[])
      : null;
    currentGroup.groupKind = groupKind(currentGroup.entries);
    currentGroup.title = groupTitle(currentGroup.entries);
  };

  const appendTool = (event: AgentEventView) => {
    const toolId = toolIdFor(event);
    const tool = toolById.get(toolId);
    if (!tool || projectedToolIds.has(tool.id) || tool.name === 'delegate_readonly') return;
    projectedToolIds.add(tool.id);
    const terminal = terminalByTool.get(tool.id);
    appendEntry({
      id: `tool-${tool.id}`,
      kind: 'TOOL',
      sequence: event.sequence,
      occurredAt: event.created_at,
      completedAt: terminal?.created_at ?? (['COMPLETED', 'FAILED', 'DENIED', 'CANCELLED', 'UNKNOWN'].includes(tool.status) ? tool.updated_at : null),
      activityKind: activityKindFor(tool, verificationToolIds),
      tool,
      status: tool.status,
      toolId: tool.id,
    });
  };

  for (const event of ordered) {
    const narrative = narrativeFor(event);
    if (narrative) {
      currentGroup = null;
      items.push(narrative);
      continue;
    }

    const phase = phaseMarker(event);
    if (phase) {
      currentGroup = null;
      const phaseIdentity = `${phase.phase}:${phase.title}`;
      if (phaseIdentity !== lastPhase) {
        items.push(phase);
        lastPhase = phaseIdentity;
      }
      continue;
    }

    if (event.kind === 'PHASE_CHANGED') {
      currentGroup = null;
      continue;
    }

    if (event.kind === 'TOOL_PROPOSED' && !approvalToolIds.has(toolIdFor(event))) {
      appendTool(event);
      continue;
    }

    if (event.kind === 'TOOL_STARTED' && approvalToolIds.has(toolIdFor(event))) {
      appendTool(event);
      continue;
    }

    if (event.kind === 'VERIFICATION_RECORDED') {
      const receipt = payloadOf(event)?.receipt;
      const receiptToolId = receipt && typeof receipt === 'object' && !Array.isArray(receipt)
        ? payloadString(receipt as EventPayload, 'tool_call_id')
        : '';
      if (receiptToolId && projectedToolIds.has(receiptToolId)) continue;
      const passed = verificationPassed(event);
      appendEntry({
        id: `verification-${event.sequence}`,
        kind: 'VERIFICATION',
        sequence: event.sequence,
        occurredAt: event.created_at,
        completedAt: event.created_at,
        activityKind: 'VERIFY',
        title: passed ? '验证通过' : '验证未通过',
        detail: passed ? '结果来自当前 workspace revision 的验证回执' : '验证回执没有证明当前修改通过',
        status: passed ? 'COMPLETED' : 'FAILED',
      });
      continue;
    }

    if (event.kind === 'APPROVAL_REQUESTED') {
      currentGroup = null;
      const identity = approvalIdentity(event);
      if (!identity) continue;
      const item: ConversationActivityApprovalItem = {
        id: `approval-${identity.approvalId}`,
        kind: 'APPROVAL',
        sequence: event.sequence,
        occurredAt: event.created_at,
        completedAt: null,
        approvalId: identity.approvalId,
        toolCallId: identity.toolCallId,
        decision: null,
      };
      approvals.set(identity.approvalId, item);
      items.push(item);
      continue;
    }

    if (event.kind === 'APPROVAL_RESOLVED') {
      currentGroup = null;
      const payload = payloadOf(event);
      const approvalId = payloadString(payload, 'approval_id');
      const item = approvals.get(approvalId);
      if (!item) continue;
      const decision = payloadString(payload, 'decision');
      item.decision = decision === 'ALLOW_ONCE' || decision === 'DENY' ? decision : null;
      item.completedAt = event.created_at;
    }
  }

  return items;
}
