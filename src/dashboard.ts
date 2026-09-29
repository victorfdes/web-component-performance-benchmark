import { benchmarkUrl, PRESET_LABELS } from './config';
import { formatMs } from './metrics';
import { clearSessions, loadSessions, saveSession } from './storage';
import { comparisonVerdict, summarizeVariant } from './stats';
import type { BenchmarkConfig, BenchmarkRunResult, BenchmarkSession, CacheMode, Preset, Variant } from './types';

let sessions = loadSessions().value;
let cancelled = false;
let activeFrame: HTMLIFrameElement | null = null;
let activeReject: ((reason: Error) => void) | null = null;

function dashboardTemplate(): string {
  return `
    <main class="shell dashboard-shell">
      <header class="topbar">
        <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Form comparison home"><span class="brand-mark">A/W</span><span><strong>AngularJS vs Web Components</strong><small>Forms</small></span></a>
        <span class="status-pill"><i></i> Deterministic benchmark</span>
      </header>
      <section class="hero dashboard-hero">
        <div><p class="eyebrow">Form renderer comparison</p><h1>AngularJS vs Web Components in Forms</h1><p class="lede">The same form rendered by AngularJS and by a Web Component mounted from AngularJS.</p></div>
        <div class="hero-stat"><span>DEFAULT WORKLOAD</span><strong>1,000</strong><small>prefilled controls</small></div>
      </section>
      <section class="control-panel" aria-label="Benchmark configuration">
        <div class="control"><span>01</span><label for="preset">Workload<select id="preset"><option value="small">${PRESET_LABELS.small}</option><option value="standard" selected>${PRESET_LABELS.standard}</option><option value="stress">${PRESET_LABELS.stress}</option></select></label></div>
        <div class="control"><span>02</span><label for="runs">Measured runs<select id="runs"><option value="5">5 runs + warm-up</option><option value="10" selected>10 runs + warm-up</option><option value="20">20 runs + warm-up</option></select></label></div>
        <button id="run-comparison" type="button" class="run-button">Run comparison <b>→</b></button>
      </section>
      <details class="advanced-controls"><summary>Advanced benchmark controls</summary><div>
        <label>Deterministic seed<input id="seed" type="number" min="1" max="999999" value="2026"></label>
        <label>API latency<select id="latency"><option value="0">Network only</option><option value="50">50 ms per stage</option><option value="150">150 ms per stage</option><option value="400">400 ms per stage</option></select></label>
        <label>Cache behavior<select id="cache-mode"><option value="warm">Normal / warm</option><option value="no-store">No-store requests</option></select></label>
      </div></details>
      <div id="dashboard-notice" class="dashboard-notice" role="status">Keep this tab in the foreground while measuring. Browser, device, temperature, and extensions affect results.</div>
      <section class="comparison-grid" aria-label="Comparison results">
        <article class="metric-card angular-card"><div class="card-label"><span>AngularJS form</span><b>ANGULARJS</b></div><strong id="angular-ready">—</strong><p>Median ready to interact</p><div class="mini-metrics"><span>Payload <b id="angular-payload">—</b></span><span>P95 <b id="angular-p95">—</b></span><span>MAD <b id="angular-mad">—</b></span></div><footer id="angular-footer">Waiting for first run</footer></article>
        <div class="versus">VS</div>
        <article class="metric-card web-card"><div class="card-label"><span>AngularJS + Web Component form</span><b>WEB COMPONENT</b></div><strong id="web-ready">—</strong><p>Median ready to interact</p><div class="mini-metrics"><span>Payload <b id="web-payload">—</b></span><span>P95 <b id="web-p95">—</b></span><span>MAD <b id="web-mad">—</b></span></div><footer id="web-footer">Waiting for first run</footer></article>
      </section>
      <section id="verdict" class="verdict-panel"><span>Result</span><strong>No evidence collected yet.</strong><p>Run both variants in this browser to compare medians and variability.</p></section>
      <section class="method-strip"><span>Manifest</span><b>→</b><span>3 parallel API calls</span><b>→</b><span>Shared compute</span><b>→</b><span>Verified interaction</span><b>→</b><span>Matching SHA-256</span></section>
      <section class="variant-links"><a id="open-angular" class="secondary-button" href="#">Open AngularJS form</a><a id="open-web" class="secondary-button" href="#">Open AngularJS + Web Component form</a></section>
      <section id="run-stage" class="run-stage" hidden><header><div><span class="spinner"></span><strong id="run-progress">Preparing benchmark…</strong></div><button id="stop-run" class="secondary-button" type="button">Stop</button></header><div id="frame-host"></div></section>
      <section class="history-panel"><header><div><p class="eyebrow">Saved in this browser</p><h2>Session history</h2></div><div><button id="export-json" class="text-button" type="button">Export JSON</button><button id="export-csv" class="text-button" type="button">Export CSV</button><button id="clear-history" class="text-button danger" type="button">Clear</button></div></header><div id="history-table"></div></section>
      <section class="methodology"><article><span>01</span><h3>Measurement method</h3><p>One warm-up is discarded. Measured runs alternate order and report median, p95, and median absolute deviation.</p></article><article><span>02</span><h3>Output check</h3><p>Every run validates, canonicalizes, serializes, and hashes the payload. A checksum mismatch invalidates the comparison.</p></article><article><span>03</span><h3>Metric definition</h3><p>“Ready to interact” is this benchmark’s navigation-to-verified-input measure, not a standardized Web Vital or universal forecast.</p></article></section>
    </main>`;
}

