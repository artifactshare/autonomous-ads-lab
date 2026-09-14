import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eventFiles } from '../src/db/events.ts'

describe('eventFiles', () => {
  it('replays in file-name order; millisecond names keep same-minute runs in real order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'events-'))
    for (const f of ['2026-09-14T101857850-26325e8f.jsonl', '2026-09-14T101802285-67c03207.jsonl', '2026-09-14T1015-beec34d5.jsonl', '2026-09-01T0718-fbafb90d.jsonl']) writeFileSync(join(dir, f), '{"t":"x","s":"x","p":[]}\n')
    expect(eventFiles(dir)).toEqual(['2026-09-01T0718-fbafb90d.jsonl', '2026-09-14T1015-beec34d5.jsonl', '2026-09-14T101802285-67c03207.jsonl', '2026-09-14T101857850-26325e8f.jsonl'])
  })
})
