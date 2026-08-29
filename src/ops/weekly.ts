// Weekly entrypoint: research (pain points + ad trends -> techniques),
// learning summary, journal, living report. Grows with Phase 5 (learning loop).
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { openDb } from '../db/index.ts'
import { Logger } from '../logging/logger.ts'
import { appendJournal } from '../reporting/journal.ts'
import { renderLivingReportHtml } from '../reporting/html.ts'
import { weeklyResearch } from '../research/research.ts'
import { ResearchRepo } from '../research/repo.ts'

const log = Logger.newRun('logs/weekly.jsonl')
const db = openDb()

const done: string[] = []
if (process.env.XAI_API_KEY) {
  done.push(...(await weeklyResearch(db, log)))
} else {
  log.warn('research_skipped', { reason: 'XAI_API_KEY not set' })
}

const discovered = new ResearchRepo(db).techniques('discovered').length
done.push(`technique library: ${discovered} discovered technique(s) awaiting experiments`)

// TODO Phase 5: learning extraction + next-generation candidate selection.
appendJournal({ actor: 'weekly-learning (automated)', done, spent: [], learnings: [], next: [] })

writeFileSync('data/living-report.html', renderLivingReportHtml(db))
if (process.env.ARTIFACTSHARE_TOKEN) {
  execFileSync(
    'npx',
    ['--yes', '@artifactshare/cli', 'share', 'data/living-report.html', '--key', 'ads-lab-living-report', '--visibility', 'link', '--no-link-expiry', '--json'],
    { encoding: 'utf8' },
  )
  log.info('living_report_published')
}
db.close()
