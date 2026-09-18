import type { ModelUsageDay, ModelUsageGroup, TaskTokenUsage } from '@fielora/contracts';

export interface SelectedUsageModel { providerId: string; modelId: string }
export interface ModelRate extends SelectedUsageModel { currency: 'CNY' | 'USD'; input: number; output: number }
export const MODEL_RATES_KEY = 'fielora:model-usage-rates:v1';
export const modelKey = (providerId: string, modelId: string): string => JSON.stringify([providerId, modelId]);
export const tokenTotal = (usage: TaskTokenUsage): number => usage.input_tokens + usage.output_tokens;

export function parseRate(value: string): number | null {
  if (!value.trim() || !/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000 ? number : null;
}

export function readModelRates(storage: Pick<Storage, 'getItem'>): ModelRate[] {
  try {
    const values: unknown = JSON.parse(storage.getItem(MODEL_RATES_KEY) ?? '[]');
    if (!Array.isArray(values)) return [];
    return values.filter((v): v is ModelRate => v && typeof v.providerId === 'string' && typeof v.modelId === 'string'
      && ['CNY', 'USD'].includes(v.currency) && typeof v.input === 'number' && typeof v.output === 'number'
      && Number.isFinite(v.input) && Number.isFinite(v.output) && v.input >= 0 && v.output >= 0 && v.input <= 1_000_000 && v.output <= 1_000_000);
  } catch { return []; }
}

export function estimateCost(usage: TaskTokenUsage, rate: ModelRate | undefined): number | null {
  return rate ? (usage.input_tokens * rate.input + usage.output_tokens * rate.output) / 1_000_000 : null;
}

export function costSummary(groups: ModelUsageGroup[], rates: ModelRate[]): { totals: Partial<Record<'CNY' | 'USD', number>>; unpriced: number } {
  const totals: Partial<Record<'CNY' | 'USD', number>> = {};
  let unpriced = 0;
  for (const group of groups) {
    if (!group.usage.reported_calls && !tokenTotal(group.usage)) continue;
    const rate = rates.find(r => r.providerId === group.provider_config_id && r.modelId === group.model_id);
    if (!rate) { if (group.usage.reported_calls || tokenTotal(group.usage)) unpriced++; continue; }
    totals[rate.currency] = (totals[rate.currency] ?? 0) + (estimateCost(group.usage, rate) ?? 0);
  }
  return { totals, unpriced };
}

export function usageChartBins(days: ModelUsageDay[], since: number | null, now: number): ModelUsageDay[] {
  const dayMs = 86_400_000;
  const start = since ?? (days.length ? Date.parse(`${days[0]!.date}T00:00:00Z`) : now);
  const startDay = Math.floor(start / dayMs);
  const endDay = Math.floor(now / dayMs);
  const count = Math.max(1, endDay - startDay + 1);
  const span = Math.max(1, Math.ceil(count / 30));
  const bins = Array.from({ length: Math.ceil(count / span) }, (_, i) => ({
    date: new Date((startDay + i * span) * dayMs).toISOString().slice(0, 10),
    usage: { input_tokens: 0, output_tokens: 0, reported_calls: 0, unreported_calls: 0 },
  }));
  for (const day of days) {
    const index = Math.floor((Math.floor(Date.parse(`${day.date}T00:00:00Z`) / dayMs) - startDay) / span);
    const bin = bins[index];
    if (bin) for (const key of ['input_tokens', 'output_tokens', 'reported_calls', 'unreported_calls'] as const) bin.usage[key] += day.usage[key];
  }
  return bins;
}
