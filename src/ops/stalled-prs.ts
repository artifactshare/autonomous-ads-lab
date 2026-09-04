// Auto-merge is the only path by which automated runs reach main. When it
// stalls the PR just sits there: GitHub sends no notification, the run is
// green, and the DB update + journal entry inside it are silently lost once
// the branch rots into a conflict. Idempotent daily/weekly jobs can recover a
// DIRTY PR safely by rerunning from current main; other states remain alerts.
import { execFileSync } from 'node:child_process'
import type { Logger } from '../logging/logger.ts'

/** Subset of `gh pr list --json ...` we care about. */
export interface PrSummary {
  number: number
  title: string
  createdAt: string
  headRefName: string
  mergeStateStatus: string
}

/**
 * `CLEAN` / `HAS_HOOKS` mean auto-merge is still on track. Everything else is
 * a state auto-merge cannot leave on its own:
 * - DIRTY: conflicts with main, auto-merge is dead
 * - BLOCKED: required checks not satisfied (e.g. a run stuck in action_required)
 * - UNKNOWN: GitHub has not computed mergeability — persistent for stuck runs
 * - BEHIND: needs an update the bot never pushes
 */
const STALLED_STATES = new Set(['DIRTY', 'BLOCKED', 'UNKNOWN', 'BEHIND'])

// Branch prefixes used by daily/weekly and the harness agent. A human branch
// following the same convention gets reported too; that is harmless, since
// this watchdog only reports.
const AUTOMATED_PREFIXES = ['auto/', 'fix/', 'improve/']

const RETRY_WORKFLOWS = [
  { prefix: 'auto/Daily-Ops-', workflow: 'daily.yml' },
  { prefix: 'auto/Weekly-Learning-', workflow: 'weekly.yml' },
] as const

/**
 * A PR is only stalled once it has had time to settle: a PR opened seconds ago
 * legitimately reports UNKNOWN while checks are still being scheduled.
 */
export function selectStalled(
  prs: PrSummary[],
  now: Date = new Date(),
  graceHours = 2,
): PrSummary[] {
  const cutoff = now.getTime() - graceHours * 3600_000
  return prs.filter(
    (pr) =>
      AUTOMATED_PREFIXES.some((p) => pr.headRefName.startsWith(p)) &&
      STALLED_STATES.has(pr.mergeStateStatus) &&
      Date.parse(pr.createdAt) < cutoff,
  )
}

export function describeStalled(pr: PrSummary, now: Date = new Date()): string {
  const hours = Math.floor((now.getTime() - Date.parse(pr.createdAt)) / 3600_000)
  return `PR #${pr.number} (${pr.mergeStateStatus}, ${hours}h): ${pr.title}`
}

function fetchOpenPrs(): PrSummary[] {
  const out = execFileSync(
    'gh',
    ['pr', 'list', '--state', 'open', '--limit', '50', '--json',
     'number,title,createdAt,headRefName,mergeStateStatus'],
    { encoding: 'utf8' },
  )
  return JSON.parse(out) as PrSummary[]
}

export function retryWorkflowFor(pr: PrSummary): string | null {
  return RETRY_WORKFLOWS.find(({ prefix }) => pr.headRefName.startsWith(prefix))?.workflow ?? null
}

export function selectRecoverable(
  prs: PrSummary[],
  now: Date = new Date(),
  graceHours = 2,
): PrSummary[] {
  return selectStalled(prs, now, graceHours).filter(
    (pr) => pr.mergeStateStatus === 'DIRTY' && retryWorkflowFor(pr) !== null,
  )
}

function recoverOne(pr: PrSummary): void {
  const workflow = retryWorkflowFor(pr)
  if (!workflow) throw new Error(`no retry workflow for ${pr.headRefName}`)

  // Dispatch first. If closing fails, an idempotent retry is preferable to
  // closing the only copy and then failing to schedule its replacement.
  execFileSync('gh', ['workflow', 'run', workflow], { stdio: 'pipe' })
  execFileSync('gh', ['pr', 'close', String(pr.number), '--delete-branch'], { stdio: 'pipe' })
}

/**
 * Replace DIRTY daily/weekly PRs with a fresh run from current main.
 * Never throws: failures remain visible to checkStalledPrs and Slack.
 */
export async function recoverStalledPrs(
  log: Logger,
  now: Date = new Date(),
  fetch_ = fetchOpenPrs,
  recover_: (pr: PrSummary) => void | Promise<void> = recoverOne,
): Promise<string[]> {
  let recoverable: PrSummary[]
  try {
    recoverable = selectRecoverable(fetch_(), now)
  } catch (err) {
    log.warn('stalled_pr_recovery_check_failed', { error: String(err).slice(0, 200) })
    return []
  }

  const notes: string[] = []
  for (const pr of recoverable) {
    const workflow = retryWorkflowFor(pr)!
    try {
      await recover_(pr)
      log.warn('stalled_pr_recovered', { number: pr.number, workflow })
      notes.push(`watchdog: closed DIRTY PR #${pr.number} and dispatched ${workflow}`)
    } catch (err) {
      log.warn('stalled_pr_recovery_failed', {
        number: pr.number,
        workflow,
        error: String(err).slice(0, 200),
      })
    }
  }
  return notes
}

/**
 * Report auto PRs whose auto-merge has stalled. Returns journal lines.
 * Never throws: this is observability, and it must not fail the daily run.
 */
export async function checkStalledPrs(
  log: Logger,
  now: Date = new Date(),
  fetch_ = fetchOpenPrs,
): Promise<string[]> {
  let stalled: PrSummary[]
  try {
    stalled = selectStalled(fetch_(), now)
  } catch (err) {
    log.warn('stalled_pr_check_failed', { error: String(err).slice(0, 200) })
    return []
  }
  if (stalled.length === 0) {
    log.info('stalled_pr_check', { stalled: 0 })
    return []
  }

  const lines = stalled.map((pr) => describeStalled(pr, now))
  log.warn('stalled_prs', { numbers: stalled.map((p) => p.number), states: stalled.map((p) => p.mergeStateStatus) })

  if (process.env.SLACK_WEBHOOK_URL) {
    await globalThis
      .fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `⚠️ auto-merge stalled on ${stalled.length} PR(s) — automated DB/journal updates are not reaching main:\n${lines.join('\n')}`,
        }),
      })
      .catch(() => {})
  }
  return [`watchdog: auto-merge stalled on ${stalled.length} PR(s) — ${lines.join('; ')}`]
}
