import { describe, expect, it } from 'vitest'
import { classifyMetrics, describeVerdict } from '../src/ops/metrics-watchdog.ts'

describe('classifyMetrics', () => {
  it('is fresh whenever rows arrived, whatever the delivery state', () => {
    expect(classifyMetrics({ rows: 12, activeDeployments: 1, paidMediaEnabled: true })).toEqual({ kind: 'fresh' })
    // Rows for a day that has since been paused still count as delivered data.
    expect(classifyMetrics({ rows: 1, activeDeployments: 0, paidMediaEnabled: false })).toEqual({ kind: 'fresh' })
  })

  it('alerts only when delivery was expected and produced nothing', () => {
    expect(classifyMetrics({ rows: 0, activeDeployments: 1, paidMediaEnabled: true })).toEqual({ kind: 'stale' })
  })

  it('stays quiet while the owner kill switch is off (#187)', () => {
    // A stale `active` deployment row must not resurrect the daily false alarm:
    // nothing can serve while paidMediaEnabled is false.
    const verdict = classifyMetrics({ rows: 0, activeDeployments: 3, paidMediaEnabled: false })
    expect(verdict.kind).toBe('idle')
  })

  it('stays quiet when nothing is deployed even with paid media enabled', () => {
    const verdict = classifyMetrics({ rows: 0, activeDeployments: 0, paidMediaEnabled: true })
    expect(verdict).toEqual({ kind: 'idle', reason: 'no active deployment' })
  })

  it('defaults paidMediaEnabled to config, which is currently off', () => {
    // Guards the wiring: if config flips to true this test is the reminder that
    // the live behaviour changed on purpose.
    expect(classifyMetrics({ rows: 0, activeDeployments: 2 }).kind).toBe('idle')
  })
})

describe('describeVerdict', () => {
  it('writes no journal line when metrics arrived', () => {
    expect(describeVerdict({ kind: 'fresh' }, '2026-09-27')).toBeNull()
  })

  it('marks an idle day as expected rather than as a failure', () => {
    const line = describeVerdict({ kind: 'idle', reason: 'no active deployment' }, '2026-09-27')
    expect(line).toBe('watchdog: no metrics for 2026-09-27 — expected, no active deployment')
    expect(line).not.toContain('failed')
  })

  it('keeps the alerting wording for a real gap', () => {
    expect(describeVerdict({ kind: 'stale' }, '2026-09-27')).toContain('Ads API sync failed')
  })
})
