import { describe, expect, it } from 'vitest'
import { openDb } from '../src/db/index.ts'
import { adsCapReached, enforceMonthlyAdsCap } from '../src/ops/budget-guard.ts'

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
    expect(adsCapReached(29.7)).toBe(true) // 29.7 + 1.5 > 30
    expect(adsCapReached(28.5)).toBe(false) // exactly one day of room left
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
    const notes = await enforceMonthlyAdsCap(db, 0, setStatus)
    expect(seen).toEqual([{ li: 'li1', status: 'ACTIVE' }])
    expect(notes[0]).toContain('resumed line item(s) li1')
    const rows = db.prepare('select creative_id, status from deployments order by creative_id').all()
    expect(rows).toEqual([
      { creative_id: 1, status: 'active' },
      { creative_id: 2, status: 'stopped' },
    ])
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
