import { beforeEach, describe, expect, it } from 'vitest';
import { clearSessions, loadSessions, saveSession } from '../../src/storage';
import { comparisonVerdict, metricStats } from '../../src/stats';
import type { BenchmarkSession, VariantSummary } from '../../src/types';

describe('benchmark statistics', () => {
  it('calculates median, p95, and median absolute deviation', () => {
    expect(metricStats([10, 12, 11, 100, 9])).toEqual({ samples: 5, min: 9, median: 11, p95: 100, max: 100, mad: 1 });
  });

  it('does not call a winner inside the observed noise', () => {
    const summary = (median: number, mad: number): VariantSummary => ({
      readyToInteract: { samples: 10, min: median - 5, median, p95: median + 5, max: median + 5, mad },
      payloadBuild: { samples: 10, min: 1, median: 2, p95: 3, max: 3, mad: 0.2 },
    });
    expect(comparisonVerdict(summary(100, 5), summary(98, 5), true)).toContain('Inconclusive');
    expect(comparisonVerdict(summary(100, 1), summary(70, 1), false)).toContain('Invalid');
  });
});

describe('session storage', () => {
  beforeEach(() => clearSessions());

  it('keeps only the latest 50 sessions', () => {
    for (let index = 0; index < 55; index += 1) {
      saveSession({ id: String(index), timestamp: new Date(index).toISOString() } as BenchmarkSession);
    }
    expect(loadSessions().value).toHaveLength(50);
    expect(loadSessions().value[0]?.id).toBe('54');
  });
});
