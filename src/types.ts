export type Variant = 'angular' | 'web-component';
export type Preset = 'small' | 'standard' | 'stress';
export type CacheMode = 'warm' | 'no-store';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'number'
  | 'currency'
  | 'percentage'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox'
  | 'toggle'
  | 'range';

export type FieldValue = string | number | boolean | string[] | null;

export interface OptionDefinition {
  value: string;
  label: string;
  region?: string;
}

export interface VisibilityRule {
  fieldId: string;
  operator: 'equals' | 'not-equals' | 'gte';
  value: FieldValue;
}

export interface FieldDefinition {
  id: string;
  sectionId: string;
  label: string;
  type: FieldType;
  order: number;
  groupLabel?: string;
  repeatIndex?: number;
  optionsKey?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
  placeholder?: string;
  help?: string;
  afterFieldId?: string;
  visibleWhen?: VisibilityRule;
}

export interface SectionDefinition {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface FormSchemaResponse {
  id: string;
  version: number;
  sections: SectionDefinition[];
  fields: FieldDefinition[];
}

export interface CaseRecordResponse {
  caseId: string;
  claimantName: string;
  policyNumber: string;
  jurisdiction: string;
  values: Record<string, FieldValue>;
}

export interface ReferenceDataResponse {
  options: Record<string, OptionDefinition[]>;
  riskWeights: Record<string, number>;
  workflowStates: string[];
  regionDependencies: Record<string, string[]>;
}

export interface ManifestResponse {
  version: number;
  preset: Preset;
  expectedFieldCount: number;
  schemaUrl: string;
  recordUrl: string;
  referenceUrl: string;
}

export interface ChainedApiResponse {
  manifest: ManifestResponse;
  schema: FormSchemaResponse;
  record: CaseRecordResponse;
  reference: ReferenceDataResponse;
}

export interface CompiledField extends FieldDefinition {
  options: OptionDefinition[];
  visible: boolean;
  errors: string[];
}

export interface CompiledSection extends SectionDefinition {
  fields: CompiledField[];
}

export interface ModelSummaries {
  totalReserve: number;
  exposure: number;
  riskScore: number;
  completion: number;
  visibleFields: number;
  errorCount: number;
}

export interface CompiledFormModel {
  schemaId: string;
  schemaVersion: number;
  caseId: string;
  claimantName: string;
  policyNumber: string;
  jurisdiction: string;
  preset: Preset;
  seed: number;
  sections: CompiledSection[];
  fields: CompiledField[];
  fieldIndex: Record<string, CompiledField>;
  values: Record<string, FieldValue>;
  initialValues: Record<string, FieldValue>;
  summaries: ModelSummaries;
}

export interface ApiTimings {
  bootstrapMs: number;
  fanoutMs: number;
  totalMs: number;
  bytes: number;
}

export interface PhaseTimings extends ApiTimings {
  processingMs: number;
  renderBindMs: number;
  paintMs: number;
  interactionMs: number;
}

export interface PayloadBuildResult {
  json: string;
  bytes: number;
  durationMs: number;
  checksum: string;
  valid: boolean;
  errorCount: number;
}

export interface RuntimeEnvironment {
  userAgent: string;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  viewport: string;
  revision: string;
}

export interface LongTaskSummary {
  supported: boolean;
  count: number;
  totalMs: number;
  longestMs: number;
}

export interface BenchmarkConfig {
  variant: Variant;
  preset: Preset;
  seed: number;
  runCount: number;
  apiLatencyMs: number;
  cacheMode: CacheMode;
  runId: string;
}

export interface BenchmarkRunResult {
  type: 'benchmark-result';
  config: BenchmarkConfig;
  timestamp: string;
  readyToInteractMs: number;
  payloadBuildMs: number;
  payloadBytes: number;
  checksum: string;
  fieldCount: number;
  visibleFieldCount: number;
  phaseTimings: PhaseTimings;
  longTasks: LongTaskSummary;
  environment: RuntimeEnvironment;
}

export interface MetricStats {
  samples: number;
  min: number;
  median: number;
  p95: number;
  max: number;
  mad: number;
}

export interface VariantSummary {
  readyToInteract: MetricStats;
  payloadBuild: MetricStats;
}

export interface BenchmarkSession {
  id: string;
  timestamp: string;
  config: Omit<BenchmarkConfig, 'variant' | 'runId'>;
  angular: BenchmarkRunResult[];
  webComponent: BenchmarkRunResult[];
  summaries: {
    angular: VariantSummary;
    webComponent: VariantSummary;
  };
  payloadsMatch: boolean;
  verdict: string;
}

export interface CanonicalClaimPayload {
  caseId: string;
  schema: { id: string; version: number };
  values: Record<string, FieldValue>;
  summaries: ModelSummaries;
  validation: { valid: boolean; errorCount: number };
}
