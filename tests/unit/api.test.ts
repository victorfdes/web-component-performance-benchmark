import { describe, expect, it, vi } from 'vitest';
import { fetchChainedData } from '../../src/data/api';
import type { BenchmarkConfig, ManifestResponse } from '../../src/types';

const config: BenchmarkConfig = {
  variant: 'angular',
  preset: 'small',
  seed: 2026,
  runCount: 1,
  apiLatencyMs: 0,
  cacheMode: 'warm',
  runId: 'unit-test',
};

function jsonResponse(value: unknown, url: string): Response {
  const response = new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('chained API client', () => {
  it('uses the manifest response to issue exactly three fan-out requests', async () => {
    const manifest: ManifestResponse = {
      version: 1,
      preset: 'small',
      expectedFieldCount: 0,
      schemaUrl: 'schema.json',
      recordUrl: 'record.json',
      referenceUrl: 'reference.json',
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('manifest.json')) return jsonResponse(manifest, 'https://example.test/api/small/manifest.json');
      if (url.endsWith('schema.json')) return jsonResponse({ id: 'schema', version: 1, sections: [], fields: [] }, url);
      if (url.endsWith('record.json')) return jsonResponse({ caseId: 'case', claimantName: 'A', policyNumber: 'P', jurisdiction: 'J', values: {} }, url);
      return jsonResponse({ options: {}, riskWeights: {}, workflowStates: [], regionDependencies: {} }, url);
    });

    const result = await fetchChainedData(config, undefined, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.slice(1).map((call) => String(call[0])).sort()).toEqual([
      'https://example.test/api/small/record.json',
      'https://example.test/api/small/reference.json',
      'https://example.test/api/small/schema.json',
    ]);
    expect(result.timings.bytes).toBeGreaterThan(0);
  });
});
