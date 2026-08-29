export interface VideoSpec {
  prompt: string
  aspectRatio: '16:9' | '1:1' | '9:16'
  durationSec: number
  resolution?: '480P' | '768P' | '1080P'
  seed?: number
}

export interface GenerationResult {
  assetUrl: string
  model: string
  seed: number | null
  settings: Record<string, unknown>
  costUsd: number
  latencyMs: number
  raw: unknown
}

export interface VideoGenerator {
  readonly model: string
  /** Estimated cost for budget authorization BEFORE generating. */
  estimateCostUsd(spec: VideoSpec): number
  generate(spec: VideoSpec): Promise<GenerationResult>
}
