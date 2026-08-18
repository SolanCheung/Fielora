import type { CaptureKind, CaptureView, ContextChip, ProviderKind } from '@fielora/contracts';

export const captureKindLabels: Record<CaptureKind, string> = {
  TEXT: '文本',
  PAGE: '网页',
  SELECTION: '网页选区',
  MODEL_OUTPUT: '模型回答',
  FIELD_EXCERPT: 'Field 摘录',
};

export const providerKindLabels: Record<ProviderKind, string> = {
  OPENAI: 'OpenAI Responses',
  ANTHROPIC: 'Anthropic Messages',
  OPENAI_COMPATIBLE: 'OpenAI-compatible',
};

export const contextKindLabels: Record<ContextChip['kind'], string> = {
  CURRENT_FIELD: '当前 Field',
  CURRENT_FOCUS: '当前关注',
  CURRENT_PAGE: '当前页面',
  CURRENT_SELECTION: '当前选区',
  CAPTURE: '已捕获内容',
  USER_NOTE: '本次补充',
};

export function capturePreview(content: string, limit = 180): string {
  const compact = content.replace(/\s+/gu, ' ').trim();
  const scalars = [...compact];
  return scalars.length <= limit ? compact : `${scalars.slice(0, limit).join('')}…`;
}

export function captureSourceLabel(capture: CaptureView): string {
  if (capture.source.uri) {
    try { return new URL(capture.source.uri).hostname; }
    catch { return '已保存来源'; }
  }
  if (capture.source.kind === 'MODEL_RESPONSE') return '来自模型回答';
  if (capture.source.kind === 'USER_INPUT') return '来自用户输入';
  if (capture.source.field_id) return '来自 Field';
  return '已保存来源';
}

export function captureStateLabel(capture: CaptureView): string {
  if (capture.lifecycle_status === 'ARCHIVED') return '已归档';
  if (capture.placement_status === 'PROMOTED') return '已作为灵感继续';
  if (capture.placement_status === 'ATTACHED') return '已加入 Field';
  return '待整理';
}

export function contextSummary(chips: ContextChip[]): string {
  if (chips.length === 0) return '未附加内容';
  const labels: string[] = [];
  for (const chip of chips) {
    const label = contextKindLabels[chip.kind];
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.slice(0, 2).join(' + ') + (labels.length > 2 ? ` + ${labels.length - 2}` : '');
}

export function inferUserNoteSensitivity(content: string): ContextChip['sensitivity'] {
  const sensitiveCue = /(?:api[ _-]?key|access[ _-]?token|password|secret|credential|身份证|银行卡|密码|密钥|令牌)/iu;
  return sensitiveCue.test(content) ? 'SENSITIVE' : 'NORMAL';
}

export function invocationStatusLabel(status: 'IDLE'|'RUNNING'|'COMPLETED'|'CANCELLED'|'FAILED'): string {
  return {
    IDLE: '准备就绪',
    RUNNING: '正在生成',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    FAILED: '发送失败',
  }[status];
}
