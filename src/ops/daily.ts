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

// Metrics: X Ads API (app 33371617, Standard access granted 2026-08-31) when
// the X_ADS_* secrets are set; otherwise the ads-lab-bridge scrape still feeds
// `performance`. Runs first so the ledger sync below sees today's actuals.
const adsApiNotes: string[] = []
try {
  const { syncAdsApiMetrics } = await import('./ads-api-metrics.ts')
  adsApiNotes.push(...(await syncAdsApiMetrics(db)))
  const { refreshApproval } = await import('../ads/deploy.ts')
  adsApiNotes.push(...(await refreshApproval(db)))
  const { checkFunding } = await import('../ads/control.ts')
  adsApiNotes.push(...(await checkFunding()))
} catch (err) {
  log.error('ads_api_sync_failed', { error: String(err).slice(0, 500) })
  adsApiNotes.push(`ads-api sync failed (bridge scrape remains source): ${String(err).slice(0, 200)}`)
}

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
  watchdogNotes.push(`watchdog: no metrics for ${yesterday} — Ads API sync failed or nothing served (Slack alerted)`)
  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `⚠️ metrics watchdog: no performance data for ${yesterday}. Ads API sync failed or the ad served nothing — check the Daily Ops run log`,
      }),
    }).catch(() => {})
  }
}

// Watchdog: GitHub sometimes skips scheduled runs outright (observed 9/1).
// Weekly research writes research_observations; if the newest weekly-kind row
// is over 8 days old, the weekly job has silently stopped running.
const lastWeekly = db
  .prepare("select max(created_at) as t from research_observations where kind in ('pain_points','ad_trends')")
  .get() as { t: string | null }
if (lastWeekly.t && Date.now() - new Date(lastWeekly.t).getTime() > 8 * 86400_000) {
  log.warn('weekly_stale', { lastRun: lastWeekly.t })
  watchdogNotes.push(`watchdog: weekly research last ran ${lastWeekly.t.slice(0, 10)} (>8d ago) — cron likely skipped (Slack alerted)`)
  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `⚠️ weekly research has not run since ${lastWeekly.t.slice(0, 10)} — GitHub cron likely skipped. Dispatch: gh workflow run weekly.yml -R artifactshare/autonomous-ads-lab`,
      }),
    }).catch(() => {})
  }
}

const budget = new BudgetController(db).status()
log.info('budget_status', budget)

// Kill switch: BudgetController only gates agent-initiated spend; media spend
// accrues on X's side. Pause delivery once the month cannot fit another day.
const guardNotes: string[] = []
try {
  const { enforceMonthlyAdsCap } = await import('./budget-guard.ts')
  guardNotes.push(...(await enforceMonthlyAdsCap(db, budget.month.ads.spent)))
  for (const n of guardNotes) log.info('budget_guard', { n })
} catch (err) {
  log.error('budget_guard_failed', { error: String(err).slice(0, 500) })
  guardNotes.push(`⚠️ budget guard failed (delivery may still be live over the monthly cap): ${String(err).slice(0, 200)}`)
}

const deployments = db
  .prepare("select count(*) as n from deployments where status = 'active'")
  .get() as { n: number }

const done = [
  `budget check: creative $${budget.month.creative.spent.toFixed(2)}/$${budget.month.creative.limit}, ads $${budget.month.ads.spent.toFixed(2)}/$${budget.month.ads.limit} (today $${budget.today.ads.spent.toFixed(2)}/$${budget.today.ads.limit})`,
  ...guardNotes,
  `${deployments.n} active deployment(s); metrics via ${process.env.X_ADS_ACCESS_TOKEN ? 'X Ads API' : 'bridge scrape (X_ADS_* secrets not set)'}`,
  ...adsApiNotes,
  ...watchdogNotes,
]

// Conversions: pull per-campaign sessions/sign_ups from GA4 so decide can
// weigh real outcomes, not just CTR. Dormant until the GA4 secrets are set.
try {
  const { syncGa4Conversions } = await import('./ga4.ts')
  done.push(...(await syncGa4Conversions(db, log)))
} catch (err) {
  log.error('ga4_sync_failed', { error: String(err).slice(0, 500) })
  done.push(`ga4 sync failed: ${String(err).slice(0, 200)}`)
}

// Decide: continue or start a new creative generation from real performance.
if (process.env.FAL_KEY && process.env.CLAUDE_CODE_OAUTH_TOKEN && process.env.GEMINI_API_KEY) {
  try {
    const { decideAndAct } = await import('./decide.ts')
    done.push(...(await decideAndAct(db, log)))
  } catch (err) {
    log.error('decide_failed', { error: String(err).slice(0, 500) })
    done.push(`decide step failed: ${String(err).slice(0, 200)}`)
  }
} else {
  log.warn('decide_skipped', { reason: 'FAL_KEY, CLAUDE_CODE_OAUTH_TOKEN, or GEMINI_API_KEY not set' })
}
// Watchdog: auto-merge is how every automated run reaches main. If it stalls,
// the run's DB update and journal entry never land and nothing says so.
if (process.env.GH_TOKEN) {
  const { checkStalledPrs, recoverStalledPrs } = await import('./stalled-prs.ts')
  done.push(...(await recoverStalledPrs(log)))
  done.push(...(await checkStalledPrs(log)))
} else {
  log.warn('stalled_pr_check_skipped', { reason: 'GH_TOKEN not set' })
}

if (process.env.XAI_API_KEY) {
  const { dailyObservation, discoverPostUrls, collectAdReactions } = await import('../research/research.ts')
  done.push(...(await dailyObservation(db, log)))
  done.push(...(await discoverPostUrls(db, log)))
  done.push(...(await collectAdReactions(db, log)))
} else {
  log.warn('research_skipped', { reason: 'XAI_API_KEY not set' })
}
appendJournal({ actor: 'daily-ops (automated)', done, spent: [], learnings: [], next: [] })

// Daily heartbeat: one Slack line with yesterday's numbers and today's decide
// outcome, so silence never has to be interpreted as either health or failure.
if (process.env.SLACK_WEBHOOK_URL) {
  const y = db
    .prepare(
      "select coalesce(sum(impressions),0) as imp, coalesce(sum(clicks),0) as clicks, coalesce(sum(spend_usd),0) as spend from performance where substr(observed_at,1,10) = ?",
    )
    .get(yesterday) as { imp: number; clicks: number; spend: number }
  const ctr = y.imp > 0 ? ((y.clicks / y.imp) * 100).toFixed(2) + '%' : '—'
  const decideNote = done.find((l) => l.startsWith('decide:')) ?? 'decide: (not run)'
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: `📊 ${yesterday}: ${y.imp} imp / ${y.clicks} clicks / CTR ${ctr} / $${y.spend.toFixed(2)} · ${decideNote}`,
    }),
  }).catch(() => {})
}

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
