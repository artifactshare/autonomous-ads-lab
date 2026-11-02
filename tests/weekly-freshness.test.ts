import { describe, expect, it, vi } from 'vitest'
import { Logger } from '../src/logging/logger.ts'
import {
  WEEKLY_STALE_DAYS,
  assessStaleness,
  checkWeeklyFreshness,
  lastSuccessfulRunAt,
  type RunSummary,
} from '../src/ops/weekly-freshness.ts'

function captureLog(): { log: Logger; lines: Array<Record<string, unknown>> } {
  const lines: Array<Record<string, unknown>> = []
  const log = new Logger({ runId: 'test' }, undefined, (line) => lines.push(JSON.parse(line)))
  return { log, lines }
}

const ok = (createdAt: string): RunSummary => ({
  createdAt,
  status: 'completed',
  conclusion: 'success',
})

describe('lastSuccessfulRunAt', () => {
  it('picks the newest successful run regardless of list order', () => {
    expect(
      lastSuccessfulRunAt([ok('2026-10-19T01:10:01Z'), ok('2026-11-02T02:25:54Z'), ok('2026-10-26T01:06:50Z')]),
    ).toBe('2026-11-02T02:25:54Z')
  })

  it('ignores a failed run, so a weekly that crashes every week still alerts', () => {
    const runs: RunSummary[] = [
      { createdAt: '2026-11-02T02:25:54Z', status: 'completed', conclusion: 'failure' },
      ok('2026-10-05T01:55:31Z'),
    ]
    expect(lastSuccessfulRunAt(runs)).toBe('2026-10-05T01:55:31Z')
  })

  it('ignores an in-progress run', () => {
    // On Mondays daily runs ~70min before weekly; counting a queued weekly
    // would make this check permanently green from the wrong side.
    const runs: RunSummary[] = [
      { createdAt: '2026-11-02T02:25:54Z', status: 'in_progress', conclusion: null },
      ok('2026-10-26T01:06:50Z'),
    ]
    expect(lastSuccessfulRunAt(runs)).toBe('2026-10-26T01:06:50Z')
  })

  it('is undefined when nothing succeeded', () => {
    expect(lastSuccessfulRunAt([])).toBeUndefined()
    expect(
      lastSuccessfulRunAt([{ createdAt: '2026-11-02T00:00:00Z', status: 'completed', conclusion: 'cancelled' }]),
    ).toBeUndefined()
  })
})

describe('assessStaleness', () => {
  // The exact 2026-10-27 false positive: weekly.yml succeeded on 10/26, but
  // its PR (#241) had not merged yet, so main's newest row was from 10/19.
  const regression = {
    lastObservation: '2026-10-19T01:11:16.316Z',
    lastRunAt: '2026-10-26T01:06:50Z',
    now: new Date('2026-10-27T01:25:51Z'),
  }

  it('is fresh when the cron fired, even though the DB looks 8 days stale', () => {
    expect(assessStaleness(regression)).toEqual({
      stale: false,
      since: '2026-10-26T01:06:50Z',
      basis: 'workflow_run',
    })
  })

  it('would have reported stale on the same inputs without the run list', () => {
    // Pins the bug this fix removes: the DB alone says stale on 10/27.
    const { lastRunAt: _drop, ...dbOnly } = regression
    expect(assessStaleness(dbOnly)).toMatchObject({ stale: true, basis: 'db_observation' })
  })

  it('still reports a cron that genuinely stopped', () => {
    expect(
      assessStaleness({
        lastObservation: '2026-10-05T01:55:31Z',
        lastRunAt: '2026-10-05T01:55:31Z',
        now: new Date('2026-10-27T01:25:51Z'),
      }),
    ).toEqual({ stale: true, since: '2026-10-05T01:55:31Z', basis: 'workflow_run' })
  })

  it('treats a run older than the threshold as stale and a newer one as fresh', () => {
    const now = new Date('2026-11-02T00:00:00Z')
    const day = 86400_000
    const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * day).toISOString()
    expect(assessStaleness({ lastObservation: null, lastRunAt: at(WEEKLY_STALE_DAYS + 1), now }).stale).toBe(true)
    expect(assessStaleness({ lastObservation: null, lastRunAt: at(WEEKLY_STALE_DAYS - 1), now }).stale).toBe(false)
  })

  it('falls back to the DB when the run list is unavailable', () => {
    expect(
      assessStaleness({
        lastObservation: '2026-10-26T01:07:59Z',
        now: new Date('2026-10-27T01:25:51Z'),
      }),
    ).toEqual({ stale: false, since: '2026-10-26T01:07:59Z', basis: 'db_observation' })
  })

  it('stays quiet when there is nothing to compare against', () => {
    // A fresh DB on a repo that has never run weekly must not alert; the
    // original check guarded this with `lastWeekly.t &&`.
    expect(assessStaleness({ lastObservation: null })).toEqual({ stale: false, basis: 'no_data' })
  })
})

describe('checkWeeklyFreshness', () => {
  const now = new Date('2026-10-27T01:25:51Z')

  it('returns no journal line and logs fresh on the regression inputs', async () => {
    const { log, lines } = captureLog()
    const notes = await checkWeeklyFreshness(log, '2026-10-19T01:11:16.316Z', now, () => [
      ok('2026-10-26T01:06:50Z'),
    ])
    expect(notes).toEqual([])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      event: 'weekly_fresh',
      level: 'info',
      basis: 'workflow_run',
    })
  })

  it('reports a journal line when the cron really stopped', async () => {
    const { log, lines } = captureLog()
    const notes = await checkWeeklyFreshness(log, '2026-10-05T01:55:31Z', now, () => [
      ok('2026-10-05T01:55:31Z'),
    ])
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('2026-10-05')
    expect(notes[0]).toContain('workflow_run')
    expect(lines.find((l) => l.event === 'weekly_stale')).toMatchObject({
      level: 'warn',
      basis: 'workflow_run',
    })
  })

  it('falls back to the DB and says so when the run list throws', async () => {
    const { log, lines } = captureLog()
    const notes = await checkWeeklyFreshness(log, '2026-10-05T01:55:31Z', now, () => {
      throw new Error('gh: rate limited')
    })
    expect(lines[0]).toMatchObject({ event: 'weekly_run_list_failed', level: 'warn' })
    // Still alerts, by the old basis: a broken watchdog must not go quiet.
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain('db_observation')
  })

  it('does not throw when the run list throws and the DB is empty', async () => {
    const { log } = captureLog()
    await expect(
      checkWeeklyFreshness(log, null, now, () => {
        throw new Error('gh: not found')
      }),
    ).resolves.toEqual([])
  })

  it('does not consult the DB timestamp once a run is known', async () => {
    const { log } = captureLog()
    const fetch_ = vi.fn(() => [ok('2026-10-26T01:06:50Z')])
    // A null DB value (nothing merged yet) must not suppress the run-based
    // verdict, which is the whole point of preferring the run list.
    expect(await checkWeeklyFreshness(log, null, now, fetch_)).toEqual([])
    expect(fetch_).toHaveBeenCalledOnce()
  })
})
