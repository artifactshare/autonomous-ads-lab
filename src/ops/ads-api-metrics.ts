// Sync daily performance from the X Ads API into the Experience DB.
// Replaces the ads-lab-bridge scrape once secrets are present; no-op otherwise.
// Idempotent per (creative, date), same contract as ads-lab-bridge/ingest.mts.
import type Database from 'better-sqlite3'
import { openDb } from '../db/index.ts'
import { accountIdFromEnv, campaignDailyStats, credsFromEnv, entityDailyStats } from '../ads/x-ads-api.ts'

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
    .prepare("select creative_id, campaign_id, ad_id from deployments where platform = 'x' and campaign_id is not null")
    .all() as Array<{ creative_id: number; campaign_id: string; ad_id: string | null }>
  const end = jstDay(Date.now() - 86400_000)
  const start = jstDay(Date.now() - BACKFILL_DAYS * 86400_000)
  const del = db.prepare('delete from performance where creative_id = ? and substr(observed_at, 1, 10) = ?')
  const ins = db.prepare(
    'insert into performance (creative_id, observed_at, spend_usd, impressions, video_views, clicks) values (?, ?, ?, ?, ?, ?)',
  )
  const notes: string[] = []
  for (const d of deployments) {
    // ad_id = promoted_tweet id (Ads API deployments). Older bridge-era rows have none → campaign total.
    // Campaign totals include every promoted tweet in the campaign, so once any
    // deployment in the same campaign is tracked at promoted-tweet level, the
    // fallback would double-count that spend (this inflated Sept 2026 by ~$8.75:
    // stopped creative 3's campaign rows duplicated creatives 8+27 from 9/15 on).
    if (!d.ad_id && deployments.some((o) => o.ad_id && o.campaign_id === d.campaign_id)) {
      notes.push(
        `ads-api: creative ${d.creative_id} campaign ${d.campaign_id}: skipped (campaign totals would double-count promoted-tweet deployments)`,
      )
      continue
    }
    const rows = d.ad_id
      ? await entityDailyStats(creds, accountId, 'PROMOTED_TWEET', d.ad_id, start, end)
      : await campaignDailyStats(creds, accountId, d.campaign_id, start, end)
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
    notes.push(`ads-api: creative ${d.creative_id} ${d.ad_id ? `promoted_tweet ${d.ad_id}` : `campaign ${d.campaign_id}`}: ${n} day(s) synced (${start}..${end})`)
  }
  if (!dbIn) db.close()
  return notes
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const l of await syncAdsApiMetrics()) console.log(l)
}
