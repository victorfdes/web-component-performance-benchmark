import type { BenchmarkConfig, CacheMode, Preset, Variant } from './types';

export const PRESET_FIELDS: Record<Preset, number> = {
  small: 300,
  standard: 1000,
  stress: 3000,
};

export const PRESET_LABELS: Record<Preset, string> = {
  small: 'Small · 300 fields',
  standard: 'Standard · 1,000 fields',
  stress: 'Stress · 3,000 fields',
};

const isVariant = (value: string | null): value is Variant =>
  value === 'angular' || value === 'web-component';
const isPreset = (value: string | null): value is Preset =>
  value === 'small' || value === 'standard' || value === 'stress';
const isCacheMode = (value: string | null): value is CacheMode =>
  value === 'warm' || value === 'no-store';

export function parseConfig(search = window.location.search): BenchmarkConfig | null {
  const params = new URLSearchParams(search);
  const variant = params.get('variant');
  if (!isVariant(variant)) return null;

  const presetValue = params.get('preset');
  const cacheValue = params.get('cache');
  return {
    variant,
    preset: isPreset(presetValue) ? presetValue : 'standard',
    seed: boundedNumber(params.get('seed'), 2026, 1, 999_999),
    runCount: boundedNumber(params.get('runs'), 10, 1, 30),
    apiLatencyMs: boundedNumber(params.get('latency'), 0, 0, 2000),
    cacheMode: isCacheMode(cacheValue) ? cacheValue : 'warm',
    runId: params.get('runId') || crypto.randomUUID(),
  };
}

export function boundedNumber(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function benchmarkUrl(config: BenchmarkConfig, autoRun = false): string {
  const url = new URL(import.meta.env.BASE_URL, window.location.href);
  url.searchParams.set('variant', config.variant);
  url.searchParams.set('preset', config.preset);
  url.searchParams.set('seed', String(config.seed));
  url.searchParams.set('runs', String(config.runCount));
  url.searchParams.set('latency', String(config.apiLatencyMs));
  url.searchParams.set('cache', config.cacheMode);
  url.searchParams.set('runId', config.runId);
  if (autoRun) url.searchParams.set('autorun', '1');
  url.hash = '/claim';
  return url.toString();
}
