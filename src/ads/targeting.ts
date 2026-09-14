// Audience targeting on the running line item. The strategist's "who" becomes a
// targeting change here: follower look-alikes of named X accounts instead of
// broad keywords. Handles resolve to user ids via the X API v2 (same OAuth1 creds).
import type Database from 'better-sqlite3'
import { accountIdFromEnv, adsGet, adsPost, credsFromEnv, oauthHeader, type AdsCreds } from './x-ads-api.ts'

export interface TargetingCriterion {
  id: string
  line_item_id: string
  targeting_type: string
  targeting_value: string
  name?: string
}

function lineItem(db: Database.Database): string {
  const d = db.prepare("select ad_group_id from deployments where status = 'active' order by id desc limit 1").get() as { ad_group_id: string | null } | undefined
  if (!d?.ad_group_id) throw new Error('active deployment has no ad_group_id')
  return d.ad_group_id
}

// A numeric id is used as-is. Handle lookup uses the X API v2 (pay-per-use credits on
// the developer account; a 402 means top up at console.x.com) and falls back to v1.1.
export async function userIdByHandle(creds: AdsCreds, handle: string): Promise<string> {
  const h = handle.replace(/^@/, '')
  if (/^\d+$/.test(h)) return h
  const v2 = `https://api.x.com/2/users/by/username/${h}`
  let res = await fetch(v2, { headers: { Authorization: oauthHeader(creds, 'GET', v2, {}) } })
  let text = await res.text()
  if (res.ok) return (JSON.parse(text) as { data: { id: string } }).data.id
  const v1 = 'https://api.x.com/1.1/users/show.json'
  res = await fetch(`${v1}?screen_name=${h}`, { headers: { Authorization: oauthHeader(creds, 'GET', v1, { screen_name: h }) } })
  text = await res.text()
  if (res.ok) return (JSON.parse(text) as { id_str: string }).id_str
  throw new Error(`X API ${res.status} user lookup for @${h}: ${text.slice(0, 200)} — pass the numeric user id instead, or add API credits at console.x.com`)
}

export async function listTargeting(db: Database.Database): Promise<TargetingCriterion[]> {
  const creds = credsFromEnv()
  if (!creds) throw new Error('X_ADS_* secrets not set')
  const r = await adsGet<{ data: TargetingCriterion[] }>(creds, `/accounts/${accountIdFromEnv()}/targeting_criteria`, { line_item_ids: lineItem(db) })
  return r.data
}

// SIMILAR_TO_FOLLOWERS_OF_USER = look-alikes of the handle's followers; FOLLOWERS_OF_USER = the followers themselves.
export async function addFollowerTargeting(db: Database.Database, handle: string, similar = true): Promise<TargetingCriterion> {
  const creds = credsFromEnv()
  if (!creds) throw new Error('X_ADS_* secrets not set')
  const userId = await userIdByHandle(creds, handle)
  const r = await adsPost<{ data: TargetingCriterion }>(creds, `/accounts/${accountIdFromEnv()}/targeting_criteria`, {
    line_item_id: lineItem(db),
    targeting_type: similar ? 'SIMILAR_TO_FOLLOWERS_OF_USER' : 'FOLLOWERS_OF_USER',
    targeting_value: userId,
  })
  return r.data
}

export async function removeTargeting(db: Database.Database, criterionId: string): Promise<void> {
  const creds = credsFromEnv()
  if (!creds) throw new Error('X_ADS_* secrets not set')
  const url = `https://ads-api.x.com/12/accounts/${accountIdFromEnv()}/targeting_criteria/${criterionId}`
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: oauthHeader(creds, 'DELETE', url, {}) } })
  if (!res.ok) throw new Error(`Ads API ${res.status} DELETE targeting_criteria/${criterionId}: ${(await res.text()).slice(0, 300)}`)
  void db
}
