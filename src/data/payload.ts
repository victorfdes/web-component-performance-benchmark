import { validateField } from './pipeline';
import type { CanonicalClaimPayload, CompiledFormModel, FieldValue, PayloadBuildResult } from '../types';

export function canonicalizePayload(model: CompiledFormModel): { payload: CanonicalClaimPayload; json: string; bytes: number; durationMs: number } {
  const start = performance.now();
  let errorCount = 0;
  const values: Record<string, FieldValue> = {};
  const visibleFields = model.fields.filter((field) => field.visible).sort((a, b) => a.id.localeCompare(b.id));
  for (const field of visibleFields) {
    field.errors = validateField(field, model.values);
    errorCount += field.errors.length;
    const value = model.values[field.id] ?? null;
    values[field.id] = Array.isArray(value) ? [...value].sort() : value;
  }

  const payload: CanonicalClaimPayload = {
    caseId: model.caseId,
    schema: { id: model.schemaId, version: model.schemaVersion },
    values,
    summaries: { ...model.summaries, errorCount },
    validation: { valid: errorCount === 0, errorCount },
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json).byteLength;
  const durationMs = performance.now() - start;
  return { payload, json, bytes, durationMs };
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildPayload(model: CompiledFormModel): Promise<PayloadBuildResult> {
  const result = canonicalizePayload(model);
  const checksum = await sha256(result.json);
  return {
    json: result.json,
    bytes: result.bytes,
    durationMs: result.durationMs,
    checksum,
    valid: result.payload.validation.valid,
    errorCount: result.payload.validation.errorCount,
  };
}
