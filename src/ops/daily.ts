// Daily ops entrypoint for GitHub Actions. Grows with each phase; for now it
// checks budget status and writes the journal + living report so every
// automated run leaves a public trace.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { openDb } from '../db/index.ts'
import { BudgetController } from '../budget/controller.ts'
import { Logger, pruneRunLogs } from '../logging/logger.ts'
import { appendJournal } from '../reporting/journal.ts'
import { renderLivingReportHtml } from '../reporting/html.ts'

const db = openDb()
// The DB sink is what makes this run auditable: logs/ is gitignored and the
// runner is discarded, so only run_logs (committed with data/) survives.
const log = Logger.newRun('logs/daily.jsonl', db)
pruneRunLogs(db)

// Ad spend happens on X's side (campaign was deployed manually), so it never
// passes authorize(). Sync scraped actuals from `performance` into the ledger
// so budget caps and the report both count real media spend. Idempotent per
// (creative, date); re-scrapes update the amount in place. created_at is
// pinned to the performance date so month/day cap windows attribute correctly.
const syncAdsActuals = () => {
  const rows = db
    .prepare("select creative_id, substr(observed_at, 1, 10) as date, spend_usd from performance")
    .all() as { creative_id: number; date: string; spend_usd: number }[]
  const upsert = db.prepare(
    `insert into budget_ledger (created_at, category, amount_usd, description, run_id, creative_id, idempotency_key)
     values (?, 'ads', ?, ?, ?, ?, ?)
     on conflict(idempotency_key) do update set amount_usd = excluded.amount_usd`,
  )
  for (const r of rows) {
    upsert.run(
      `${r.date}T12:00:00.000Z`,
      r.spend_usd,
      `X ads actual spend for ${r.date} (bridge scrape)`,
      log.runId,
      r.creative_id,
      `ads-actual-${r.creative_id}-${r.date}`,
    )
  }
  log.info('ads_actuals_synced', { rows: rows.length })
}
syncAdsActuals()

// Watchdog: the bridge (mini-PC self-hosted runner) should have delivered
// yesterday's metrics before this job runs. If it didn't, the whole OODA loop
// is flying blind — alert Slack so the failure is visible even when the
// bridge's own failure notification could not fire (e.g. runner offline).
const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
const fresh = db
  .prepare("select count(*) as n from performance where substr(observed_at,1,10) = ?")
  .get(yesterday) as { n: number }
const watchdogNotes: string[] = []
if (fresh.n === 0) {
  log.warn('metrics_stale', { missingDate: yesterday })
  watchdogNotes.push(`watchdog: no metrics for ${yesterday} — bridge likely down (Slack alerted)`)
  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `⚠️ metrics watchdog: no performance data for ${yesterday}. Bridge runner offline or scrape broken — check https://github.com/artifactshare/ads-lab-bridge/actions`,
      }),
    }).catch(() => {})
  }
}

const budget = new BudgetController(db).status()
log.info('budget_status', budget)

const deployments = db
  .prepare("select count(*) as n from deployments where status = 'active'")
  .get() as { n: number }

const done = [
  `budget check: creative $${budget.month.creative.spent.toFixed(2)}/$${budget.month.creative.limit}, ads $${budget.month.ads.spent.toFixed(2)}/$${budget.month.ads.limit} (today $${budget.today.ads.spent.toFixed(2)}/$${budget.today.ads.limit})`,
  `${deployments.n} active deployment(s); metrics via bridge scrape (Ads API approval pending)`,
  ...watchdogNotes,
]

// Decide: continue or start a new creative generation from real performance.
if (process.env.FAL_KEY && process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  try {
    const { decideAndAct } = await import('./decide.ts')
    done.push(...(await decideAndAct(db, log)))
  } catch (err) {
    log.error('decide_failed', { error: String(err).slice(0, 500) })
    done.push(`decide step failed: ${String(err).slice(0, 200)}`)
  }
} else {
  log.warn('decide_skipped', { reason: 'FAL_KEY or CLAUDE_CODE_OAUTH_TOKEN not set' })
}
// Watchdog: auto-merge is how every automated run reaches main. If it stalls,
// the run's DB update and journal entry never land and nothing says so.
if (process.env.GH_TOKEN) {
  const { checkStalledPrs } = await import('./stalled-prs.ts')
  done.push(...(await checkStalledPrs(log)))
} else {
  log.warn('stalled_pr_check_skipped', { reason: 'GH_TOKEN not set' })
}

if (process.env.XAI_API_KEY) {
  const { dailyObservation, discoverPostUrls } = await import('../research/research.ts')
  done.push(...(await dailyObservation(db, log)))
  done.push(...(await discoverPostUrls(db, log)))
} else {
  log.warn('research_skipped', { reason: 'XAI_API_KEY not set' })
}
appendJournal({ actor: 'daily-ops (automated)', done, spent: [], learnings: [], next: [] })

writeFileSync('data/living-report.html', renderLivingReportHtml(db))
if (process.env.ARTIFACTSHARE_TOKEN) {
  execFileSync(
    'npx',
    ['--yes', '@artifactshare/cli', 'share', 'data/living-report.html', '--key', 'ads-lab-living-report', '--visibility', 'link', '--no-link-expiry', '--json'],
    { encoding: 'utf8' },
  )
  log.info('living_report_published')
} else {
  log.warn('living_report_skipped', { reason: 'ARTIFACTSHARE_TOKEN not set' })
}
db.close()
