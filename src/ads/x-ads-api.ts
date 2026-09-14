// X Ads API client (OAuth 1.0a, no external deps).
// App 33371617 was granted Standard Ads API access on 2026-08-31.
// Secrets: X_ADS_CONSUMER_KEY / X_ADS_CONSUMER_SECRET / X_ADS_ACCESS_TOKEN / X_ADS_ACCESS_TOKEN_SECRET
// Variable: X_ADS_ACCOUNT_ID (ads.x.com/manager/{account_id}, e.g. 18ce55x0rpo)
import { createHmac, randomBytes } from 'node:crypto'

const API = 'https://ads-api.x.com/12'

export interface AdsCreds {
  consumerKey: string
  consumerSecret: string
  accessToken: string
  accessTokenSecret: string
}

export function credsFromEnv(): AdsCreds | null {
  const e = process.env
  if (!e.X_ADS_CONSUMER_KEY || !e.X_ADS_CONSUMER_SECRET || !e.X_ADS_ACCESS_TOKEN || !e.X_ADS_ACCESS_TOKEN_SECRET) return null
  return {
    consumerKey: e.X_ADS_CONSUMER_KEY,
    consumerSecret: e.X_ADS_CONSUMER_SECRET,
    accessToken: e.X_ADS_ACCESS_TOKEN,
    accessTokenSecret: e.X_ADS_ACCESS_TOKEN_SECRET,
  }
}

export const accountIdFromEnv = (): string => process.env.X_ADS_ACCOUNT_ID ?? '18ce55x0rpo'

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

export function oauthHeader(
  creds: AdsCreds,
  method: string,
  url: string,
  params: Record<string, string>,
  fixed?: { nonce: string; timestamp: string },
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: fixed?.nonce ?? randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: fixed?.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  }
  const all = { ...params, ...oauth }
  const paramStr = Object.keys(all)
    .sort()
    .map((k) => `${enc(k)}=${enc(all[k] ?? "")}`)
    .join('&')
  const base = `${method.toUpperCase()}&${enc(url)}&${enc(paramStr)}`
  const key = `${enc(creds.consumerSecret)}&${enc(creds.accessTokenSecret)}`
  oauth.oauth_signature = createHmac('sha1', key).update(base).digest('base64')
  return 'OAuth ' + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k] ?? "")}"`).join(', ')
}

