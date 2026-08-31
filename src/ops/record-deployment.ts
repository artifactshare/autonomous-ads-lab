// Record a manual creative swap in the Ads Manager (used from needs-human
// deployment issues until the Ads API is approved). Marks the replaced
// deployment stopped and the new creative active on the same campaign.
//
//   pnpm tsx src/ops/record-deployment.ts --creative 7 --replaces 3
import { openDb } from '../db/index.ts'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const creativeId = Number(arg('creative'))
const replacesId = Number(arg('replaces'))
if (!Number.isInteger(creativeId) || !Number.isInteger(replacesId)) {
  console.error('usage: record-deployment.ts --creative <id> --replaces <deployed creative id>')
  process.exit(1)
}

const db = openDb()
const old = db
  .prepare("select id, campaign_id, targeting, budget_usd from deployments where creative_id = ? and status = 'active'")
  .get(replacesId) as { id: number; campaign_id: string | null; targeting: string | null; budget_usd: number | null } | undefined
if (!old) {
  console.error(`no active deployment found for creative ${replacesId}`)
  process.exit(1)
}

const now = new Date().toISOString()
db.prepare("update deployments set status = 'stopped', stopped_at = ? where id = ?").run(now, old.id)
db.prepare(
  `insert into deployments (creative_id, platform, campaign_id, status, targeting, budget_usd, started_at)
   values (?, 'x', ?, 'active', ?, ?, ?)`,
).run(creativeId, old.campaign_id, old.targeting, old.budget_usd, now)
console.log(`deployment recorded: creative ${creativeId} active (replaced ${replacesId}); commit data/ to main via PR`)
db.close()
