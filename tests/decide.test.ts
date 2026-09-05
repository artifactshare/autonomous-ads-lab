import { describe, expect, it } from 'vitest'
import { CreativeRepo } from '../src/creative/repo.ts'
import { openDb } from '../src/db/index.ts'
import { findResumableCreatives, formatGa4Outcomes } from '../src/ops/decide.ts'

describe('formatGa4Outcomes', () => {
  it('reports an unmeasured landing rate when no conversions rows are synced', () => {
    const s = formatGa4Outcomes({ syncedDays: 0, sessions: 0, signUps: 0 }, 49, 5.83)
    expect(s).toContain('not synced yet')
    expect(s).not.toContain('of clicks landed')
  })

  it('reports a measured 0% when synced rows exist with zero sessions', () => {
    const s = formatGa4Outcomes({ syncedDays: 2, sessions: 0, signUps: 0 }, 49, 5.83)
    expect(s).toContain('GA4 0 sessions (0% of clicks landed)')
  })

  it('reports landing rate and cost per session when sessions exist', () => {
    const s = formatGa4Outcomes({ syncedDays: 4, sessions: 20, signUps: 1 }, 49, 5.83)
    expect(s).toContain('41% of clicks landed')
    expect(s).toContain('$0.29/session')
    expect(s).toContain('1 sign_ups')
  })
})

describe('findResumableCreatives', () => {
  it('returns generated eligible challengers that have not been evaluated', () => {
    const db = openDb(':memory:')
    const repo = new CreativeRepo(db)
    const experimentId = repo.createExperiment({
      domain: 'test', objective: 'test', hypothesis: 'test', budgetAllocatedUsd: 1,
    })
    const make = (deploymentEligible = true) => repo.createCreative({
      experimentId,
      role: 'challenger',
      concept: 'concept',
      hook: 'hook',
      message: 'message',
      cta: 'cta',
      prompt: 'prompt',
      deploymentEligible,
    })
    const deployed = make()
    const resumable = make()
    const evaluated = make()
    const unfinished = make()
    const ineligible = make(false)
    for (const id of [resumable, evaluated, ineligible]) {
      db.prepare('update creatives set asset_url = ? where id = ?').run(`https://example.test/${id}.mp4`, id)
    }
    db.prepare('insert into evaluations (creative_id) values (?)').run(evaluated)

    expect(findResumableCreatives(db, deployed)).toEqual([{ id: resumable, hook: 'hook', cta: 'cta' }])
    expect(findResumableCreatives(db, unfinished)).toEqual([])
    db.close()
  })
})