function currentConfig(variant: Variant, runId = crypto.randomUUID()): BenchmarkConfig {
  const preset = (document.querySelector<HTMLSelectElement>('#preset')?.value || 'standard') as Preset;
  const cacheMode = (document.querySelector<HTMLSelectElement>('#cache-mode')?.value || 'warm') as CacheMode;
  return {
    variant,
    preset,
    seed: Number(document.querySelector<HTMLInputElement>('#seed')?.value || 2026),
    runCount: Number(document.querySelector<HTMLSelectElement>('#runs')?.value || 10),
    apiLatencyMs: Number(document.querySelector<HTMLSelectElement>('#latency')?.value || 0),
    cacheMode,
    runId,
  };
}

function updateLinks(): void {
  document.querySelector<HTMLAnchorElement>('#open-angular')!.href = benchmarkUrl(currentConfig('angular'));
  document.querySelector<HTMLAnchorElement>('#open-web')!.href = benchmarkUrl(currentConfig('web-component'));
}

function isRunResult(value: unknown): value is BenchmarkRunResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BenchmarkRunResult>;
  return candidate.type === 'benchmark-result' && typeof candidate.readyToInteractMs === 'number' && typeof candidate.checksum === 'string';
}

async function runSingle(config: BenchmarkConfig, label: string): Promise<BenchmarkRunResult> {
  const host = document.querySelector<HTMLElement>('#frame-host')!;
  host.replaceChildren();
  const frame = document.createElement('iframe');
  frame.className = 'benchmark-frame';
  frame.title = `${label} visible benchmark run`;
  frame.src = benchmarkUrl(config, true);
  activeFrame = frame;
  host.append(frame);
  document.querySelector<HTMLElement>('#run-progress')!.textContent = label;

  return new Promise<BenchmarkRunResult>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error(`${label} timed out.`)), config.preset === 'stress' ? 210_000 : 120_000);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
      if (isRunResult(event.data) && event.data.config.runId === config.runId) finish(null, event.data);
      else if (event.data?.type === 'benchmark-error' && event.data.runId === config.runId) finish(new Error(event.data.message));
    };
    const finish = (error: Error | null, result?: BenchmarkRunResult) => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      activeReject = null;
      activeFrame = null;
      frame.remove();
      if (error) reject(error);
      else if (result) resolve(result);
    };
    activeReject = (reason) => finish(reason);
    window.addEventListener('message', onMessage);
  });
}

