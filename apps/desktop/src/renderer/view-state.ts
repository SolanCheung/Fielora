import type {
  ActivityAction,
  FieldMode,
  FieldResumeV1View,
  FieldStateKind,
  FieldSummary,
  HealthDTO,
  ObjectLifecycle,
  ReferenceView,
  StateStatus,
  StateView,
} from '@fielora/contracts';

export type AppView = 'PROJECTS' | 'NOW' | 'BROWSE' | 'FIELDS' | 'SETTINGS';
export type Screen = 'startup' | 'projects' | 'now' | 'browse' | 'fields' | 'field' | 'settings';

export function screenFor(health: HealthDTO | undefined, selectedField: string | undefined, appView: AppView = 'NOW'): Screen {
  if (!health || health.state !== 'READY') return 'startup';
  switch (appView) {
    case 'PROJECTS': return 'projects';
    case 'BROWSE': return 'browse';
    case 'FIELDS': return selectedField ? 'field' : 'fields';
    case 'SETTINGS': return 'settings';
    case 'NOW': return selectedField ? 'field' : 'now';
    default: throw new Error(`Unknown app view: ${String(appView)}`);
  }
}

export function upsertFields(fields: FieldSummary[], changed: FieldSummary): FieldSummary[] {
  return [changed, ...fields.filter((field) => field.id !== changed.id)]
    .sort((left, right) => right.updated_at - left.updated_at);
}

export function focusLabel(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '尚未设置当前焦点';
  if (typeof value === 'object' && 'kind' in value) {
    if (value.kind === 'STATE') return '继续当前工作';
    if (value.kind === 'REFERENCE') return '查看当前参考资料';
  }
  return '回到当前 Field';
}

export const fieldModeLabels: Record<FieldMode, string> = {
  EXPLORE: '探索',
  THINK: '思考',
  BUILD: '构建',
  OPERATE: '执行',
  VERIFY: '验证',
};

export const stateKindLabels: Record<FieldStateKind, string> = {
  FACT: '事实',
  DECISION: '决定',
  ASSUMPTION: '假设',
  QUESTION: '问题',
  TASK: '任务',
  BLOCKER: '阻塞',
  RESULT: '结果',
};

export const stateStatusLabels: Record<StateStatus, string> = {
  ACTIVE: '进行中',
  RESOLVED: '已完成',
  SUPERSEDED: '已替代',
  RETRACTED: '已撤回',
};

export const referenceLifecycleLabels: Record<ObjectLifecycle, string> = {
  ACTIVE: '可用',
  ARCHIVED: '已归档',
};

const activityLabels: Record<ActivityAction, string> = {
  FIELD_CREATED: '创建了 Field',
  FIELD_FOCUS_UPDATED: '更新了当前关注',
  FIELD_MODE_UPDATED: '切换了工作状态',
  STATE_CREATED: '记录了新内容',
  STATE_REVISED: '修订了内容',
  STATE_STATUS_CHANGED: '更新了进展',
  STATE_SUPERSEDED: '替代了旧内容',
  REFERENCE_CREATED: '保存了参考资料',
  REFERENCE_REVISED: '修订了参考资料',
  REFERENCE_ARCHIVED: '归档了参考资料',
  REFERENCE_RESTORED: '恢复了参考资料',
  REFERENCE_SOURCE_ATTACHED: '关联了来源',
  REFERENCE_SOURCE_RETRACTED: '移除了来源关联',
  PROVIDER_CONFIG_CREATED: '创建了 Provider 配置',
  PROVIDER_CONFIG_UPDATED: '更新了 Provider 配置',
  PROVIDER_CONFIG_REMOVED: '移除了 Provider 配置',
  CAPTURE_CREATED: '保存了 Capture',
  CAPTURE_ATTACHED: '将 Capture 附加到 Field',
  CAPTURE_PROMOTED: '将 Capture 提升为 Idea Candidate',
  CAPTURE_ARCHIVED: '归档了 Capture',
  CAPTURE_RESTORED: '恢复了 Capture',
  MODEL_INVOCATION_COMPLETED: '完成了模型调用',
  MODEL_INVOCATION_FAILED: '模型调用失败',
};

export function activityLabel(action: ActivityAction): string {
  return activityLabels[action];
}

export interface ContinuationPresentation {
  cue: string;
  label: string;
}

export function continuationPresentation(
  resume: FieldResumeV1View,
  states: StateView[],
  references: ReferenceView[],
): ContinuationPresentation {
  const { continuation } = resume;
  if (continuation.target.kind === 'LEGACY_TEXT') {
    return { cue: '上次关注', label: continuation.target.label };
  }
  if (continuation.target.kind === 'STATE') {
    const stateId = continuation.target.state_id;
    const state = states.find((item) => item.id === stateId);
    const fallback = [...resume.active_blockers, ...resume.active_questions, ...resume.active_tasks]
      .find((item) => item.id === stateId);
    const cue = continuation.reason === 'ACTIVE_BLOCKER'
      ? '先处理'
      : continuation.reason === 'ACTIVE_QUESTION'
        ? '待确认'
        : continuation.reason === 'TYPED_FOCUS'
          ? '当前关注'
          : '继续';
    return { cue, label: state?.content ?? fallback?.content_excerpt ?? '回到当前工作' };
  }
  if (continuation.target.kind === 'REFERENCE') {
    const objectId = continuation.target.object_id;
    const reference = references.find((item) => item.id === objectId);
    return { cue: '当前关注', label: reference?.title ?? '查看参考资料' };
  }
  return { cue: '继续', label: '查看当前工作' };
}
