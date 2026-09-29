import type { BenchmarkRunResult, MetricStats, VariantSummary } from './types';

function quantile(sorted: number[], percentile: number): number {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export function metricStats(samples: number[]): MetricStats {
  if (!samples.length) return { samples: 0, min: 0, median: 0, p95: 0, max: 0, mad: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  return {
    samples: sorted.length,
    min: sorted[0] ?? 0,
    median,
    p95: quantile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
    mad: quantile(deviations, 0.5),
  };
}

export function summarizeVariant(runs: BenchmarkRunResult[]): VariantSummary {
  return {
    readyToInteract: metricStats(runs.map((run) => run.readyToInteractMs)),
    payloadBuild: metricStats(runs.map((run) => run.payloadBuildMs)),
  };
}

export function comparisonVerdict(
  angular: VariantSummary,
  webComponent: VariantSummary,
  payloadsMatch: boolean,
): string {
  if (!payloadsMatch) return 'Invalid comparison: payload checksums differ.';
  const left = angular.readyToInteract;
  const right = webComponent.readyToInteract;
  const delta = left.median - right.median;
  const noise = Math.max(left.mad + right.mad, Math.min(left.median, right.median) * 0.03);
  if (Math.abs(delta) <= noise) return 'Inconclusive: the observed difference is within run-to-run variability.';
  const baseline = Math.max(left.median, 0.001);
  const percentage = Math.abs((delta / baseline) * 100).toFixed(1);
  return delta > 0
    ? `Web Component was ${percentage}% faster in this browser session.`
    : `AngularJS was ${percentage}% faster in this browser session.`;
}
