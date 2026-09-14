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
// DAY granularity requires the window to start at midnight in the account timezone.
export async function campaignDailyStats(
  creds: AdsCreds,
  accountId: string,
  campaignId: string,
  start: string,
  end: string,
  tzOffset = '+09:00', // Asia/Tokyo (account 18ce55x0rpo)
): Promise<DailyStat[]> {
  const endExclusive = new Date(new Date(end + 'T00:00:00Z').getTime() + 86400_000).toISOString().slice(0, 10)
  const r = await adsGet<{
    data: Array<{ id: string; id_data: Array<{ metrics: Record<string, number[] | null> }> }>
  }>(creds, `/stats/accounts/${accountId}`, {
    entity: 'CAMPAIGN',
    entity_ids: toApiId(campaignId),
    start_time: `${start}T00:00:00${tzOffset}`,
    end_time: `${endExclusive}T00:00:00${tzOffset}`,
    granularity: 'DAY',
    metric_groups: 'ENGAGEMENT,BILLING,VIDEO',
    placement: 'ALL_ON_TWITTER',
  })
  const m = r.data[0]?.id_data[0]?.metrics ?? {}
  const n = m.impressions?.length ?? 0
  const out: DailyStat[] = []
  for (let i = 0; i < n; i++) {
    const date = new Date(new Date(start + 'T00:00:00Z').getTime() + i * 86400_000).toISOString().slice(0, 10)
    out.push({
      date,
      impressions: m.impressions?.[i] ?? 0,
      clicks: m.link_clicks?.[i] ?? 0,
      video_views: m.video_total_views?.[i] ?? 0,
      spend_micro: m.billed_charge_local_micro?.[i] ?? 0,
    })
  }
  return out
}

export async function setCampaignStatus(creds: AdsCreds, accountId: string, campaignId: string, status: 'ACTIVE' | 'PAUSED') {
  return adsPut(creds, `/accounts/${accountId}/campaigns/${campaignId}`, { entity_status: status })
}
