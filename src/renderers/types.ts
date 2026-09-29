import type { CompiledFormModel, PayloadBuildResult } from '../types';

export interface RendererHandle {
  model: CompiledFormModel;
  probeInteraction(): Promise<void>;
  buildPayload(): Promise<PayloadBuildResult>;
  reset(): void;
  destroy(): void;
}

export type RendererMount = (
  host: HTMLElement,
  model: CompiledFormModel,
  onChange?: () => void,
) => Promise<RendererHandle>;
