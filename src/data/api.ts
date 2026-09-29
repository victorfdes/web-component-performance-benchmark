import type {
  ApiTimings,
  BenchmarkConfig,
  CaseRecordResponse,
  ChainedApiResponse,
  FormSchemaResponse,
  ManifestResponse,
  ReferenceDataResponse,
} from '../types';

export type Fetcher = typeof fetch;

export class ApiChainError extends Error {
  constructor(
    public readonly stage: 'manifest' | 'schema' | 'record' | 'reference',
    public readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiChainError';
  }
}

async function pause(duration: number, signal?: AbortSignal): Promise<void> {
  if (duration <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, duration);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('The request was cancelled.', 'AbortError'));
    }, { once: true });
  });
}

async function fetchJson<T>(
  stage: ApiChainError['stage'],
  url: string,
  fetcher: Fetcher,
  config: BenchmarkConfig,
  signal?: AbortSignal,
): Promise<{ data: T; bytes: number; responseUrl: string }> {
  let response: Response;
  try {
    response = await fetcher(url, {
      cache: config.cacheMode === 'no-store' ? 'no-store' : 'default',
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new ApiChainError(stage, url, error instanceof Error ? error.message : 'Network request failed');
  }
  if (!response.ok) {
    throw new ApiChainError(stage, url, `HTTP ${response.status}`);
  }
  const text = await response.text();
  try {
    return {
      data: JSON.parse(text) as T,
      bytes: new TextEncoder().encode(text).byteLength,
      responseUrl: response.url || url,
    };
  } catch {
    throw new ApiChainError(stage, url, 'The endpoint returned invalid JSON');
  }
}

export async function fetchChainedData(
  config: BenchmarkConfig,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<{ data: ChainedApiResponse; timings: ApiTimings }> {
  const start = performance.now();
  await pause(config.apiLatencyMs, signal);

  const manifestUrl = new URL(
    `api/${config.preset}/manifest.json${config.cacheMode === 'no-store' ? `?run=${encodeURIComponent(config.runId)}` : ''}`,
    new URL(import.meta.env.BASE_URL, window.location.href),
  ).toString();
  const manifestResult = await fetchJson<ManifestResponse>('manifest', manifestUrl, fetcher, config, signal);
  const manifestDone = performance.now();

  await pause(config.apiLatencyMs, signal);
  const childUrl = (path: string) => new URL(path, manifestResult.responseUrl).toString();
  const [schemaResult, recordResult, referenceResult] = await Promise.all([
    fetchJson<FormSchemaResponse>('schema', childUrl(manifestResult.data.schemaUrl), fetcher, config, signal),
    fetchJson<CaseRecordResponse>('record', childUrl(manifestResult.data.recordUrl), fetcher, config, signal),
    fetchJson<ReferenceDataResponse>('reference', childUrl(manifestResult.data.referenceUrl), fetcher, config, signal),
  ]);
  const done = performance.now();

  if (manifestResult.data.expectedFieldCount !== schemaResult.data.fields.length) {
    throw new ApiChainError('schema', childUrl(manifestResult.data.schemaUrl), 'Manifest and schema field counts differ');
  }

  return {
    data: {
      manifest: manifestResult.data,
      schema: schemaResult.data,
      record: recordResult.data,
      reference: referenceResult.data,
    },
    timings: {
      bootstrapMs: manifestDone - start,
      fanoutMs: done - manifestDone,
      totalMs: done - start,
      bytes: manifestResult.bytes + schemaResult.bytes + recordResult.bytes + referenceResult.bytes,
    },
  };
}
