import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreativeRepo } from '../src/creative/repo.ts'
import { openDb } from '../src/db/index.ts'
import { H3MaxGenerator, H3MaxTurboGenerator } from '../src/generation/fal/h3max.ts'

const spec = { prompt: 'test', aspectRatio: '16:9', durationSec: 8, resolution: '768P', seed: 42 } as const

afterEach(() => vi.unstubAllGlobals())

describe('H3 Max model selection and pricing', () => {
  it('uses the verified promotional prices through September 7', () => {
    const now = () => new Date('2026-09-03T00:00:00Z')
    expect(new H3MaxGenerator('key', 1, now).estimateCostUsd(spec)).toBeCloseTo(0.16)
    expect(new H3MaxTurboGenerator('key', 1, now).estimateCostUsd(spec)).toBeCloseTo(0.08)
  })

  it('falls back to list prices after the promotion instead of under-authorizing', () => {
    const now = () => new Date('2026-09-08T00:00:00Z')
    expect(new H3MaxGenerator('key', 1, now).estimateCostUsd(spec)).toBeCloseTo(0.64)
    expect(new H3MaxTurboGenerator('key', 1, now).estimateCostUsd(spec)).toBeCloseTo(0.32)
  })

  it('submits identical comparison controls to the selected endpoint', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      new Response(JSON.stringify({ request_id: 'req-1' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const gen = new H3MaxTurboGenerator('key')
    await gen.submit(spec)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://queue.fal.run/minimax/h3-max-turbo/text-to-video')
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: 'test',
      aspect_ratio: '16:9',
      duration: 8,
      resolution: '768P',
      enable_safety_checker: true,
      prompt_expansion_mode: 'balanced',
      seed: 42,
    })
  })

  it('persists the price source and observation date with the generation', () => {
    const db = openDb(':memory:')
    const repo = new CreativeRepo(db)
    const experimentId = repo.createExperiment({ domain: 'test', objective: 'test', hypothesis: 'test', budgetAllocatedUsd: 1 })
    const creativeId = repo.createCreative({ experimentId, role: 'challenger', concept: 'c', hook: 'h', message: 'm', cta: 'c', prompt: 'p' })
    const gen = new H3MaxTurboGenerator('key', 1, () => new Date('2026-09-03T00:00:00Z'))
    repo.recordGeneration(creativeId, {
      assetUrl: 'https://example.test/video.mp4', model: gen.model, seed: 42, settings: {},
      costUsd: gen.estimateCostUsd(spec), latencyMs: 1000, pricing: gen.pricing(spec), raw: {},
    })
    const row = db.prepare('select * from creatives where id = ?').get(creativeId) as Record<string, unknown>
    expect(row.generation_price_per_second_usd).toBe(0.01)
    expect(row.generation_pricing_checked_at).toBe('2026-09-03')
    expect(row.generation_pricing_source).toContain('/h3-max-turbo/text-to-video/api')
    expect(row.deployment_eligible).toBe(1)
    db.close()
  })

  it('can mark benchmark creatives as ineligible for automatic deployment', () => {
    const db = openDb(':memory:')
    const repo = new CreativeRepo(db)
    const experimentId = repo.createExperiment({ domain: 'test', objective: 'test', hypothesis: 'test', budgetAllocatedUsd: 1 })
    const id = repo.createCreative({ experimentId, role: 'challenger', concept: 'c', hook: 'h', message: 'm', cta: 'c', prompt: 'p', deploymentEligible: false })
    expect((db.prepare('select deployment_eligible value from creatives where id = ?').get(id) as { value: number }).value).toBe(0)
    db.close()
  })
})
