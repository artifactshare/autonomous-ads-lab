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
  /** Optional so older call sites and fixtures stay valid; absent = not a bot. */
  author?: { login?: string; is_bot?: boolean }
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

// Branch names are chosen by the agents themselves, so a prefix allowlist only
// catches the ones that followed their prompt: the strategist was told to use
// `improve/` and opened PR #106 from `strategist/`, invisible to this watchdog.
// Authorship is not the agent's to pick — every automated PR is opened through
// GITHUB_TOKEN and lands as github-actions[bot] — so it is the reliable signal.
// Kept as a union with the prefixes so a human `fix/` branch still reports.
const BOT_AUTHORS = new Set(['github-actions[bot]', 'app/github-actions', 'ads-lab-bot'])

function isAutomated(pr: PrSummary): boolean {
  const login = pr.author?.login
  if (pr.author?.is_bot || (login !== undefined && BOT_AUTHORS.has(login))) return true
  return AUTOMATED_PREFIXES.some((p) => pr.headRefName.startsWith(p))
}

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
      isAutomated(pr) &&
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
     'number,title,createdAt,headRefName,mergeStateStatus,author'],
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

/**
 * Marker on the merge commit the watchdog pushes. Seeing it on the branch tip
 * means salvage already ran and did not stick, so the next round must fall
 * through to the destructive path instead of merging forever.
 */
export const SALVAGE_MARKER = 'watchdog: merge main into'

export type GitRun = (args: string[]) => string

/**
 * Git with a committer identity supplied through the environment. The daily
 * job only runs `git config` in its commit step, which is *after* daily.ts,
 * so commit-tree would otherwise fail on an empty ident.
 */
const runGit: GitRun = (args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ads-lab-bot',
      GIT_AUTHOR_EMAIL: 'actions@github.com',
      GIT_COMMITTER_NAME: 'ads-lab-bot',
      GIT_COMMITTER_EMAIL: 'actions@github.com',
    },
  })

/**
 * Clear a branch's conflict by merging current main into it, keeping the PR
 * (and the event log inside it) alive.
 *
 * Uses plumbing only: the daily job commits from this working tree after the
 * watchdog runs, so checking out another branch here would corrupt it.
 * `merge-tree --write-tree` honours .gitattributes, so journal/*.md still
 * merges with the union driver that #135 installed.
 *
 * Returns false when there is nothing to salvage or the conflict is real; the
 * caller then falls back to the existing dispatch-and-close recovery.
 */
export function salvageBranch(branch: string, git: GitRun = runGit): boolean {
  // The daily checkout is shallow (no fetch-depth), so there is no common
  // ancestor to merge against until the history is filled in.
  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    git(['fetch', '--unshallow', '--no-tags', 'origin'])
  }
  const main = 'refs/remotes/origin/main'
  const tip = `refs/remotes/origin/${branch}`
  git([
    'fetch', '--no-tags', 'origin',
    `+refs/heads/main:${main}`,
    `+refs/heads/${branch}:${tip}`,
  ])

  if (git(['log', '-1', '--format=%s', tip]).trim().startsWith(SALVAGE_MARKER)) return false

  // Already contains main: the conflict is not staleness, so merging is a no-op.
  try {
    git(['merge-base', '--is-ancestor', main, tip])
    return false
  } catch {
    // expected: main is ahead of the branch
  }

  let tree: string
  try {
    tree = git(['merge-tree', '--write-tree', main, tip]).trim()
  } catch {
    return false // a real content conflict; only a rerun can fix it
  }

  // Branch tip first so the push is a fast-forward, never a history rewrite.
  const commit = git([
    'commit-tree', tree, '-p', tip, '-p', main, '-m', `${SALVAGE_MARKER} ${branch}`,
  ]).trim()
  git(['push', 'origin', `${commit}:refs/heads/${branch}`])
  return true
}

/** `salvaged`: PR kept, main merged in. `replaced`: PR closed, workflow rerun. */
export type RecoveryAction = 'salvaged' | 'replaced'

function recoverOne(pr: PrSummary): RecoveryAction {
  const workflow = retryWorkflowFor(pr)
  if (!workflow) throw new Error(`no retry workflow for ${pr.headRefName}`)

  // Closing deletes the branch, and with it that run's data/events/*.jsonl --
  // the paid research and budget_ledger rows that never reached main (#133).
  // Merging main in first usually clears the conflict and keeps all of it.
  // The push lands the CI run in action_required, which the approve step at
  // the end of this same daily run un-sticks.
  try {
    if (salvageBranch(pr.headRefName)) return 'salvaged'
  } catch {
    // Salvage is best effort: fall through to the known-good recovery.
  }

  // Dispatch first. If closing fails, an idempotent retry is preferable to
  // closing the only copy and then failing to schedule its replacement.
  execFileSync('gh', ['workflow', 'run', workflow], { stdio: 'pipe' })
  execFileSync('gh', ['pr', 'close', String(pr.number), '--delete-branch'], { stdio: 'pipe' })
  return 'replaced'
}

/**
 * Un-stick DIRTY daily/weekly PRs: merge main into the branch when that is
 * enough, and only replace the PR with a fresh run when it is not.
 * Never throws: failures remain visible to checkStalledPrs and Slack.
 */
export async function recoverStalledPrs(
  log: Logger,
  now: Date = new Date(),
  fetch_ = fetchOpenPrs,
  recover_: (pr: PrSummary) => RecoveryAction | Promise<RecoveryAction> = recoverOne,
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
      if ((await recover_(pr)) === 'salvaged') {
        log.warn('stalled_pr_salvaged', { number: pr.number, branch: pr.headRefName })
        notes.push(`watchdog: merged main into DIRTY PR #${pr.number}, keeping its event log`)
      } else {
        log.warn('stalled_pr_recovered', { number: pr.number, workflow })
        notes.push(`watchdog: closed DIRTY PR #${pr.number} and dispatched ${workflow}`)
      }
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
