import { describe, expect, it } from 'vitest'
import { openDb } from '../src/db/index.ts'
import { BudgetController } from '../src/budget/controller.ts'

function setup(now = () => new Date('2026-09-10T12:00:00Z')) {
  const db = openDb(':memory:')
  return new BudgetController(db, now)
}

const base = { description: 'test', runId: 'run-1' } as const

describe('BudgetController', () => {
  it('authorizes spend within limits', () => {
    const bc = setup()
    const res = bc.authorize({ ...base, category: 'creative', amountUsd: 0.4 })
    expect(res.ok).toBe(true)
  })

  it('rejects spend exceeding the monthly limit', () => {
    const bc = setup()
    expect(bc.authorize({ ...base, category: 'creative', amountUsd: 9.5 }).ok).toBe(true)
    const res = bc.authorize({ ...base, category: 'creative', amountUsd: 0.6 })
    expect(res).toMatchObject({ ok: false })
    if (!res.ok) expect(res.reason).toContain('monthly creative budget exceeded')
  })

  it('rejects ads spend exceeding the daily cap even within monthly budget', () => {
    const bc = setup()
    expect(bc.authorize({ ...base, category: 'ads', amountUsd: 1.0 }).ok).toBe(true)
    const res = bc.authorize({ ...base, category: 'ads', amountUsd: 1.0 })
    expect(res).toMatchObject({ ok: false })
    if (!res.ok) expect(res.reason).toContain('daily ads cap exceeded')
  })

  it('daily cap resets on a new day, monthly total still enforced', () => {
    let day = 10
    const bc = setup(() => new Date(`2026-09-${day}T12:00:00Z`))
    for (let i = 0; i < 20; i++) {
      bc.authorize({ ...base, category: 'ads', amountUsd: 1.5 })
      day++
    }
    // 20 days x $1.5 = $30 = monthly limit reached
    const res = bc.authorize({ ...base, category: 'ads', amountUsd: 0.1 })
    expect(res).toMatchObject({ ok: false })
    if (!res.ok) expect(res.reason).toContain('monthly ads budget exceeded')
  })

  it('is idempotent per idempotency key', () => {
    const bc = setup()
    const a = bc.authorize({ ...base, category: 'ads', amountUsd: 1.0, idempotencyKey: 'k1' })
    const b = bc.authorize({ ...base, category: 'ads', amountUsd: 1.0, idempotencyKey: 'k1' })
    expect(a).toMatchObject({ ok: true, duplicate: false })
    expect(b).toMatchObject({ ok: true, duplicate: true })
    expect(bc.status().today.ads.spent).toBe(1.0) // charged once
  })

  it('rejects non-positive amounts', () => {
    const bc = setup()
    expect(bc.authorize({ ...base, category: 'ai', amountUsd: 0 }).ok).toBe(false)
    expect(bc.authorize({ ...base, category: 'ai', amountUsd: -1 }).ok).toBe(false)
  })

  it('categories have independent budgets', () => {
    const bc = setup()
    expect(bc.authorize({ ...base, category: 'creative', amountUsd: 10 }).ok).toBe(true)
    expect(bc.authorize({ ...base, category: 'ai', amountUsd: 10 }).ok).toBe(true)
    expect(bc.authorize({ ...base, category: 'creative', amountUsd: 0.01 }).ok).toBe(false)
  })

  it('reconciles an estimate down to the actual cost, freeing headroom', () => {
    const bc = setup()
    const a = bc.authorize({ ...base, category: 'ai', amountUsd: 0.1 })
    expect(a.ok).toBe(true)
    if (!a.ok) return
    const rec = bc.reconcile(a.ledgerId, 0.0226)
    expect(rec).toMatchObject({ ok: true })
    if (rec.ok) expect(rec.deltaUsd).toBeCloseTo(-0.0774, 6)
    expect(bc.status().month.ai.spent).toBeCloseTo(0.0226, 6)
  })

  it('reconciles upward and makes the next authorize stricter', () => {
    const bc = setup()
    const a = bc.authorize({ ...base, category: 'creative', amountUsd: 1 })
    if (!a.ok) throw new Error('setup failed')
    bc.reconcile(a.ledgerId, 9.8)
    expect(bc.status().month.creative.spent).toBeCloseTo(9.8, 6)
    // Only $0.20 of the $10 monthly creative budget is left.
    expect(bc.authorize({ ...base, category: 'creative', amountUsd: 0.5 }).ok).toBe(false)
  })

  it('rejects invalid reconcile amounts and unknown ledger ids', () => {
    const bc = setup()
    const a = bc.authorize({ ...base, category: 'ai', amountUsd: 0.1 })
    if (!a.ok) throw new Error('setup failed')
    expect(bc.reconcile(a.ledgerId, -1).ok).toBe(false)
    expect(bc.reconcile(a.ledgerId, Number.NaN).ok).toBe(false)
    expect(bc.reconcile(99999, 0.05).ok).toBe(false)
    // A rejected reconcile leaves the original estimate untouched.
    expect(bc.status().month.ai.spent).toBeCloseTo(0.1, 6)
  })

  it('allows reconciling to zero (nothing was actually billed)', () => {
    const bc = setup()
    const a = bc.authorize({ ...base, category: 'ai', amountUsd: 0.1 })
    if (!a.ok) throw new Error('setup failed')
    expect(bc.reconcile(a.ledgerId, 0).ok).toBe(true)
    expect(bc.status().month.ai.spent).toBe(0)
  })

  it('reports status', () => {
    const bc = setup()
    bc.authorize({ ...base, category: 'ads', amountUsd: 1.2 })
    const s = bc.status()
    expect(s.month.ads).toEqual({ spent: 1.2, limit: 30 })
    expect(s.today.ads).toEqual({ spent: 1.2, limit: 1.5 })
  })
})
