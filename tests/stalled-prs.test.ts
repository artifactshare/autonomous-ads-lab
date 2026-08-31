import { describe, expect, it } from 'vitest'
import { Logger } from '../src/logging/logger.ts'
import { checkStalledPrs, describeStalled, selectStalled } from '../src/ops/stalled-prs.ts'
import type { PrSummary } from '../src/ops/stalled-prs.ts'

const NOW = new Date('2026-08-31T12:00:00Z')

function pr(over: Partial<PrSummary> = {}): PrSummary {
  return {
    number: 1,
    title: 'Daily Ops: experience db + journal update',
    createdAt: '2026-08-31T00:00:00Z', // 12h old
    headRefName: 'auto/Daily-Ops-20260831-000000',
    mergeStateStatus: 'DIRTY',
    ...over,
  }
}

const numbers = (prs: PrSummary[]) => selectStalled(prs, NOW).map((p) => p.number)

describe('selectStalled', () => {
  it('flags the states auto-merge cannot recover from', () => {
    const prs = ['DIRTY', 'BLOCKED', 'UNKNOWN', 'BEHIND'].map((s, i) =>
      pr({ number: i + 1, mergeStateStatus: s }),
    )
    expect(numbers(prs)).toEqual([1, 2, 3, 4])
  })

  it('ignores PRs that are still on track', () => {
    expect(
      numbers([pr({ number: 1, mergeStateStatus: 'CLEAN' }), pr({ number: 2, mergeStateStatus: 'HAS_HOOKS' })]),
    ).toEqual([])
  })

  it('gives a fresh PR a grace period before calling it stalled', () => {
    // A PR opened minutes ago legitimately reports UNKNOWN while checks queue.
    expect(numbers([pr({ createdAt: '2026-08-31T11:30:00Z', mergeStateStatus: 'UNKNOWN' })])).toEqual([])
    expect(numbers([pr({ createdAt: '2026-08-31T09:00:00Z', mergeStateStatus: 'UNKNOWN' })])).toEqual([1])
  })

  it('only watches branches this project automates', () => {
    const prs = [
      pr({ number: 1, headRefName: 'auto/Weekly-Learning-x' }),
      pr({ number: 2, headRefName: 'fix/journal-jst' }),
      pr({ number: 3, headRefName: 'improve/persist-run-logs' }),
      pr({ number: 4, headRefName: 'my-human-branch' }),
    ]
    expect(numbers(prs)).toEqual([1, 2, 3])
  })
})

describe('describeStalled', () => {
  it('reports the state and how long it has been stuck', () => {
    expect(describeStalled(pr(), NOW)).toBe(
      'PR #1 (DIRTY, 12h): Daily Ops: experience db + journal update',
    )
  })
})

describe('checkStalledPrs', () => {
  const silent = () => new Logger({ runId: 'r' }, undefined, () => {})

  it('returns a journal line naming every stalled PR', async () => {
    const lines = await checkStalledPrs(silent(), NOW, () => [
      pr({ number: 35, mergeStateStatus: 'DIRTY' }),
      pr({ number: 41, mergeStateStatus: 'BLOCKED' }),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('stalled on 2 PR(s)')
    expect(lines[0]).toContain('PR #35 (DIRTY, 12h)')
    expect(lines[0]).toContain('PR #41 (BLOCKED, 12h)')
  })

  it('stays quiet when nothing is stalled', async () => {
    expect(await checkStalledPrs(silent(), NOW, () => [pr({ mergeStateStatus: 'CLEAN' })])).toEqual([])
  })

  it('never throws when the gh call fails', async () => {
    const logged: string[] = []
    const log = new Logger({ runId: 'r' }, undefined, (l) => logged.push(l))
    await expect(
      checkStalledPrs(log, NOW, () => {
        throw new Error('gh: not authenticated')
      }),
    ).resolves.toEqual([])
    expect(logged.some((l) => l.includes('stalled_pr_check_failed'))).toBe(true)
  })
})
