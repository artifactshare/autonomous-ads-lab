import type { GenerationResult, VideoGenerator, VideoSpec } from '../types.ts'

const ENDPOINT = 'minimax/h3-max/text-to-video'
const QUEUE_BASE = `https://queue.fal.run/${ENDPOINT}`
// Request status/result URLs use the app alias (owner/app) WITHOUT the endpoint subpath.
const REQUESTS_BASE = 'https://queue.fal.run/minimax/h3-max/requests'

// $/second by resolution (list price; promo discounts not assumed).
const PRICE_PER_SEC: Record<string, number> = { '480P': 0.05, '768P': 0.08 }

interface QueueStatus {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'
  response_url: string
}

export class H3MaxGenerator implements VideoGenerator {
  readonly model = ENDPOINT
  private apiKey: string
  private pollIntervalMs: number

  constructor(apiKey = process.env.FAL_KEY ?? '', pollIntervalMs = 3000) {
    if (!apiKey) throw new Error('FAL_KEY is not set')
    this.apiKey = apiKey
    this.pollIntervalMs = pollIntervalMs
  }

  estimateCostUsd(spec: VideoSpec): number {
    const perSec = PRICE_PER_SEC[spec.resolution ?? '768P'] ?? PRICE_PER_SEC['768P']!
    return perSec * spec.durationSec
  }

  private buildSettings(spec: VideoSpec) {
    return {
      prompt: spec.prompt,
      aspect_ratio: spec.aspectRatio,
      duration: spec.durationSec,
      resolution: spec.resolution ?? '768P',
      ...(spec.seed !== undefined ? { seed: spec.seed } : {}),
    }
  }

  /** Submit only. Persist the returned request id BEFORE polling so a crash
   *  or polling failure can be recovered without re-submitting (= re-paying). */
  async submit(spec: VideoSpec): Promise<string> {
    const submit = await this.request(QUEUE_BASE, {
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
    const statusUrl = `${REQUESTS_BASE}/${requestId}/status`
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
