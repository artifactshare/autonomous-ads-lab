// Watchdog: GitHub sometimes skips scheduled runs outright (observed 9/1), so
// the daily job checks that the weekly research job is still firing.
//
// The original check asked the Experience DB "how old is the newest weekly
// research row?". That question cannot be answered from main, because weekly
// data does not reach main when the weekly job runs -- it reaches main when
// the weekly job's PR merges, and that merge is performed by this very daily
// run's approve step (#107). The ordering is pathological:
//
//   Mon 01:06 UTC  weekly.yml runs, opens PR, CI parks in action_required
//   Tue 01:25 UTC  daily.ts reads main -> newest weekly row is 8d old -> ALERT
//   Tue 01:27 UTC  the same daily run's approve step lands the weekly PR
//
// Measured on 2026-10-27: the alert fired at 01:25:51 and weekly PR #241
// merged at 01:27:55, two minutes later. So the check fired every single
// Monday -- 10/06, 10/13, 10/27 all logged `weekly_stale` while weekly.yml
// had in fact succeeded the day before, every time.
//
// That is worse than noise. The alert tells a human to run
// `gh workflow run weekly.yml`, and doing so re-spends the weekly research
// budget (6 Grok queries, ~$0.24 observed on 2026-11-02) to rediscover data
// that was already sitting in an unmerged PR.
//
// So ask the authoritative source instead. "Did the cron fire?" is a question
// about workflow runs, and the Actions API answers it with no PR-merge lag.
// The DB stays as the fallback for when that call is unavailable.

import { execFileSync } from 'node:child_process'
import type { Logger } from '../logging/logger.ts'

/** Subset of `gh run list --json ...` we care about. */
export interface RunSummary {
  createdAt: string
  status: string
  conclusion: string | null
}

/** Days without a weekly run before the cron is presumed to have stopped. */
export const WEEKLY_STALE_DAYS = 8

/**
 * Newest weekly run that actually did the work, as an ISO timestamp.
 *
 * A `failure` conclusion is deliberately *not* counted: a weekly job that
 * runs and crashes every week leaves no research either, and treating it as
 * fresh would hide that. An in-progress run also does not count -- the daily
 * job runs ~70 minutes before weekly on Mondays, so counting one would make
 * the check permanently green from the wrong side.
 */
export function lastSuccessfulRunAt(runs: RunSummary[]): string | undefined {
  return runs
    .filter((r) => r.status === 'completed' && r.conclusion === 'success')
    .map((r) => r.createdAt)
    .sort()
    .at(-1)
}

export interface StalenessInput {
  /** Newest weekly-kind `research_observations` row in main; lags PR merges. */
  lastObservation: string | null
  /** Newest successful weekly.yml run; `undefined` when the API was unreachable. */
  lastRunAt?: string
  now?: Date
  days?: number
}

export interface Staleness {
  stale: boolean
  /** Timestamp the verdict was computed from, if any. */
  since?: string
  /** Which source answered, so the log says why it believes what it believes. */
  basis: 'workflow_run' | 'db_observation' | 'no_data'
}

/**
 * Decide whether the weekly cron has stopped firing.
 *
 * Prefers the workflow-run timestamp; falls back to the DB observation only
 * when the run list is unavailable, which restores exactly the old (false-
 * positive-prone) behaviour rather than failing silent. A watchdog that goes
 * quiet when its input breaks is worse than one that occasionally over-reports.
 */
export function assessStaleness({
  lastObservation,
  lastRunAt,
  now = new Date(),
  days = WEEKLY_STALE_DAYS,
}: StalenessInput): Staleness {
  const threshold = days * 86400_000
  const olderThanThreshold = (ts: string) => now.getTime() - Date.parse(ts) > threshold

  if (lastRunAt !== undefined) {
    return { stale: olderThanThreshold(lastRunAt), since: lastRunAt, basis: 'workflow_run' }
  }
  if (lastObservation !== null) {
    return {
      stale: olderThanThreshold(lastObservation),
      since: lastObservation,
      basis: 'db_observation',
    }
  }
  // Nothing to compare against: a fresh DB on a repo that has never run
  // weekly. The original check also stayed quiet here (`lastWeekly.t &&`).
  return { stale: false, basis: 'no_data' }
}

export function fetchWeeklyRuns(): RunSummary[] {
  const out = execFileSync(
    'gh',
    ['run', 'list', '--workflow', 'weekly.yml', '--limit', '10', '--json',
     'createdAt,status,conclusion'],
    { encoding: 'utf8' },
  )
  return JSON.parse(out) as RunSummary[]
}

/**
 * Report a weekly cron that has stopped firing. Returns journal lines.
 *
 * Never throws: this is observability, and it must not fail the daily run.
 */
export async function checkWeeklyFreshness(
  log: Logger,
  lastObservation: string | null,
  now: Date = new Date(),
  fetch_ = fetchWeeklyRuns,
): Promise<string[]> {
  let lastRunAt: string | undefined
  try {
    lastRunAt = lastSuccessfulRunAt(fetch_())
  } catch (err) {
    // Falls back to the DB check below rather than going quiet.
    log.warn('weekly_run_list_failed', { error: String(err).slice(0, 200) })
  }

  const verdict = assessStaleness({ lastObservation, lastRunAt, now })
  if (!verdict.stale) {
    log.info('weekly_fresh', { basis: verdict.basis, since: verdict.since })
    return []
  }

  const since = verdict.since!.slice(0, 10)
  log.warn('weekly_stale', { lastRun: verdict.since, basis: verdict.basis })

  if (process.env.SLACK_WEBHOOK_URL) {
    await globalThis
      .fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `⚠️ weekly research has not run since ${since} (${verdict.basis}) — GitHub cron likely skipped. Dispatch: gh workflow run weekly.yml -R artifactshare/autonomous-ads-lab`,
        }),
      })
      .catch(() => {})
  }
  return [
    `watchdog: weekly research last ran ${since} (>${WEEKLY_STALE_DAYS}d ago, by ${verdict.basis}) — cron likely skipped (Slack alerted)`,
  ]
}
