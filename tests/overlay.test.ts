import { describe, expect, it, vi } from 'vitest'
import { assertOverlayToolchain } from '../src/creative/overlay.ts'

describe('assertOverlayToolchain', () => {
  it('checks ffmpeg and returns an available drawtext font', () => {
    const run = vi.fn()
    const font = assertOverlayToolchain(run, () => true)
    expect(font).toBe('/System/Library/Fonts/Helvetica.ttc')
    expect(run).toHaveBeenCalledWith('ffmpeg', ['-version'])
  })

  it('turns a missing ffmpeg binary into a preflight error', () => {
    expect(() => assertOverlayToolchain(() => { throw new Error('ENOENT') }, () => true))
      .toThrow('ffmpeg is required before paid creative generation')
  })
})
