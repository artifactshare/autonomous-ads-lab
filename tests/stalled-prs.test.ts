import { describe, expect, it } from 'vitest'
import { Logger } from '../src/logging/logger.ts'
import {
  checkStalledPrs,
  describeStalled,
  recoverStalledPrs,
  retryWorkflowFor,
  selectRecoverable,
  selectStalled,
} from '../src/ops/stalled-prs.ts'
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

describe('DIRTY PR recovery', () => {
  it('maps only rerunnable local ops branches to workflows', () => {
    expect(retryWorkflowFor(pr({ headRefName: 'auto/Daily-Ops-20260831-000000' }))).toBe('daily.yml')
    expect(retryWorkflowFor(pr({ headRefName: 'auto/Weekly-Learning-20260831-000000' }))).toBe('weekly.yml')
    expect(retryWorkflowFor(pr({ headRefName: 'auto/metrics-20260831-000000' }))).toBeNull()
    expect(retryWorkflowFor(pr({ headRefName: 'fix/human-change' }))).toBeNull()
  })

  it('recovers only old DIRTY PRs with a known idempotent workflow', () => {
    const prs = [
      pr({ number: 1, headRefName: 'auto/Daily-Ops-old', mergeStateStatus: 'DIRTY' }),
      pr({ number: 2, headRefName: 'auto/Weekly-Learning-old', mergeStateStatus: 'DIRTY' }),
      pr({ number: 3, headRefName: 'auto/Daily-Ops-blocked', mergeStateStatus: 'BLOCKED' }),
      pr({ number: 4, headRefName: 'auto/metrics-old', mergeStateStatus: 'DIRTY' }),
      pr({ number: 5, headRefName: 'fix/human-change', mergeStateStatus: 'DIRTY' }),
    ]
    expect(selectRecoverable(prs, NOW).map((p) => p.number)).toEqual([1, 2])
  })

  it('records each successful recovery in the journal output', async () => {
    const recovered: number[] = []
    const lines = await recoverStalledPrs(
      new Logger({ runId: 'r' }, undefined, () => {}),
      NOW,
      () => [pr({ number: 82, headRefName: 'auto/Daily-Ops-old' })],
      (candidate) => { recovered.push(candidate.number) },
    )
    expect(recovered).toEqual([82])
    expect(lines).toEqual(['watchdog: closed DIRTY PR #82 and dispatched daily.yml'])
  })

  it('keeps recovery failures observable without failing daily ops', async () => {
    const logged: string[] = []
    const log = new Logger({ runId: 'r' }, undefined, (line) => logged.push(line))
    await expect(
      recoverStalledPrs(log, NOW, () => [pr({ headRefName: 'auto/Daily-Ops-old' })], () => {
        throw new Error('dispatch denied')
      }),
    ).resolves.toEqual([])
    expect(logged.some((line) => line.includes('stalled_pr_recovery_failed'))).toBe(true)
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
