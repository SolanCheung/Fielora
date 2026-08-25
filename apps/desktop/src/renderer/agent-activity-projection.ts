import type { AgentEventView, AgentToolCallView } from '@fielora/contracts';

export type ConversationActivityGroupKind = 'INSPECT' | 'CHANGE' | 'VERIFY' | 'COMMAND' | 'VERSION' | 'NETWORK' | 'OTHER';

export interface ConversationToolActivityEntry {
  id: string;
  kind: 'TOOL';
  sequence: number;
  occurredAt: number;
  completedAt: number | null;
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

export interface ConversationActivityProgressItem {
  id: string;
  kind: 'PROGRESS';
  sequence: number;
  occurredAt: number;
  text: string;
}

export type ConversationActivityItem = ConversationActivityGroupItem | ConversationActivityPhaseItem | ConversationActivityApprovalItem | ConversationActivityProgressItem;

type EventPayload = Record<string, unknown>;

function payloadOf(event: AgentEventView): EventPayload | null {
  return event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? event.payload as EventPayload
    : null;
}

function payloadString(payload: EventPayload | null, key: string): string {
  return typeof payload?.[key] === 'string' ? payload[key] as string : '';
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

function groupKindFor(tool: AgentToolCallView, verificationToolIds: ReadonlySet<string>): ConversationActivityGroupKind {
  if (toolIsVerification(tool, verificationToolIds)) return 'VERIFY';
  if (tool.name.startsWith('git_')) return 'VERSION';
  if (tool.effect === 'OBSERVE') return 'INSPECT';
  if (tool.effect === 'WORKSPACE_WRITE' || tool.effect === 'DESTRUCTIVE') return 'CHANGE';
  if (tool.effect === 'PROCESS') return 'COMMAND';
  if (tool.effect === 'NETWORK') return 'NETWORK';
  return 'OTHER';
}

function groupTitle(kind: ConversationActivityGroupKind, entries: readonly ConversationActivityEntry[]): string {
  const active = entries.some((entry) => !['COMPLETED', 'FAILED', 'DENIED', 'CANCELLED', 'UNKNOWN'].includes(entry.status));
  const failed = entries.some((entry) => entry.status === 'FAILED' || entry.status === 'UNKNOWN');
  const labels: Record<ConversationActivityGroupKind, [string, string]> = {
    INSPECT: ['正在检查项目', '检查了项目'],
    CHANGE: ['正在编辑文件', '编辑了文件'],
    VERIFY: ['正在运行验证', '运行了验证'],
    COMMAND: ['正在运行命令', '运行了命令'],
    VERSION: ['正在处理版本变更', '处理了版本变更'],
    NETWORK: ['正在访问外部服务', '访问了外部服务'],
    OTHER: ['正在执行操作', '执行了操作'],
  };
  if (failed) return kind === 'VERIFY' ? '验证未通过' : `${labels[kind][1]}，其中有操作未完成`;
  return labels[kind][active ? 0 : 1];
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

function progressText(event: AgentEventView): string {
  if (event.kind !== 'MODEL_TEXT_DELTA') return '';
  const payload = payloadOf(event);
  const text = payloadString(payload, 'text_delta') || payloadString(payload, 'text');
  return text.trim();
}

export function buildConversationActivityProjection(
  events: readonly AgentEventView[],
  tools: readonly AgentToolCallView[],
): ConversationActivityItem[] {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const toolById = new Map(tools.map((tool) => [tool.id, tool]));
  const terminalByTool = new Map<string, AgentEventView>();
  const verificationToolIds = new Set<string>();
  for (const event of ordered) {
    const toolId = toolIdFor(event);
    if (toolId && terminalToolEvent(event)) terminalByTool.set(toolId, event);
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

  const appendEntry = (kind: ConversationActivityGroupKind, entry: ConversationActivityEntry) => {
    if (!currentGroup || currentGroup.groupKind !== kind) {
      currentGroup = {
        id: `group-${entry.sequence}`,
        kind: 'GROUP',
        sequence: entry.sequence,
        occurredAt: entry.occurredAt,
        completedAt: null,
        groupKind: kind,
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
    currentGroup.title = groupTitle(kind, currentGroup.entries);
  };

  for (const event of ordered) {
    const progress = progressText(event);
    if (progress) {
      currentGroup = null;
      items.push({ id: `progress-${event.sequence}`, kind: 'PROGRESS', sequence: event.sequence, occurredAt: event.created_at, text: progress });
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

    if (event.kind === 'MODEL_STARTED' || event.kind === 'MODEL_COMPLETED') {
      currentGroup = null;
      continue;
    }

    if (event.kind === 'TOOL_PROPOSED') {
      const toolId = toolIdFor(event);
      const tool = toolById.get(toolId);
      if (!tool || projectedToolIds.has(tool.id)) continue;
      projectedToolIds.add(tool.id);
      const terminal = terminalByTool.get(tool.id);
      appendEntry(groupKindFor(tool, verificationToolIds), {
        id: `tool-${tool.id}`,
        kind: 'TOOL',
        sequence: event.sequence,
        occurredAt: event.created_at,
        completedAt: terminal?.created_at ?? (['COMPLETED', 'FAILED', 'DENIED', 'CANCELLED', 'UNKNOWN'].includes(tool.status) ? tool.updated_at : null),
        tool,
        status: tool.status,
        toolId: tool.id,
      });
      continue;
    }

    if (event.kind === 'VERIFICATION_RECORDED') {
      const receipt = payloadOf(event)?.receipt;
      const receiptToolId = receipt && typeof receipt === 'object' && !Array.isArray(receipt)
        ? payloadString(receipt as EventPayload, 'tool_call_id')
        : '';
      if (receiptToolId && projectedToolIds.has(receiptToolId)) continue;
      const passed = verificationPassed(event);
      appendEntry('VERIFY', {
        id: `verification-${event.sequence}`,
        kind: 'VERIFICATION',
        sequence: event.sequence,
        occurredAt: event.created_at,
        completedAt: event.created_at,
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