async function runComparison(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('#run-comparison')!;
  const stage = document.querySelector<HTMLElement>('#run-stage')!;
  const notice = document.querySelector<HTMLElement>('#dashboard-notice')!;
  cancelled = false;
  button.disabled = true;
  stage.hidden = false;
  stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const angular: BenchmarkRunResult[] = [];
  const webComponent: BenchmarkRunResult[] = [];
  const base = currentConfig('angular');

  try {
    for (const variant of ['angular', 'web-component'] as Variant[]) {
      if (cancelled) throw new Error('Benchmark cancelled.');
      await runSingle({ ...base, variant, runId: `warmup-${variant}-${crypto.randomUUID()}` }, `Warm-up · ${variant === 'angular' ? 'AngularJS' : 'Web Component'}`);
    }
    for (let iteration = 0; iteration < base.runCount; iteration += 1) {
      const order: Variant[] = iteration % 2 === 0 ? ['angular', 'web-component'] : ['web-component', 'angular'];
      for (const variant of order) {
        if (cancelled) throw new Error('Benchmark cancelled.');
        const label = `Run ${iteration + 1} of ${base.runCount} · ${variant === 'angular' ? 'AngularJS' : 'Web Component'}`;
        const result = await runSingle({ ...base, variant, runId: `${iteration}-${variant}-${crypto.randomUUID()}` }, label);
        (variant === 'angular' ? angular : webComponent).push(result);
        renderLiveProgress(angular, webComponent, base.runCount);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
    }
    const angularSummary = summarizeVariant(angular);
    const webSummary = summarizeVariant(webComponent);
    const payloadsMatch = angular.every((run, index) => run.checksum === webComponent[index]?.checksum);
    const session: BenchmarkSession = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      config: { preset: base.preset, seed: base.seed, runCount: base.runCount, apiLatencyMs: base.apiLatencyMs, cacheMode: base.cacheMode },
      angular,
      webComponent,
      summaries: { angular: angularSummary, webComponent: webSummary },
      payloadsMatch,
      verdict: comparisonVerdict(angularSummary, webSummary, payloadsMatch),
    };
    const stored = saveSession(session);
    sessions = stored.value;
    renderSession(session);
    renderHistory();
    notice.textContent = stored.persisted ? 'Benchmark complete. Results were saved in this browser.' : 'Benchmark complete. Browser storage was unavailable; results are held in memory only.';
  } catch (error) {
    notice.textContent = error instanceof Error ? error.message : 'Benchmark stopped unexpectedly.';
  } finally {
    button.disabled = false;
    stage.hidden = true;
  }
}

function renderLiveProgress(angular: BenchmarkRunResult[], web: BenchmarkRunResult[], total: number): void {
  const completed = angular.length + web.length;
  document.querySelector<HTMLElement>('#dashboard-notice')!.textContent = `${completed} of ${total * 2} measured runs complete. Keep this tab visible.`;
  if (angular.length) renderVariant('angular', summarizeVariant(angular), angular.length, total);
  if (web.length) renderVariant('web', summarizeVariant(web), web.length, total);
}

function renderVariant(prefix: 'angular' | 'web', summary: ReturnType<typeof summarizeVariant>, count: number, total: number): void {
  document.querySelector<HTMLElement>(`#${prefix}-ready`)!.textContent = formatMs(summary.readyToInteract.median);
  document.querySelector<HTMLElement>(`#${prefix}-payload`)!.textContent = formatMs(summary.payloadBuild.median);
  document.querySelector<HTMLElement>(`#${prefix}-p95`)!.textContent = formatMs(summary.readyToInteract.p95);
  document.querySelector<HTMLElement>(`#${prefix}-mad`)!.textContent = formatMs(summary.readyToInteract.mad);
  document.querySelector<HTMLElement>(`#${prefix}-footer`)!.textContent = `${count} / ${total} measured samples`;
}

