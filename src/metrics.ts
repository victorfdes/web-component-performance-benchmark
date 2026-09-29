import type { LongTaskSummary, RuntimeEnvironment } from './types';

declare const __APP_REVISION__: string;

export class LongTaskMonitor {
  private entries: number[] = [];
  private observer: PerformanceObserver | null = null;
  readonly supported = typeof PerformanceObserver !== 'undefined'
    && PerformanceObserver.supportedEntryTypes?.includes('longtask');

  start(): void {
    if (!this.supported) return;
    this.observer = new PerformanceObserver((list) => {
      this.entries.push(...list.getEntries().map((entry) => entry.duration));
    });
    this.observer.observe({ entryTypes: ['longtask'] });
  }

  stop(): LongTaskSummary {
    this.observer?.disconnect();
    return {
      supported: this.supported,
      count: this.entries.length,
      totalMs: this.entries.reduce((sum, duration) => sum + duration, 0),
      longestMs: this.entries.length ? Math.max(...this.entries) : 0,
    };
  }
}

export function runtimeEnvironment(): RuntimeEnvironment {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    deviceMemory: navigatorWithMemory.deviceMemory ?? null,
    viewport: `${window.innerWidth}×${window.innerHeight}@${window.devicePixelRatio}`,
    revision: typeof __APP_REVISION__ === 'string' ? __APP_REVISION__ : 'local',
  };
}

export const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export async function waitForPaint(): Promise<number> {
  const start = performance.now();
  await nextFrame();
  await nextFrame();
  return performance.now() - start;
}

export function formatMs(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(1)} ms`;
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}
