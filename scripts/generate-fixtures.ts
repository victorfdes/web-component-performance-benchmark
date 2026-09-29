import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  CaseRecordResponse,
  FieldDefinition,
  FieldType,
  FieldValue,
  FormSchemaResponse,
  ManifestResponse,
  OptionDefinition,
  Preset,
  ReferenceDataResponse,
  SectionDefinition,
} from '../src/types';

const ROOT = resolve(process.cwd(), 'public/api');
const PRESETS: Record<Preset, number> = { small: 300, standard: 1000, stress: 3000 };

const SECTION_BLUEPRINTS = [
  ['claimant', 'Claimant & contacts', 'Identity, communication preferences, and representation details.'],
  ['policy', 'Policy & coverage', 'Coverage verification, limits, deductibles, and endorsements.'],
  ['incident', 'Incident chronology', 'Loss circumstances, dates, location, and contributing conditions.'],
  ['losses', 'Loss item schedule', 'Repeated property, service, and replacement-cost assessments.'],
  ['medical', 'Injury & treatment', 'Care milestones, providers, work status, and recovery indicators.'],
  ['financial', 'Reserves & payments', 'Indemnity, expense, recovery, and settlement projections.'],
  ['risk', 'Risk & compliance', 'Fraud indicators, jurisdiction rules, and escalation controls.'],
  ['review', 'Adjudication review', 'Decision rationale, approvals, quality checks, and hand-off.'],
] as const;

const TYPES: FieldType[] = [
  'text', 'textarea', 'email', 'tel', 'number', 'currency', 'percentage', 'date',
  'datetime', 'time', 'select', 'multiselect', 'radio', 'checkbox', 'toggle', 'range',
];

const LABELS: Record<FieldType, string[]> = {
  text: ['Named party', 'Asset description', 'Adjuster note', 'Provider name'],
  textarea: ['Incident narrative', 'Coverage rationale', 'Review commentary', 'Mitigation summary'],
  email: ['Primary email', 'Representative email', 'Provider email'],
  tel: ['Contact telephone', 'Emergency contact', 'Office telephone'],
  number: ['Units affected', 'Days unavailable', 'Claimant age', 'Document count'],
  currency: ['Indemnity reserve', 'Expense reserve', 'Replacement estimate', 'Recovery amount'],
  percentage: ['Liability allocation', 'Depreciation', 'Confidence score', 'Recovery probability'],
  date: ['Reported date', 'Review date', 'Treatment start', 'Target completion'],
  datetime: ['Inspection appointment', 'Escalation deadline', 'Last contact'],
  time: ['Preferred contact time', 'Incident time', 'Review window'],
  select: ['Loss category', 'Jurisdiction region', 'Coverage status', 'Severity band'],
  multiselect: ['Supporting evidence', 'Coverage features', 'Risk indicators'],
  radio: ['Liability position', 'Escalation decision', 'Contact preference'],
  checkbox: ['Documentation complete', 'Police notified', 'Consent confirmed'],
  toggle: ['Supervisor review required', 'Potential recovery', 'Fraud referral'],
  range: ['Damage severity', 'Confidence rating', 'Complexity index'],
};

const OPTIONS: Record<string, OptionDefinition[]> = {
  status: [
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'pending', label: 'Pending review' },
    { value: 'declined', label: 'Declined' },
    { value: 'referred', label: 'Referred' },
  ],
  region: [
    { value: 'north', label: 'Northern region', region: 'N' },
    { value: 'south', label: 'Southern region', region: 'S' },
    { value: 'east', label: 'Eastern region', region: 'E' },
    { value: 'west', label: 'Western region', region: 'W' },
  ],
  severity: [
    { value: 'minor', label: 'Minor' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'major', label: 'Major' },
    { value: 'catastrophic', label: 'Catastrophic' },
  ],
  evidence: [
    { value: 'photos', label: 'Scene photographs' },
    { value: 'invoice', label: 'Invoice or estimate' },
    { value: 'statement', label: 'Witness statement' },
    { value: 'report', label: 'Official report' },
    { value: 'medical', label: 'Clinical report' },
  ],
};

