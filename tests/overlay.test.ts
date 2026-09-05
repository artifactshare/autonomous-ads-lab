import { describe, expect, it, vi } from 'vitest'
import { assertOverlayToolchain, overlayFilters } from '../src/creative/overlay.ts'

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

describe('overlayFilters', () => {
  it('loads copy from text files instead of interpolating punctuation into the filter graph', () => {
    const filters = overlayFilters('/font.ttf', {
      hook: '/tmp/hook.txt', brand: '/tmp/brand.txt', cta: '/tmp/cta.txt',
    }, 8)
    expect(filters).toContain("textfile='/tmp/hook.txt'")
    expect(filters).not.toContain(":text='")
  })
})
