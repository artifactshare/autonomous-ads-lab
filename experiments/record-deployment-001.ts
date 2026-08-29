// Record the manual X Ads deployment of creative 3 (experiment 001 winner).
import { openDb } from '../src/db/index.ts'

const db = openDb()
db.prepare(
  `insert into deployments (creative_id, platform, campaign_id, status, targeting, budget_usd, started_at)
   values (?, 'x', ?, 'active', ?, ?, ?)`,
).run(
  3,
  '42298216',
  JSON.stringify({
    countries: ['US', 'GB', 'CA', 'AU'],
    language: 'en',
    keywords: ['Claude Code', 'Cursor AI', 'AI coding', 'vibe coding'],
    objective: 'website_traffic',
    bid: 'auto',
    daily_budget_jpy: 220,
    deployed_via: 'manual (Ads Manager; Ads API approval pending)',
    utm: 'utm_source=x&utm_medium=paid&utm_campaign=exp001',
  }),
  1.5,
  new Date().toISOString(),
)
console.log('deployment recorded')
db.close()