function renderSession(session: BenchmarkSession): void {
  renderVariant('angular', session.summaries.angular, session.angular.length, session.config.runCount);
  renderVariant('web', session.summaries.webComponent, session.webComponent.length, session.config.runCount);
  const verdict = document.querySelector<HTMLElement>('#verdict')!;
  const angularMedian = session.summaries.angular.readyToInteract.median;
  const webMedian = session.summaries.webComponent.readyToInteract.median;
  const delta = angularMedian ? ((webMedian - angularMedian) / angularMedian) * 100 : 0;
  verdict.innerHTML = `<span>Observed result · ${session.payloadsMatch ? 'payloads matched' : 'invalid payloads'}</span><strong>${session.verdict}</strong><p>Web Component vs. AngularJS median delta: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}%. This describes this browser session only.</p>`;
}

function renderHistory(): void {
  const host = document.querySelector<HTMLElement>('#history-table')!;
  if (!sessions.length) {
    host.innerHTML = '<div class="empty-history">No saved sessions yet. Completed comparisons appear here.</div>';
    return;
  }
  host.innerHTML = `<div class="history-row history-head"><span>Date</span><span>Workload</span><span>AngularJS</span><span>Web Component</span><span>Payload</span></div>${sessions.slice(0, 10).map((session) => `
    <div class="history-row"><span>${new Date(session.timestamp).toLocaleString()}</span><span>${PRESET_LABELS[session.config.preset]}</span><span>${formatMs(session.summaries.angular.readyToInteract.median)}</span><span>${formatMs(session.summaries.webComponent.readyToInteract.median)}</span><span class="${session.payloadsMatch ? 'match' : 'mismatch'}">${session.payloadsMatch ? 'Matched' : 'Mismatch'}</span></div>`).join('')}`;
}

function download(filename: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportCsv(): void {
  const header = ['session_id', 'timestamp', 'preset', 'variant', 'sample', 'ready_ms', 'payload_ms', 'payload_bytes', 'checksum', 'browser'];
  const rows = sessions.flatMap((session) => ([
    ...session.angular.map((run, index) => [session.id, session.timestamp, session.config.preset, 'angular', index + 1, run.readyToInteractMs, run.payloadBuildMs, run.payloadBytes, run.checksum, run.environment.userAgent]),
    ...session.webComponent.map((run, index) => [session.id, session.timestamp, session.config.preset, 'web-component', index + 1, run.readyToInteractMs, run.payloadBuildMs, run.payloadBytes, run.checksum, run.environment.userAgent]),
  ])).map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','));
  download('angular-web-component-benchmark.csv', [header.join(','), ...rows].join('\n'), 'text/csv');
}

export function startDashboard(): void {
  document.title = 'AngularJS vs Web Components in Forms';
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = dashboardTemplate();
  updateLinks();
  renderHistory();
  if (sessions[0]) renderSession(sessions[0]);
  for (const id of ['preset', 'runs', 'seed', 'latency', 'cache-mode']) document.querySelector(`#${id}`)?.addEventListener('change', updateLinks);
  document.querySelector<HTMLButtonElement>('#run-comparison')!.addEventListener('click', () => void runComparison());
  document.querySelector<HTMLButtonElement>('#stop-run')!.addEventListener('click', () => {
    cancelled = true;
    activeFrame?.remove();
    activeFrame = null;
    activeReject?.(new Error('Benchmark cancelled.'));
    activeReject = null;
  });
  document.querySelector<HTMLButtonElement>('#export-json')!.addEventListener('click', () => download('angular-web-component-benchmark.json', JSON.stringify(sessions, null, 2), 'application/json'));
  document.querySelector<HTMLButtonElement>('#export-csv')!.addEventListener('click', exportCsv);
  document.querySelector<HTMLButtonElement>('#clear-history')!.addEventListener('click', () => {
    sessions = clearSessions().value;
    renderHistory();
  });
}
