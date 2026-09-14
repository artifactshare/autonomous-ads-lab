import { describe, expect, it } from 'vitest'
import { oauthHeader } from '../src/ads/x-ads-api.ts'

// Worked example from X's "Creating a signature" developer doc.
describe('oauthHeader', () => {
  it('reproduces the documented HMAC-SHA1 signature', () => {
    const header = oauthHeader(
      {
        consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
        consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
        accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
        accessTokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
      },
      'POST',
      'https://api.twitter.com/1.1/statuses/update.json',
      { status: 'Hello Ladies + Gentlemen, a signed OAuth request!', include_entities: 'true' },
      { nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: '1318622958' },
    )
    expect(header).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"')
    expect(header.startsWith('OAuth ')).toBe(true)
  })
})

describe('toApiId', () => {
  it('maps Ads Manager decimal ids to API base36 ids', async () => {
    const { toApiId } = await import('../src/ads/x-ads-api.ts')
    expect(toApiId('42298216')).toBe('p6lig')
    expect(toApiId('p6lig')).toBe('p6lig')
  })
})

describe('campaignDailyStats', () => {
  it('splits ranges longer than 7 days into 7-day windows and stitches days in order', async () => {
    const { campaignDailyStats } = await import('../src/ads/x-ads-api.ts')
    const calls: string[] = []
    const orig = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      const u = new URL(url)
      calls.push(`${u.searchParams.get('start_time')}..${u.searchParams.get('end_time')}`)
      const days = Math.round((Date.parse(u.searchParams.get('end_time')!) - Date.parse(u.searchParams.get('start_time')!)) / 86400_000)
      const seq = Array.from({ length: days }, (_, i) => calls.length * 100 + i)
      return new Response(JSON.stringify({ data: [{ id: 'x', id_data: [{ metrics: { impressions: seq, link_clicks: seq, video_total_views: seq, billed_charge_local_micro: seq } }] }] }))
    }) as typeof fetch
    try {
      const creds = { consumerKey: 'k', consumerSecret: 's', accessToken: 't', accessTokenSecret: 'ts' }
      const rows = await campaignDailyStats(creds, 'acct', '42298216', '2026-08-29', '2026-09-13')
      expect(calls).toEqual([
        '2026-08-29T00:00:00+09:00..2026-09-05T00:00:00+09:00',
        '2026-09-05T00:00:00+09:00..2026-09-12T00:00:00+09:00',
        '2026-09-12T00:00:00+09:00..2026-09-14T00:00:00+09:00',
      ])
      expect(rows.map((r) => r.date)).toEqual([
        '2026-08-29','2026-08-30','2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04',
        '2026-09-05','2026-09-06','2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11',
        '2026-09-12','2026-09-13',
      ])
      expect(rows[7]!.impressions).toBe(200) // first day of second chunk
    } finally {
      globalThis.fetch = orig
    }
  })
})
