import { fetchChainedData, ApiChainError } from './data/api';
import { compileFormModel } from './data/pipeline';
import { formatBytes, formatMs, LongTaskMonitor, runtimeEnvironment, waitForPaint } from './metrics';
import type { RendererHandle, RendererMount } from './renderers/types';
import type { BenchmarkConfig, BenchmarkRunResult, PhaseTimings } from './types';

interface FormRuntime {
  renderer: RendererHandle;
  result: BenchmarkRunResult;
}

function rendererLabel(config: BenchmarkConfig): string {
  return config.variant === 'angular' ? 'AngularJS form' : 'AngularJS + Web Component form';
}

function renderShell(config: BenchmarkConfig): void {
  document.title = `${rendererLabel(config)} · AngularJS vs Web Components in Forms`;
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <main class="form-shell">
      <header class="topbar form-topbar">
        <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="Back to form comparison">
          <span class="brand-mark">A/W</span>
          <span><strong>AngularJS vs Web Components</strong><small>Forms · ${rendererLabel(config)}</small></span>
        </a>
        <span class="status-pill"><i></i> ${config.preset} workload</span>
      </header>
      <section class="case-heading">
        <div><p class="eyebrow">Form implementation</p><h1>${rendererLabel(config)}</h1><p id="case-meta" class="lede">Loading chained case data…</p></div>
        <div class="case-actions"><button id="reset-form" class="secondary-button" type="button" disabled>Reset form</button><button id="build-payload" class="run-button compact" type="button" disabled>Build payload <b>→</b></button></div>
      </section>
      <section class="live-metrics" aria-label="Benchmark metrics">
        <article class="live-metric primary"><span>Ready to interact <button class="info-dot" title="Project-defined metric from navigation start through a verified usable input.">i</button></span><strong id="metric-ready">—</strong><small>Navigation → verified input</small></article>
        <article class="live-metric"><span>Payload build</span><strong id="metric-payload">—</strong><small id="payload-meta">Awaiting form</small></article>
        <article class="live-metric"><span>Fields</span><strong id="metric-fields">—</strong><small id="visible-fields">Configured workload</small></article>
        <article class="live-metric"><span>Long tasks</span><strong id="metric-longtasks">—</strong><small id="longtask-meta">Observing main thread</small></article>
      </section>
      <details class="phase-panel">
        <summary>Timing breakdown and environment <span>Project metric · not the discontinued standardized TTI</span></summary>
        <div id="phase-grid" class="phase-grid"><span>Metrics appear when the form is ready.</span></div>
      </details>
      <div id="form-status" class="notice loading-notice" role="status"><span class="spinner"></span><div><strong>Fetching benchmark manifest</strong><small>The manifest will trigger three parallel API requests.</small></div></div>
      <div id="renderer-root"></div>
    </main>`;
}

function updateStatus(title: string, detail: string): void {
  const status = document.querySelector<HTMLElement>('#form-status');
  if (!status) return;
  status.innerHTML = `<span class="spinner"></span><div><strong>${title}</strong><small>${detail}</small></div>`;
}

function renderPhases(result: BenchmarkRunResult): void {
  const phase = result.phaseTimings;
  const cells: [string, number | string][] = [
    ['Manifest API', phase.bootstrapMs], ['3-request fan-out', phase.fanoutMs], ['Shared processing', phase.processingMs],
    ['Render & bind', phase.renderBindMs], ['Paint opportunity', phase.paintMs], ['Verified interaction', phase.interactionMs],
    ['API transfer', formatBytes(phase.bytes)], ['Environment', `${result.environment.hardwareConcurrency ?? '—'} logical CPUs`],
  ];
  document.querySelector<HTMLElement>('#phase-grid')!.innerHTML = cells.map(([label, value]) => `
    <div><span>${label}</span><strong>${typeof value === 'number' ? formatMs(value) : value}</strong></div>`).join('');
}

async function selectRenderer(config: BenchmarkConfig): Promise<RendererMount> {
  if (config.variant === 'angular') {
    return (await import('./renderers/angular-renderer')).mountAngularRenderer;
  }
  return (await import('./renderers/claim-form')).mountWebComponentRenderer;
}

function showError(error: unknown): void {
  const status = document.querySelector<HTMLElement>('#form-status');
  if (!status) return;
  const isApiError = error instanceof ApiChainError;
  status.className = 'notice error-notice';
  status.innerHTML = `<div><strong>${isApiError ? `API ${error.stage} request failed` : 'Benchmark could not start'}</strong><small>${error instanceof Error ? error.message : 'An unexpected error occurred.'}</small>${isApiError ? `<code>${error.url}</code>` : ''}</div><button id="retry-form" class="secondary-button" type="button">Retry</button>`;
  document.querySelector<HTMLButtonElement>('#retry-form')?.addEventListener('click', () => window.location.reload());
}

export async function startFormApp(config: BenchmarkConfig): Promise<void> {
  renderShell(config);
  const monitor = new LongTaskMonitor();
  monitor.start();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort('Benchmark timed out'), config.preset === 'stress' ? 180_000 : 90_000);

  try {
    updateStatus('Fetching benchmark manifest', 'The manifest will trigger the schema, case, and rules requests.');
    const api = await fetchChainedData(config, controller.signal);
    updateStatus('Consolidating API responses', `${formatBytes(api.timings.bytes)} received across four deterministic requests.`);
    const processingStart = performance.now();
    const model = compileFormModel(api.data, config.seed);
    const processingMs = performance.now() - processingStart;
    document.querySelector<HTMLElement>('#case-meta')!.textContent = `${model.caseId} · ${model.claimantName} · ${model.policyNumber} · ${model.jurisdiction}`;
    document.querySelector<HTMLElement>('#metric-fields')!.textContent = model.fields.length.toLocaleString();
    document.querySelector<HTMLElement>('#visible-fields')!.textContent = `${model.summaries.visibleFields.toLocaleString()} currently visible`;

    updateStatus('Rendering the complete claim', `Building ${model.fields.length.toLocaleString()} controls without virtualization.`);
    const renderStart = performance.now();
    const mount = await selectRenderer(config);
    const renderer = await mount(document.querySelector<HTMLElement>('#renderer-root')!, model);
    const renderBindMs = performance.now() - renderStart;
    const paintMs = await waitForPaint();
    const interactionStart = performance.now();
    await renderer.probeInteraction();
    const interactionMs = performance.now() - interactionStart;
    const readyToInteractMs = performance.now();
    const longTasks = monitor.stop();

    const phaseTimings: PhaseTimings = {
      ...api.timings,
      processingMs,
      renderBindMs,
      paintMs,
      interactionMs,
    };
    const payload = await renderer.buildPayload();
    const result: BenchmarkRunResult = {
      type: 'benchmark-result',
      config,
      timestamp: new Date().toISOString(),
      readyToInteractMs,
      payloadBuildMs: payload.durationMs,
      payloadBytes: payload.bytes,
      checksum: payload.checksum,
      fieldCount: model.fields.length,
      visibleFieldCount: model.summaries.visibleFields,
      phaseTimings,
      longTasks,
      environment: runtimeEnvironment(),
    };
    const runtime: FormRuntime = { renderer, result };

    document.querySelector<HTMLElement>('#form-status')?.remove();
    document.querySelector<HTMLElement>('#metric-ready')!.textContent = formatMs(result.readyToInteractMs);
    document.querySelector<HTMLElement>('#metric-payload')!.textContent = formatMs(result.payloadBuildMs);
    const payloadMeta = document.querySelector<HTMLElement>('#payload-meta')!;
    payloadMeta.textContent = `${formatBytes(result.payloadBytes)} · ${result.checksum.slice(0, 10)}…`;
    payloadMeta.dataset.checksum = result.checksum;
    payloadMeta.title = `SHA-256 ${result.checksum}`;
    document.querySelector<HTMLElement>('#metric-longtasks')!.textContent = result.longTasks.supported ? String(result.longTasks.count) : 'N/A';
    document.querySelector<HTMLElement>('#longtask-meta')!.textContent = result.longTasks.supported
      ? `${formatMs(result.longTasks.totalMs)} total · ${formatMs(result.longTasks.longestMs)} max`
      : 'Long Task API unsupported';
    renderPhases(result);

    const buildButton = document.querySelector<HTMLButtonElement>('#build-payload')!;
    const resetButton = document.querySelector<HTMLButtonElement>('#reset-form')!;
    buildButton.disabled = false;
    resetButton.disabled = false;
    buildButton.addEventListener('click', () => void rebuildPayload(runtime));
    resetButton.addEventListener('click', () => {
      runtime.renderer.reset();
      document.querySelector<HTMLElement>('#payload-meta')!.textContent = 'Form reset · build again to verify';
    });

    if (new URLSearchParams(window.location.search).get('autorun') === '1') {
      window.parent.postMessage(result, window.location.origin);
    }
  } catch (error) {
    monitor.stop();
    showError(error);
    if (new URLSearchParams(window.location.search).get('autorun') === '1') {
      window.parent.postMessage({ type: 'benchmark-error', runId: config.runId, message: error instanceof Error ? error.message : String(error) }, window.location.origin);
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

async function rebuildPayload(runtime: FormRuntime): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('#build-payload')!;
  button.disabled = true;
  button.textContent = 'Building…';
  const payload = await runtime.renderer.buildPayload();
  runtime.result.payloadBuildMs = payload.durationMs;
  runtime.result.payloadBytes = payload.bytes;
  runtime.result.checksum = payload.checksum;
  document.querySelector<HTMLElement>('#metric-payload')!.textContent = formatMs(payload.durationMs);
  const payloadMeta = document.querySelector<HTMLElement>('#payload-meta')!;
  payloadMeta.textContent = `${formatBytes(payload.bytes)} · ${payload.checksum.slice(0, 10)}… · ${payload.errorCount} issues`;
  payloadMeta.dataset.checksum = payload.checksum;
  payloadMeta.title = `SHA-256 ${payload.checksum}`;
  button.disabled = false;
  button.innerHTML = 'Build payload <b>→</b>';
}
