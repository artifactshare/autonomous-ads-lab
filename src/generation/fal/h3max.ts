import type { GenerationResult, VideoGenerator, VideoSpec } from '../types.ts'

export type H3Variant = 'max' | 'max-turbo'

const PRICE_CHECKED_AT = '2026-09-03'
const PROMOTION_END = '2026-09-08T00:00:00.000Z'
const MODEL = {
  max: {
    endpoint: 'minimax/h3-max/text-to-video',
    app: 'minimax/h3-max',
    price: { promo: { '480P': 0.0125, '768P': 0.02 }, list: { '480P': 0.05, '768P': 0.08 } },
  },
  'max-turbo': {
    endpoint: 'minimax/h3-max-turbo/text-to-video',
    app: 'minimax/h3-max-turbo',
    price: { promo: { '480P': 0.00625, '768P': 0.01 }, list: { '480P': 0.025, '768P': 0.04 } },
  },
} as const

interface QueueStatus {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'
  response_url: string
}

export class H3Generator implements VideoGenerator {
  readonly model: string
  readonly variant: H3Variant
  private apiKey: string
  private pollIntervalMs: number
  private now: () => Date

  constructor(
    variant: H3Variant,
    apiKey = process.env.FAL_KEY ?? '',
    pollIntervalMs = 3000,
    now: () => Date = () => new Date(),
  ) {
    if (!apiKey) throw new Error('FAL_KEY is not set')
    this.variant = variant
    this.model = MODEL[variant].endpoint
    this.apiKey = apiKey
    this.pollIntervalMs = pollIntervalMs
    this.now = now
  }

  estimateCostUsd(spec: VideoSpec): number {
    return this.pricing(spec).perSecondUsd * spec.durationSec
  }

  pricing(spec: VideoSpec): NonNullable<GenerationResult['pricing']> {
    const resolution = spec.resolution === '480P' ? '480P' : '768P'
    const promo = this.now().getTime() < new Date(PROMOTION_END).getTime()
    return {
      sourceUrl: `https://fal.ai/models/${this.model}/api`,
      checkedAt: PRICE_CHECKED_AT,
      perSecondUsd: MODEL[this.variant].price[promo ? 'promo' : 'list'][resolution],
      promotionEndsAt: PROMOTION_END,
    }
  }

  private buildSettings(spec: VideoSpec) {
    return {
      prompt: spec.prompt,
      aspect_ratio: spec.aspectRatio,
      duration: spec.durationSec,
      resolution: spec.resolution ?? '768P',
      enable_safety_checker: true,
      prompt_expansion_mode: 'balanced',
      ...(spec.seed !== undefined ? { seed: spec.seed } : {}),
    }
  }

  /** Submit only. Persist the returned request id BEFORE polling so a crash
   *  or polling failure can be recovered without re-submitting (= re-paying). */
  async submit(spec: VideoSpec): Promise<string> {
    const submit = await this.request(`https://queue.fal.run/${this.model}`, {
      method: 'POST',
      body: JSON.stringify(this.buildSettings(spec)),
    })
    const requestId = (submit as { request_id: string }).request_id
    if (!requestId) throw new Error(`fal submit failed: ${JSON.stringify(submit)}`)
    return requestId
  }

  async generate(spec: VideoSpec): Promise<GenerationResult> {
    const started = Date.now()
    const requestId = await this.submit(spec)
    return this.awaitResult(requestId, spec, started)
  }

  async awaitResult(
    requestId: string,
    spec: VideoSpec,
    started: number = Date.now(),
  ): Promise<GenerationResult> {
    const settings = this.buildSettings(spec)
    const statusUrl = `https://queue.fal.run/${MODEL[this.variant].app}/requests/${requestId}/status`
    let responseUrl: string | undefined
    // 10 min timeout: generation is normally seconds, so this indicates a stuck job.
    const deadline = started + 10 * 60 * 1000
    while (Date.now() < deadline) {
      const status = (await this.request(statusUrl)) as QueueStatus
      if (status.status === 'COMPLETED') {
        responseUrl = status.response_url
        break
      }
      await new Promise((r) => setTimeout(r, this.pollIntervalMs))
    }
    if (!responseUrl) throw new Error(`fal generation timed out: request_id=${requestId}`)

    const result = (await this.request(responseUrl)) as {
      video?: { url?: string }
      seed?: number
    }
    const assetUrl = result.video?.url
    if (!assetUrl) throw new Error(`fal result has no video url: ${JSON.stringify(result)}`)

    return {
      assetUrl,
      model: this.model,
      seed: result.seed ?? spec.seed ?? null,
      settings,
      costUsd: this.estimateCostUsd(spec),
      latencyMs: Date.now() - started,
      pricing: this.pricing(spec),
      raw: result,
    }
  }

  private async request(url: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Key ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
    if (!res.ok) throw new Error(`fal ${init?.method ?? 'GET'} ${url} -> ${res.status}: ${await res.text()}`)
    return res.json()
  }
}

/** Existing default and explicit rollback target. */
export class H3MaxGenerator extends H3Generator {
  constructor(apiKey = process.env.FAL_KEY ?? '', pollIntervalMs = 3000, now?: () => Date) {
    super('max', apiKey, pollIntervalMs, now)
  }
}

export class H3MaxTurboGenerator extends H3Generator {
  constructor(apiKey = process.env.FAL_KEY ?? '', pollIntervalMs = 3000, now?: () => Date) {
    super('max-turbo', apiKey, pollIntervalMs, now)
  }
}
