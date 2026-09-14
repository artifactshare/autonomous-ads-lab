// Sync daily performance from the X Ads API into the Experience DB.
// Replaces the ads-lab-bridge scrape once secrets are present; no-op otherwise.
// Idempotent per (creative, date), same contract as ads-lab-bridge/ingest.mts.
import type Database from 'better-sqlite3'
import { openDb } from '../db/index.ts'
import { accountIdFromEnv, campaignDailyStats, credsFromEnv } from '../ads/x-ads-api.ts'

const JPY_PER_USD = Number(process.env.JPY_PER_USD ?? 150)
const BACKFILL_DAYS = Number(process.env.ADS_API_BACKFILL_DAYS ?? 7)
const JST = 9 * 3600_000
const jstDay = (t: number) => new Date(t + JST).toISOString().slice(0, 10)

export async function syncAdsApiMetrics(dbIn?: Database.Database): Promise<string[]> {
  const creds = credsFromEnv()
  if (!creds) return ['ads-api: secrets not set; metrics still via bridge scrape']
  const accountId = accountIdFromEnv()
  const db = dbIn ?? openDb()
  const deployments = db
    .prepare("select creative_id, campaign_id from deployments where platform = 'x' and campaign_id is not null")
    .all() as Array<{ creative_id: number; campaign_id: string }>
  const end = jstDay(Date.now() - 86400_000)
  const start = jstDay(Date.now() - BACKFILL_DAYS * 86400_000)
  const del = db.prepare('delete from performance where creative_id = ? and substr(observed_at, 1, 10) = ?')
  const ins = db.prepare(
    'insert into performance (creative_id, observed_at, spend_usd, impressions, video_views, clicks) values (?, ?, ?, ?, ?, ?)',
  )
  const notes: string[] = []
  for (const d of deployments) {
    const rows = await campaignDailyStats(creds, accountId, d.campaign_id, start, end)
    let n = 0
    for (const r of rows) {
      if (r.impressions === 0 && r.spend_micro === 0 && r.clicks === 0) continue
      const spendUsd = Number((r.spend_micro / 1e6 / JPY_PER_USD).toFixed(4)) // account currency is JPY
      db.transaction(() => {
        del.run(d.creative_id, r.date)
        ins.run(d.creative_id, r.date + 'T23:59:59Z', spendUsd, r.impressions, r.video_views, r.clicks)
      })()
      n++
    }
    notes.push(`ads-api: creative ${d.creative_id} campaign ${d.campaign_id}: ${n} day(s) synced (${start}..${end})`)
  }
  if (!dbIn) db.close()
  return notes
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const l of await syncAdsApiMetrics()) console.log(l)
}
