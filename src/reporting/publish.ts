// Render the living report and publish it to Artifact Share (same URL via --key).
// pnpm tsx src/reporting/publish.ts
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { openDb } from '../db/index.ts'
import { renderLivingReport } from './living-report.ts'

const db = openDb()
const md = renderLivingReport(db)
writeFileSync('data/living-report.md', md)
db.close()

const out = execFileSync(
  'npx',
  ['--yes', '@artifactshare/cli', 'share', 'data/living-report.md', '--key', 'ads-lab-living-report', '--visibility', 'link', '--no-link-expiry', '--json'],
  { encoding: 'utf8' },
)
const parsed = JSON.parse(out) as { data: { artifact: { url: string } }; ok: boolean }
console.log('published:', parsed.data.artifact.url)
