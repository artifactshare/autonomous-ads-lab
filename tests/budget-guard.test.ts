import { describe, expect, it } from 'vitest'
import { openDb } from '../src/db/index.ts'
import { adsCapReached, enforceMonthlyAdsCap, syncDailyBudget } from '../src/ops/budget-guard.ts'

function setup() {
  const db = openDb(':memory:')
  db.prepare(
    "insert into experiments (id, status, domain, objective, hypothesis) values (1, 'running', 'artifact_share', 'o', 'h')",
  ).run()
  const c = db.prepare(
    "insert into creatives (id, experiment_id, concept, hook, message, cta, prompt) values (?, 1, 'c', 'h', 'm', 'cta', 'p')",
  )
  c.run(1)
  c.run(2)
  return db
}

function calls() {
  const seen: Array<{ li: string; status: string }> = []
  const setStatus = async (li: string, status: 'ACTIVE' | 'PAUSED') => {
    seen.push({ li, status })
  }
  return { seen, setStatus }
}

describe('adsCapReached', () => {
  it('fires when another capped day no longer fits the monthly budget', () => {
    expect(adsCapReached(30)).toBe(true)
    expect(adsCapReached(29.5)).toBe(true) // 29.5 + 1 > 30
    expect(adsCapReached(29)).toBe(false) // exactly one day of room left
    expect(adsCapReached(0)).toBe(false)
  })
})

describe('enforceMonthlyAdsCap', () => {
  it('pauses every active line item once and marks deployments paused', async () => {
    const db = setup()
    db.prepare(
      "insert into deployments (creative_id, status, ad_group_id, campaign_id) values (1, 'active', 'li1', 'camp1'), (2, 'active', 'li1', 'camp1')",
    ).run()
    const { seen, setStatus } = calls()
    const notes = await enforceMonthlyAdsCap(db, 29.7, setStatus)
    expect(seen).toEqual([{ li: 'li1', status: 'PAUSED' }]) // distinct line items, one call
    expect(notes[0]).toContain('paused line item(s) li1')
    const statuses = db.prepare('select status from deployments').all() as Array<{ status: string }>
    expect(statuses.every((r) => r.status === 'paused')).toBe(true)
  })

  it('resumes only guard-paused rows when the month has room again', async () => {
    const db = setup()
    db.prepare(
      "insert into deployments (creative_id, status, ad_group_id, campaign_id) values (1, 'paused', 'li1', 'camp1'), (2, 'stopped', 'li0', 'camp0')",
    ).run()
    const { seen, setStatus } = calls()
    const notes = await enforceMonthlyAdsCap(db, 0, setStatus, true)
    expect(seen).toEqual([{ li: 'li1', status: 'ACTIVE' }])
    expect(notes[0]).toContain('resumed line item(s) li1')
    const rows = db.prepare('select creative_id, status from deployments order by creative_id').all()
    expect(rows).toEqual([
      { creative_id: 1, status: 'active' },
      { creative_id: 2, status: 'stopped' },
    ])
  })

  it('never resumes while the owner has paid media disabled', async () => {
    const db = setup()
    db.prepare("insert into deployments (creative_id, status, ad_group_id, campaign_id) values (1, 'paused', 'li1', 'camp1')").run()
    const { seen, setStatus } = calls()
    expect(await enforceMonthlyAdsCap(db, 0, setStatus, false)).toEqual([])
    expect(seen).toEqual([])
    expect(db.prepare('select status from deployments').get()).toEqual({ status: 'paused' })
  })

  it('does nothing when under the cap with nothing guard-paused', async () => {
    const db = setup()
    db.prepare("insert into deployments (creative_id, status, ad_group_id, campaign_id) values (1, 'active', 'li1', 'camp1')").run()
    const { seen, setStatus } = calls()
    expect(await enforceMonthlyAdsCap(db, 10, setStatus)).toEqual([])
    expect(seen).toEqual([])
  })

  it('does nothing over the cap when nothing is active', async () => {
    const db = setup()
    db.prepare("insert into deployments (creative_id, status, ad_group_id, campaign_id) values (1, 'stopped', 'li1', 'camp1')").run()
    const { seen, setStatus } = calls()
    expect(await enforceMonthlyAdsCap(db, 31, setStatus)).toEqual([])
    expect(seen).toEqual([])
  })
})

describe('syncDailyBudget', () => {
  it('pushes the config cap onto live and guard-paused line items that differ', async () => {
    const db = setup()
    db.prepare(
      `insert into deployments (creative_id, status, ad_group_id, campaign_id, budget_usd) values
       (1, 'paused', 'li1', 'camp1', 1.5), (2, 'stopped', 'li0', 'camp0', 1.5)`,
    ).run()
    const seen: Array<{ li: string; usd: number }> = []
    const notes = await syncDailyBudget(db, async (li, usd) => { seen.push({ li, usd }) })
    expect(seen).toEqual([{ li: 'li1', usd: 1 }]) // human-stopped rows are left alone
    expect(notes[0]).toContain('li1 to $1')
    const rows = db.prepare('select ad_group_id as li, budget_usd from deployments order by id').all()
    expect(rows).toEqual([{ li: 'li1', budget_usd: 1 }, { li: 'li0', budget_usd: 1.5 }])
    // Idempotent: the next daily run finds nothing to change.
    expect(await syncDailyBudget(db, async () => { throw new Error('should not call') })).toEqual([])
  })
})
