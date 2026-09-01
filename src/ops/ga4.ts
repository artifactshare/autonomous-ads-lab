// GA4 Data API sync: pull per-campaign sessions and sign_ups for x_ads UTM
// traffic and upsert them into `conversions`. Dormant unless GA4_PROPERTY_ID
// and GA4_SA_KEY_B64 (base64 of a read-only service-account key JSON) are set.
// No SDK dependency: service-account JWT + REST runReport via fetch.
import { createSign } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Logger } from '../logging/logger.ts'

type SaKey = { client_email: string; private_key: string }

async function accessToken(key: SaKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  if (!res.ok) throw new Error(`GA4 token exchange failed: ${res.status} ${await res.text()}`)
  return ((await res.json()) as { access_token: string }).access_token
}

export async function syncGa4Conversions(db: Database.Database, log: Logger): Promise<string[]> {
  const propertyId = process.env.GA4_PROPERTY_ID
  const keyB64 = process.env.GA4_SA_KEY_B64
  if (!propertyId || !keyB64) {
    log.warn('ga4_skipped', { reason: 'GA4_PROPERTY_ID or GA4_SA_KEY_B64 not set' })
    return ['ga4: skipped (secrets not set)']
  }
  const key = JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8')) as SaKey
  const token = await accessToken(key)
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }, { name: 'sessionCampaignName' }],
        metrics: [{ name: 'sessions' }, { name: 'keyEvents:sign_up' }],
        dimensionFilter: {
          filter: { fieldName: 'sessionSource', stringFilter: { value: 'x' } },
        },
        limit: 1000,
      }),
    },
  )
  if (!res.ok) throw new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as {
    rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]
  }
  const upsert = db.prepare(
    `insert into conversions (date, campaign, sessions, sign_ups)
     values (?, ?, ?, ?)
     on conflict(date, campaign) do update set
       sessions = excluded.sessions, sign_ups = excluded.sign_ups,
       synced_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
  let sessions = 0
  let signUps = 0
  for (const r of body.rows ?? []) {
    const d = r.dimensionValues[0]?.value ?? ''
    const campaign = r.dimensionValues[1]?.value ?? '(not set)'
    if (d.length !== 8) continue
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    const s = Number(r.metricValues[0]?.value ?? 0)
    const c = Number(r.metricValues[1]?.value ?? 0)
    upsert.run(date, campaign, s, c)
    sessions += s
    signUps += c
  }
  log.info('ga4_synced', { rows: body.rows?.length ?? 0, sessions, signUps })
  return [`ga4: ${body.rows?.length ?? 0} rows (${sessions} sessions, ${signUps} sign_ups)`]
}
