import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertXVideoAspect } from '../src/ads/deploy.ts'

const mk = (w: number, h: number) => {
  const p = join(mkdtempSync(join(tmpdir(), 'aspect-')), `${w}x${h}.mp4`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}:d=0.2`, '-pix_fmt', 'yuv420p', p])
  return p
}

describe('assertXVideoAspect', () => {
  it('accepts 4:5 and 16:9', () => {
    expect(() => assertXVideoAspect(mk(1080, 1350))).not.toThrow()
    expect(() => assertXVideoAspect(mk(1920, 1080))).not.toThrow()
  })
  it('rejects 3:4 (X Ads INVALID_MEDIA)', () => {
    expect(() => assertXVideoAspect(mk(1080, 1440))).toThrow(/4:5/)
  })
})
