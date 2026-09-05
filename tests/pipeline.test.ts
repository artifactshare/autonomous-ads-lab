import { describe, expect, it, vi } from 'vitest'
import { produceCreative } from '../src/creative/pipeline.ts'
import { CreativeRepo } from '../src/creative/repo.ts'
import { openDb } from '../src/db/index.ts'
import { H3MaxTurboGenerator } from '../src/generation/fal/h3max.ts'
import { Logger } from '../src/logging/logger.ts'

describe('creative pipeline preflight', () => {
  it('fails before creative creation or budget authorization', async () => {
    const db = openDb(':memory:')
    const experimentId = new CreativeRepo(db).createExperiment({
      domain: 'test', objective: 'test', hypothesis: 'test', budgetAllocatedUsd: 1,
    })
    const preflight = vi.fn(() => { throw new Error('ffmpeg missing') })

    await expect(
      produceCreative(
        db,
        new Logger({ runId: 'run' }, undefined, () => {}),
        { experimentId, role: 'challenger', concept: 'c', hook: 'h', message: 'm', cta: 'c', prompt: 'p' },
        { aspectRatio: '16:9', durationSec: 8, resolution: '768P' },
        { hook: 'h', brand: 'artifactshare.com', cta: 'c' },
        new H3MaxTurboGenerator('test-key'),
        preflight,
      ),
    ).rejects.toThrow('ffmpeg missing')

    expect(preflight).toHaveBeenCalledOnce()
    expect((db.prepare('select count(*) n from creatives').get() as { n: number }).n).toBe(0)
    expect((db.prepare('select count(*) n from budget_ledger').get() as { n: number }).n).toBe(0)
    db.close()
  })
})