export async function adsGet<T = unknown>(creds: AdsCreds, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = `${API}${path}`
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(qs ? `${url}?${qs}` : url, { headers: { Authorization: oauthHeader(creds, 'GET', url, params) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Ads API ${res.status} ${path}: ${text.slice(0, 500)}`)
  return JSON.parse(text) as T
}

export async function adsPost<T = unknown>(creds: AdsCreds, path: string, params: Record<string, string>): Promise<T> {
  const url = `${API}${path}`
  const res = await fetch(`${url}?${new URLSearchParams(params)}`, { method: 'POST', headers: { Authorization: oauthHeader(creds, 'POST', url, params) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Ads API ${res.status} ${path}: ${text.slice(0, 500)}`)
  return JSON.parse(text) as T
}

// JSON-body POST (cards). OAuth 1.0a signs query params only; JSON bodies are not part of the base string.
export async function adsPostJson<T = unknown>(creds: AdsCreds, path: string, body: unknown): Promise<T> {
  const url = `${API}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: oauthHeader(creds, 'POST', url, {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Ads API ${res.status} ${path}: ${text.slice(0, 500)}`)
  return JSON.parse(text) as T
}

export async function adsPut<T = unknown>(creds: AdsCreds, path: string, params: Record<string, string>): Promise<T> {
  const url = `${API}${path}`
  const res = await fetch(`${url}?${new URLSearchParams(params)}`, { method: 'PUT', headers: { Authorization: oauthHeader(creds, 'PUT', url, params) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Ads API ${res.status} ${path}: ${text.slice(0, 500)}`)
  return JSON.parse(text) as T
}

export interface Campaign {
  id: string
  name: string
  entity_status: string
  currency?: string
}

export async function listCampaigns(creds: AdsCreds, accountId: string): Promise<Campaign[]> {
  const r = await adsGet<{ data: Campaign[] }>(creds, `/accounts/${accountId}/campaigns`, { with_deleted: 'false' })
  return r.data
}

export interface DailyStat {
  date: string // YYYY-MM-DD (account timezone)
  impressions: number
  clicks: number // link_clicks (Ads Manager "Link clicks")
  video_views: number // video_total_views
  spend_micro: number // billed_charge_local_micro
}

// Ads Manager URLs show decimal ids (42298216); the API uses base36 (p6lig).
export function toApiId(id: string | number): string {
  const s = String(id)
  return /^\d+$/.test(s) ? Number(s).toString(36) : s
}

// Daily stats for one campaign over [start, end] (inclusive, YYYY-MM-DD, account-local days).
// DAY granularity requires the window to start at midnight in the account timezone,
// and the API caps a window at 7 days, so longer ranges are fetched in 7-day chunks.
export async function campaignDailyStats(
  creds: AdsCreds,
  accountId: string,
  campaignId: string,
  start: string,
  end: string,
  tzOffset = '+09:00', // Asia/Tokyo (account 18ce55x0rpo)
): Promise<DailyStat[]> {
  return entityDailyStats(creds, accountId, 'CAMPAIGN', campaignId, start, end, tzOffset)
}

// Per-entity daily stats. Use PROMOTED_TWEET when several ads share one line item, so each
// deployment gets its own numbers instead of the campaign total.
export async function entityDailyStats(
  creds: AdsCreds,
  accountId: string,
  entity: 'CAMPAIGN' | 'LINE_ITEM' | 'PROMOTED_TWEET',
  entityId: string,
  start: string,
  end: string,
  tzOffset = '+09:00',
): Promise<DailyStat[]> {
  const DAY = 86400_000
  const t0 = new Date(start + 'T00:00:00Z').getTime()
  const t1 = new Date(end + 'T00:00:00Z').getTime()
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  const out: DailyStat[] = []
  for (let cs = t0; cs <= t1; cs += 7 * DAY) {
    const ce = Math.min(cs + 6 * DAY, t1) // inclusive chunk end
    const r = await adsGet<{
      data: Array<{ id: string; id_data: Array<{ metrics: Record<string, number[] | null> }> }>
    }>(creds, `/stats/accounts/${accountId}`, {
      entity,
      entity_ids: entity === 'CAMPAIGN' ? toApiId(entityId) : entityId,
      start_time: `${iso(cs)}T00:00:00${tzOffset}`,
      end_time: `${iso(ce + DAY)}T00:00:00${tzOffset}`,
      granularity: 'DAY',
      metric_groups: 'ENGAGEMENT,BILLING,VIDEO',
      placement: 'ALL_ON_TWITTER',
    })
    const m = r.data[0]?.id_data[0]?.metrics ?? {}
    const n = Math.round((ce - cs) / DAY) + 1
    for (let i = 0; i < n; i++) {
      out.push({
        date: iso(cs + i * DAY),
        impressions: m.impressions?.[i] ?? 0,
        clicks: m.link_clicks?.[i] ?? 0,
        video_views: m.video_total_views?.[i] ?? 0,
        spend_micro: m.billed_charge_local_micro?.[i] ?? 0,
      })
    }
  }
  return out
}

export async function setCampaignStatus(creds: AdsCreds, accountId: string, campaignId: string, status: 'ACTIVE' | 'PAUSED') {
  return adsPut(creds, `/accounts/${accountId}/campaigns/${campaignId}`, { entity_status: status })
}

export async function setLineItemStatus(creds: AdsCreds, accountId: string, lineItemId: string, status: 'ACTIVE' | 'PAUSED') {
  return adsPut(creds, `/accounts/${accountId}/line_items/${lineItemId}`, { entity_status: status })
}

export async function setLineItemDailyBudget(creds: AdsCreds, accountId: string, lineItemId: string, localMicro: number) {
  return adsPut(creds, `/accounts/${accountId}/line_items/${lineItemId}`, { daily_budget_amount_local_micro: String(localMicro) })
}

// PUT on promoted_tweets only accepts approval_status=APPEAL_REQUESTED; pausing is
// DELETE (the entity shows as "Paused" in ads.x.com). Re-activating means creating a
// new promoted_tweet for the same tweet_id.
export async function pausePromotedTweet(creds: AdsCreds, accountId: string, promotedTweetId: string) {
  const url = `${API}/accounts/${accountId}/promoted_tweets/${promotedTweetId}`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: oauthHeader(creds, 'DELETE', url, {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Ads API ${res.status} DELETE promoted_tweets/${promotedTweetId}: ${text.slice(0, 500)}`)
  return JSON.parse(text)
}

export interface PromotedTweet {
  id: string
  line_item_id: string
  tweet_id: string
  entity_status: string
  approval_status: string
}

export async function listPromotedTweets(creds: AdsCreds, accountId: string, lineItemId?: string): Promise<PromotedTweet[]> {
  const params: Record<string, string> = { with_deleted: 'false' }
  if (lineItemId) params.line_item_ids = lineItemId
  const r = await adsGet<{ data: PromotedTweet[] }>(creds, `/accounts/${accountId}/promoted_tweets`, params)
  return r.data
}

export async function fundingInstruments(creds: AdsCreds, accountId: string) {
  const r = await adsGet<{ data: Array<{ id: string; type: string; currency: string; able_to_fund: boolean; entity_status: string; reasons_not_able_to_fund?: string[] }> }>(
    creds,
    `/accounts/${accountId}/funding_instruments`,
  )
  return r.data
}
