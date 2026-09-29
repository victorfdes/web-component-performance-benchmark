import type {
  ChainedApiResponse,
  CompiledField,
  CompiledFormModel,
  FieldDefinition,
  FieldValue,
  ModelSummaries,
  OptionDefinition,
} from '../types';

function normalizeValue(field: FieldDefinition, value: FieldValue): FieldValue {
  if (value == null) return field.type === 'multiselect' ? [] : '';
  if (['number', 'currency', 'percentage', 'range'].includes(field.type)) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  if (field.type === 'checkbox' || field.type === 'toggle') return Boolean(value);
  if (field.type === 'multiselect') return Array.isArray(value) ? value.map(String) : [];
  if (field.type === 'date') return String(value).slice(0, 10);
  if (field.type === 'datetime') return String(value).slice(0, 16);
  return String(value);
}

function valuesEqual(left: FieldValue, right: FieldValue): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.join('\u0000') === right.join('\u0000')
    : left === right;
}

export function evaluateVisibility(field: CompiledField, values: Record<string, FieldValue>): boolean {
  const rule = field.visibleWhen;
  if (!rule) return true;
  const actual = values[rule.fieldId] ?? null;
  if (rule.operator === 'equals') return valuesEqual(actual, rule.value);
  if (rule.operator === 'not-equals') return !valuesEqual(actual, rule.value);
  return Number(actual) >= Number(rule.value);
}

export function validateField(field: CompiledField, values: Record<string, FieldValue>): string[] {
  if (!field.visible) return [];
  const value = values[field.id];
  const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
  const errors: string[] = [];
  if (field.required && empty) errors.push('This field is required.');
  if (empty) return errors;

  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
    errors.push('Enter a valid email address.');
  }
  if (field.pattern && !new RegExp(field.pattern).test(String(value))) {
    errors.push('The value does not match the required format.');
  }
  if (['number', 'currency', 'percentage', 'range'].includes(field.type)) {
    const numeric = Number(value);
    if (field.min != null && numeric < field.min) errors.push(`Minimum value is ${field.min}.`);
    if (field.max != null && numeric > field.max) errors.push(`Maximum value is ${field.max}.`);
  }
  if (field.afterFieldId && String(value) < String(values[field.afterFieldId] ?? '')) {
    errors.push('Date must not be earlier than its related start date.');
  }
  return errors;
}

export function computeSummaries(model: Pick<CompiledFormModel, 'fields' | 'values'>): ModelSummaries {
  let totalReserve = 0;
  let exposure = 0;
  let riskScore = 0;
  let completed = 0;
  let visibleFields = 0;
  let errorCount = 0;

  for (const field of model.fields) {
    if (!field.visible) continue;
    visibleFields += 1;
    const value = model.values[field.id];
    if (value !== '' && value != null && (!Array.isArray(value) || value.length > 0)) completed += 1;
    errorCount += field.errors.length;
    if (field.type === 'currency') totalReserve += Number(value) || 0;
    if (field.type === 'number' || field.type === 'percentage' || field.type === 'range') {
      const numeric = Number(value) || 0;
      exposure += numeric * ((field.order % 7) + 1);
      riskScore += Math.log1p(Math.abs(numeric)) * ((field.order % 11) + 0.5);
    }
    if (field.type === 'checkbox' || field.type === 'toggle') riskScore += value ? 1.75 : 0.25;
    if (typeof value === 'string') {
      for (let index = 0; index < Math.min(value.length, 24); index += 1) {
        riskScore += value.charCodeAt(index) * 0.000013 * ((index % 3) + 1);
      }
    }
  }

  return {
    totalReserve: Math.round(totalReserve * 100) / 100,
    exposure: Math.round(exposure * 100) / 100,
    riskScore: Math.round((riskScore % 1000) * 100) / 100,
    completion: visibleFields ? Math.round((completed / visibleFields) * 10_000) / 100 : 0,
    visibleFields,
    errorCount,
  };
}

function validateAndSummarize(model: CompiledFormModel): void {
  for (const field of model.fields) field.visible = evaluateVisibility(field, model.values);
  for (const field of model.fields) field.errors = validateField(field, model.values);
  model.summaries = computeSummaries(model);
}

function optionsFor(field: FieldDefinition, lookup: Record<string, OptionDefinition[]>): OptionDefinition[] {
  return field.optionsKey ? [...(lookup[field.optionsKey] ?? [])] : [];
}

export function compileFormModel(data: ChainedApiResponse, seed: number): CompiledFormModel {
  const fields: CompiledField[] = data.schema.fields
    .slice()
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((field) => ({
      ...field,
      options: optionsFor(field, data.reference.options),
      visible: true,
      errors: [],
    }));

  const values: Record<string, FieldValue> = {};
  const fieldIndex: Record<string, CompiledField> = {};
  for (const field of fields) {
    fieldIndex[field.id] = field;
    values[field.id] = normalizeValue(field, data.record.values[field.id] ?? null);
  }

  const sections = data.schema.sections
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      ...section,
      fields: fields.filter((field) => field.sectionId === section.id),
    }));

  const model: CompiledFormModel = {
    schemaId: data.schema.id,
    schemaVersion: data.schema.version,
    caseId: data.record.caseId,
    claimantName: data.record.claimantName,
    policyNumber: data.record.policyNumber,
    jurisdiction: data.record.jurisdiction,
    preset: data.manifest.preset,
    seed,
    sections,
    fields,
    fieldIndex,
    values,
    initialValues: structuredClone(values),
    summaries: { totalReserve: 0, exposure: 0, riskScore: 0, completion: 0, visibleFields: 0, errorCount: 0 },
  };
  validateAndSummarize(model);
  return model;
}

export function updateFieldValue(model: CompiledFormModel, fieldId: string, value: FieldValue): void {
  const field = model.fieldIndex[fieldId];
  if (!field) return;
  model.values[fieldId] = normalizeValue(field, value);
  validateAndSummarize(model);
}

export function resetModel(model: CompiledFormModel): void {
  model.values = structuredClone(model.initialValues);
  validateAndSummarize(model);
}

export function cloneModel(model: CompiledFormModel): CompiledFormModel {
  const clone = structuredClone(model);
  clone.fieldIndex = Object.fromEntries(clone.fields.map((field) => [field.id, field]));
  for (const section of clone.sections) {
    section.fields = section.fields.map((field) => clone.fieldIndex[field.id] as CompiledField);
  }
  return clone;
}
