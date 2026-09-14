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
