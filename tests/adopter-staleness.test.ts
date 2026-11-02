import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adopterSignalsAgeDays, adopterSignalsStalenessNote, STALE_AFTER_DAYS } from '../src/ops/adopter-staleness.ts'

const NOW = new Date('2026-11-02T03:00:00.000Z')

function signalsFile(generatedAt: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'adopter-'))
  const path = join(dir, 'adopter-signals.json')
  writeFileSync(path, JSON.stringify(generatedAt === undefined ? { workspaces: [] } : { generated_at: generatedAt }))
  return path
}

describe('adopterSignalsAgeDays', () => {
  it('computes age from generated_at', () => {
    const path = signalsFile('2026-10-12T01:27:10.054Z')
    expect(adopterSignalsAgeDays(path, NOW)).toBeCloseTo(21.06, 1)
  })

  it('returns null for a missing file, missing field, or unparseable date', () => {
    expect(adopterSignalsAgeDays('/nonexistent/adopter-signals.json', NOW)).toBeNull()
    expect(adopterSignalsAgeDays(signalsFile(undefined), NOW)).toBeNull()
    expect(adopterSignalsAgeDays(signalsFile('not-a-date'), NOW)).toBeNull()
  })
})

describe('adopterSignalsStalenessNote', () => {
  it('is silent while the file is fresh', () => {
    const path = signalsFile('2026-10-28T01:30:00.000Z') // 5 days old
    expect(adopterSignalsStalenessNote({ path, now: NOW, env: {} })).toBeNull()
  })

  it('notes a stale file without touching gh when GH_TOKEN is absent (weekly.yml today)', () => {
    const path = signalsFile('2026-10-12T01:27:10.054Z')
    const calls: string[][] = []
    const note = adopterSignalsStalenessNote({ path, now: NOW, env: {}, gh: (a) => (calls.push(a), '[]') })
    expect(note).toContain('STALE')
    expect(note).toContain('21 days old')
    expect(calls).toEqual([])
  })

  it('opens a needs-human issue when stale, token set, and nothing open tracks it', () => {
    const path = signalsFile('2026-10-12T01:27:10.054Z')
    const calls: string[][] = []
    const note = adopterSignalsStalenessNote({
      path,
      now: NOW,
      env: { GH_TOKEN: 't' },
      gh: (a) => {
        calls.push(a)
        return a[1] === 'list' ? '[]' : ''
      },
    })
    expect(note).toContain('needs-human issue opened')
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('create')
    expect(calls[1]).toContain('needs-human')
  })

  it('suppresses the issue when an open needs-human issue already mentions adopter-signals (#243)', () => {
    const path = signalsFile('2026-10-12T01:27:10.054Z')
    const calls: string[][] = []
    const note = adopterSignalsStalenessNote({
      path,
      now: NOW,
      env: { GH_TOKEN: 't' },
      gh: (a) => (calls.push(a), '[{"number":243}]'),
    })
    expect(note).toContain('already tracks it')
    expect(calls).toHaveLength(1)
  })

  it('still reports when the file is unreadable', () => {
    const note = adopterSignalsStalenessNote({ path: '/nonexistent/x.json', now: NOW, env: {} })
    expect(note).toContain('missing or unreadable')
  })

  it('exposes the pre-registered threshold', () => {
    expect(STALE_AFTER_DAYS).toBe(8)
  })
})
