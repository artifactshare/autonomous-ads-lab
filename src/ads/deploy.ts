// Deploy a creative to X via the Ads API and (optionally) pause the running ad.
// One ad = video (media_library) + VIDEO_WEBSITE card + nullcast tweet + promoted_tweet
// on the existing line item. Dry-run by default: without apply=true it stops after
// the card (no spend, nothing served). Every entity id is persisted in ad_assets so
// a partial run resumes instead of duplicating.
import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { uploadAmplifyVideo } from './media-upload.ts'
import {
  accountIdFromEnv,
  adsGet,
  adsPost,
  adsPostJson,
  credsFromEnv,
  listPromotedTweets,
  pausePromotedTweet,
  toApiId,
  type AdsCreds,
} from './x-ads-api.ts'

const LANDING = 'https://artifactshare.com'
const UTM = (creativeId: number) => `utm_source=x&utm_medium=paid&utm_campaign=exp-auto-${creativeId}`

interface Assets {
  creative_id: number
  media_key: string | null
  card_uri: string | null
  tweet_id: string | null
  promoted_tweet_id: string | null
  approval_status: string | null
}

export interface DeployResult {
  status: 'deployed' | 'dry-run' | 'skipped'
  notes: string[]
}

export async function deployCreative(
  db: Database.Database,
  creativeId: number,
  opts: { apply: boolean; replaces?: number; videoPath?: string; log?: (m: string) => void },
): Promise<DeployResult> {
  const log = opts.log ?? (() => {})
  const notes: string[] = []
  const creds = credsFromEnv()
  if (!creds) return { status: 'skipped', notes: ['ads-api: secrets not set'] }
  const account = accountIdFromEnv()

  const creative = db.prepare('select id, hook, message, cta from creatives where id = ?').get(creativeId) as
    | { id: number; hook: string; message: string; cta: string }
    | undefined
  if (!creative) throw new Error(`creative ${creativeId} not found`)
  const videoPath = opts.videoPath ?? join('data', 'creatives', String(creativeId), 'final.mp4')
  if (!existsSync(videoPath)) throw new Error(`video not found: ${videoPath}`)

  const running = db
    .prepare("select id, creative_id, campaign_id, ad_group_id, ad_id, targeting, budget_usd from deployments where status = 'active' order by id desc limit 1")
    .get() as { id: number; creative_id: number; campaign_id: string; ad_group_id: string | null; ad_id: string | null; targeting: string | null; budget_usd: number | null } | undefined
  if (!running) throw new Error('no active deployment to attach to (line item unknown)')

  // Line item: from the running deployment, else the campaign's single ACTIVE line item.
  let lineItemId = running.ad_group_id
  if (!lineItemId) {
    const li = await adsGet<{ data: Array<{ id: string; entity_status: string }> }>(creds, `/accounts/${account}/line_items`, {
      campaign_ids: toApiId(running.campaign_id),
      with_deleted: 'false',
    })
    const active = li.data.filter((x) => x.entity_status === 'ACTIVE')
    if (active.length !== 1) throw new Error(`expected 1 active line item, got ${active.length}`)
    lineItemId = active[0]!.id
  }

  db.prepare('insert or ignore into ad_assets (creative_id) values (?)').run(creativeId)
  const assets = () => db.prepare('select * from ad_assets where creative_id = ?').get(creativeId) as Assets
  const save = (col: keyof Assets, v: string) =>
    db.prepare(`update ad_assets set ${col} = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where creative_id = ?`).run(v, creativeId)

  // 1-2. video → media library
  if (!assets().media_key) {
    const key = await uploadAmplifyVideo(creds, videoPath, log)
    await adsPost(creds, `/accounts/${account}/media_library`, { media_key: key })
    save('media_key', key)
    notes.push(`uploaded video media_key=${key}`)
  } else notes.push(`reusing media_key=${assets().media_key}`)

  // 3. VIDEO_WEBSITE card (unified cards endpoint)
  if (!assets().card_uri) {
    const url = `${LANDING}/?${UTM(creativeId)}`
    const title = creative.cta.split(/ — | - /)[0]!.slice(0, 70)
    const card = await adsPostJson<{ data: { card_uri: string; id: string } }>(creds, `/accounts/${account}/cards`, {
      name: `creative-${creativeId}`,
      components: [
        { type: 'MEDIA', media_key: assets().media_key },
        { type: 'DETAILS', title, destination: { type: 'WEBSITE', url } },
      ],
    })
    save('card_uri', card.data.card_uri)
    notes.push(`card ${card.data.card_uri} → ${url}`)
  } else notes.push(`reusing card ${assets().card_uri}`)

  if (!opts.apply) {
    notes.push('dry-run: stopped before tweet/promoted_tweet (nothing served, no spend)')
    return { status: 'dry-run', notes }
  }

  // 4. nullcast tweet
  const users = await adsGet<{ data: Array<{ user_id: string; promotable_user_type: string }> }>(creds, `/accounts/${account}/promotable_users`)
  const asUser = users.data.find((u) => u.promotable_user_type === 'FULL')?.user_id
  if (!asUser) throw new Error('no FULL promotable user')
  if (!assets().tweet_id) {
    const text = `${creative.hook} ${creative.message}`.slice(0, 280)
    const tw = await adsPost<{ data: { id_str: string } }>(creds, `/accounts/${account}/tweet`, {
      as_user_id: asUser,
      text,
      card_uri: assets().card_uri!,
      nullcast: 'true',
      trim_user: 'true',
      name: `creative-${creativeId}`,
    })
    save('tweet_id', tw.data.id_str)
    notes.push(`tweet ${tw.data.id_str}`)
  }

  // 5. promoted tweet on the line item
  if (!assets().promoted_tweet_id) {
    const pt = await adsPost<{ data: Array<{ id: string; approval_status: string }> }>(creds, `/accounts/${account}/promoted_tweets`, {
      line_item_id: lineItemId,
      tweet_ids: assets().tweet_id!,
    })
    save('promoted_tweet_id', pt.data[0]!.id)
    save('approval_status', pt.data[0]!.approval_status)
    notes.push(`promoted_tweet ${pt.data[0]!.id} (${pt.data[0]!.approval_status})`)
  }

  // 6. pause the replaced ad (every other ACTIVE promoted tweet on this line item)
  const replaces = opts.replaces ?? running.creative_id
  const mine = assets().promoted_tweet_id
  for (const p of await listPromotedTweets(creds, account, lineItemId)) {
    if (p.id !== mine && p.entity_status === 'ACTIVE') {
      await pausePromotedTweet(creds, account, p.id)
      notes.push(`paused promoted_tweet ${p.id} (tweet ${p.tweet_id})`)
    }
  }

  // 7. record
  const now = new Date().toISOString()
  db.transaction(() => {
    db.prepare("update deployments set status = 'stopped', stopped_at = ? where status = 'active' and creative_id = ?").run(now, replaces)
    db.prepare(
      `insert into deployments (creative_id, platform, campaign_id, ad_group_id, ad_id, status, targeting, post_url, budget_usd, started_at)
       values (?, 'x', ?, ?, ?, 'active', ?, ?, ?, ?)`,
    ).run(
      creativeId,
      running.campaign_id,
      lineItemId,
      mine,
      running.targeting ? running.targeting.replace(/"deployed_via":"[^"]*"/, '"deployed_via":"x-ads-api"').replace(/utm_campaign=[^"&]*/, `utm_campaign=exp-auto-${creativeId}`) : null,
      `https://x.com/artifactshare_/status/${assets().tweet_id}`,
      running.budget_usd,
      now,
    )
  })()
  notes.push(`deployment recorded: creative ${creativeId} active, creative ${replaces} stopped`)
  return { status: 'deployed', notes }
}

// Daily: refresh approval_status for the active deployment's promoted tweet.
export async function refreshApproval(db: Database.Database): Promise<string[]> {
  const creds = credsFromEnv()
  if (!creds) return []
  const rows = db.prepare("select creative_id, promoted_tweet_id from ad_assets where promoted_tweet_id is not null").all() as Array<{ creative_id: number; promoted_tweet_id: string }>
  if (!rows.length) return []
  const all = await listPromotedTweets(creds, accountIdFromEnv())
  const out: string[] = []
  for (const r of rows) {
    const p = all.find((x) => x.id === r.promoted_tweet_id)
    if (!p) continue
    db.prepare("update ad_assets set approval_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where creative_id = ?").run(p.approval_status, r.creative_id)
    if (p.entity_status === 'ACTIVE') out.push(`ad approval: creative ${r.creative_id} ${p.approval_status}`)
  }
  return out
}
