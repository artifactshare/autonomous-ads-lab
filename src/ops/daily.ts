// Daily ops entrypoint for GitHub Actions. Grows with each phase; for now it
// checks budget status and writes the journal + living report so every
// automated run leaves a public trace.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { openDb } from '../db/index.ts'
import { BudgetController } from '../budget/controller.ts'
import { Logger } from '../logging/logger.ts'
import { appendJournal } from '../reporting/journal.ts'
import { renderLivingReportHtml } from '../reporting/html.ts'

const log = Logger.newRun('logs/daily.jsonl')
const db = openDb()
const budget = new BudgetController(db).status()
log.info('budget_status', budget)

const deployments = db
  .prepare("select count(*) as n from deployments where status = 'active'")
  .get() as { n: number }

// TODO Phase 3/5: metrics retrieval + decide (continue / pause / mutate).
const done = [
  `budget check: creative $${budget.month.creative.spent.toFixed(2)}/$${budget.month.creative.limit}, ads $${budget.month.ads.spent.toFixed(2)}/$${budget.month.ads.limit} (today $${budget.today.ads.spent.toFixed(2)}/$${budget.today.ads.limit})`,
  `${deployments.n} active deployment(s); metrics retrieval not yet automated (Ads API approval pending)`,
]
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
