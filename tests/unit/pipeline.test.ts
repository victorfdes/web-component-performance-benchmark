import { describe, expect, it } from 'vitest';
import manifest from '../../public/api/small/manifest.json';
import record from '../../public/api/small/record.json';
import reference from '../../public/api/small/reference.json';
import schema from '../../public/api/small/schema.json';
import { canonicalizePayload, sha256 } from '../../src/data/payload';
import { cloneModel, compileFormModel, resetModel, updateFieldValue } from '../../src/data/pipeline';
import type { ChainedApiResponse } from '../../src/types';

const fixture = { manifest, record, reference, schema } as unknown as ChainedApiResponse;

describe('shared form pipeline', () => {
  it('consolidates the deterministic API responses into a validated form model', () => {
    const model = compileFormModel(fixture, 2026);
    expect(model.fields).toHaveLength(300);
    expect(model.sections).toHaveLength(8);
    expect(model.summaries.visibleFields).toBeLessThan(300);
    expect(model.summaries.totalReserve).toBeGreaterThan(0);
    expect(Object.keys(model.fieldIndex)).toHaveLength(300);
  });

  it('recalculates derived state and can restore the initial model', () => {
    const model = compileFormModel(fixture, 2026);
    const textField = model.fields.find((field) => field.type === 'text');
    expect(textField).toBeTruthy();
    const original = model.values[textField!.id];
    updateFieldValue(model, textField!.id, 'Updated during test');
    expect(model.values[textField!.id]).toBe('Updated during test');
    resetModel(model);
    expect(model.values[textField!.id]).toEqual(original);
  });

  it('creates byte-identical canonical payloads from equivalent renderer models', () => {
    const source = compileFormModel(fixture, 2026);
    const angularModel = cloneModel(source);
    const webModel = cloneModel(source);
    const angularPayload = canonicalizePayload(angularModel);
    const webPayload = canonicalizePayload(webModel);
    expect(angularPayload.json).toBe(webPayload.json);
    expect(angularPayload.bytes).toBe(webPayload.bytes);
  });

  it('uses a stable SHA-256 checksum', async () => {
    await expect(sha256('abc')).resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
