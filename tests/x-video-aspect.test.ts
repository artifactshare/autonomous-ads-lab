import { describe, it, expect } from 'vitest'
import { isXAcceptedAspect } from '../src/ads/deploy.ts'

describe('isXAcceptedAspect (X Ads cards media constraint)', () => {
  it('accepts 4:5, 1:1, 16:9, 9:16, 2:3, 1.91:1', () => {
    for (const [w, h] of [[1080, 1350], [1080, 1080], [1920, 1080], [1080, 1920], [1000, 1500], [1910, 1000]]) expect(isXAcceptedAspect(w!, h!)).toBe(true)
  })
  it('rejects 3:4 (INVALID_MEDIA on 2026-09-14)', () => {
    expect(isXAcceptedAspect(1080, 1440)).toBe(false)
  })
})