function hash(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function valueFor(type: FieldType, index: number, random: () => number, optionKey?: string): FieldValue {
  switch (type) {
    case 'text': return `Assessment ${String(index + 1).padStart(4, '0')}`;
    case 'textarea': return `Evidence reviewed for line item ${index + 1}; facts reconciled against policy and claim chronology.`;
    case 'email': return `contact.${index + 1}@northstar.example`;
    case 'tel': return `+1 415 555 ${String(1000 + (index % 8999)).padStart(4, '0')}`;
    case 'number': return 1 + (index % 48);
    case 'currency': return Math.round((250 + random() * 49_750) * 100) / 100;
    case 'percentage': return Math.round(random() * 1000) / 10;
    case 'date': return `2026-${String(1 + (index % 9)).padStart(2, '0')}-${String(1 + (index % 27)).padStart(2, '0')}`;
    case 'datetime': return `2026-${String(1 + (index % 9)).padStart(2, '0')}-${String(1 + (index % 27)).padStart(2, '0')}T${String(8 + (index % 9)).padStart(2, '0')}:30`;
    case 'time': return `${String(8 + (index % 10)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`;
    case 'select': {
      const options = OPTIONS[optionKey ?? 'status'] ?? OPTIONS.status;
      return options?.[index % options.length]?.value ?? 'confirmed';
    }
    case 'multiselect': return index % 2 ? ['photos', 'invoice'] : ['statement', 'report'];
    case 'radio': return ['confirmed', 'pending', 'referred'][index % 3] ?? 'confirmed';
    case 'checkbox': return index % 3 !== 0;
    case 'toggle': return index % 4 === 0;
    case 'range': return 20 + (index % 80);
  }
}

function optionsKey(type: FieldType, index: number): string | undefined {
  if (type === 'multiselect') return 'evidence';
  if (type === 'radio') return 'status';
  if (type === 'select') return ['status', 'region', 'severity'][index % 3];
  return undefined;
}

function generate(preset: Preset, count: number): {
  manifest: ManifestResponse;
  schema: FormSchemaResponse;
  record: CaseRecordResponse;
  reference: ReferenceDataResponse;
} {
  const random = hash(2026 + count);
  const sections: SectionDefinition[] = SECTION_BLUEPRINTS.map(([id, title, description], order) => ({ id, title, description, order }));
  const fields: FieldDefinition[] = [];
  const values: Record<string, FieldValue> = {};
  const mostRecentDate = new Map<string, string>();

  for (let index = 0; index < count; index += 1) {
    const section = sections[Math.floor(index / TYPES.length) % sections.length] as SectionDefinition;
    const type = TYPES[index % TYPES.length] as FieldType;
    const id = `${section.id}.field.${String(index + 1).padStart(4, '0')}`;
    const labels = LABELS[type];
    const field: FieldDefinition = {
      id,
      sectionId: section.id,
      label: `${labels[index % labels.length]} ${Math.floor(index / TYPES.length) + 1}`,
      type,
      order: index,
      groupLabel: `${section.title} record ${Math.floor(index / (TYPES.length * sections.length)) + 1}`,
      repeatIndex: Math.floor(index / (TYPES.length * sections.length)),
      optionsKey: optionsKey(type, index),
      required: index % 5 === 0,
      placeholder: type === 'text' || type === 'textarea' ? 'Enter assessment details' : undefined,
      help: index % 13 === 0 ? 'Validated against the consolidated case and policy record.' : undefined,
    };
    if (['number', 'currency', 'percentage', 'range'].includes(type)) {
      field.min = 0;
      field.max = type === 'currency' ? 1_000_000 : 100;
      field.step = type === 'currency' ? 0.01 : 1;
    }
    if (type === 'tel') field.pattern = '^\\+?[0-9 ()-]{10,20}$';
    if (type === 'date') {
      const earlier = mostRecentDate.get(section.id);
      if (earlier && index % 3 === 0) field.afterFieldId = earlier;
      mostRecentDate.set(section.id, id);
    }
    if (index > 0 && index % 29 === 0) {
      const dependency = fields[index - 1];
      if (dependency) field.visibleWhen = {
        fieldId: dependency.id,
        operator: 'equals',
        value: index % 58 === 0 ? (values[dependency.id] ?? null) : '__intentionally-hidden__',
      };
    }
    fields.push(field);
    values[id] = valueFor(type, index, random, field.optionsKey);
  }

  return {
    manifest: {
      version: 1,
      preset,
      expectedFieldCount: count,
      schemaUrl: 'schema.json',
      recordUrl: 'record.json',
      referenceUrl: 'reference.json',
    },
    schema: { id: `northstar-claim-${preset}`, version: 7, sections, fields },
    record: {
      caseId: `CLM-26-${String(count).padStart(5, '0')}`,
      claimantName: 'Morgan Ellison',
      policyNumber: `PL-${preset.toUpperCase()}-88420`,
      jurisdiction: 'California · Western Region',
      values,
    },
    reference: {
      options: OPTIONS,
      riskWeights: { financial: 1.7, incident: 1.3, medical: 1.5, risk: 2.1 },
      workflowStates: ['Intake', 'Investigation', 'Evaluation', 'Authority review', 'Settlement'],
      regionDependencies: { north: ['confirmed', 'pending'], south: ['confirmed', 'referred'], east: ['pending'], west: ['confirmed', 'declined'] },
    },
  };
}

async function main(): Promise<void> {
  for (const [preset, count] of Object.entries(PRESETS) as [Preset, number][]) {
    const target = resolve(ROOT, preset);
    await mkdir(target, { recursive: true });
    const fixture = generate(preset, count);
    await Promise.all(Object.entries(fixture).map(([name, value]) =>
      writeFile(resolve(target, `${name}.json`), `${JSON.stringify(value)}\n`, 'utf8'),
    ));
  }
}

await main();
