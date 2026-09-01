import type { CaptureKind, CaptureView, ProviderKind } from '@fielora/contracts';

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
