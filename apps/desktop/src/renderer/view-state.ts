import type { FieldSummary, HealthDTO } from '@fielora/contracts';

export type Screen = 'startup' | 'now' | 'field';

export function screenFor(health: HealthDTO | undefined, selectedField: string | undefined): Screen {
  if (!health || health.state !== 'READY') return 'startup';
  return selectedField ? 'field' : 'now';
}

export function upsertFields(fields: FieldSummary[], changed: FieldSummary): FieldSummary[] {
  return [changed, ...fields.filter((field) => field.id !== changed.id)]
    .sort((left, right) => right.updated_at - left.updated_at);
}

export function focusLabel(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '尚未设置当前焦点';
  return JSON.stringify(value);
}
