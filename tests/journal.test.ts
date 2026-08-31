import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { appendJournal } from '../src/reporting/journal.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'journal-test-'))
})

const entry = { actor: 'daily-ops (automated)', done: ['a'], spent: [], learnings: [], next: [] }

describe('appendJournal', () => {
  it('files an entry under the JST date, not the UTC date', () => {
    // 22:00 UTC is the daily cron; in JST that is 07:00 the NEXT day.
    const path = appendJournal(entry, new Date('2026-08-30T22:00:00Z'), dir)
    expect(path).toBe(join(dir, '2026-08-31.md'))
    expect(readdirSync(dir)).toEqual(['2026-08-31.md'])
    expect(readFileSync(path, 'utf8')).toContain('## 07:00 JST — daily-ops (automated)')
  })

  it('keeps a late-evening JST run on the same JST day', () => {
    // 14:59 UTC = 23:59 JST same day; 15:00 UTC rolls over to the next.
    expect(appendJournal(entry, new Date('2026-08-31T14:59:00Z'), dir)).toBe(
      join(dir, '2026-08-31.md'),
    )
    expect(appendJournal(entry, new Date('2026-08-31T15:00:00Z'), dir)).toBe(
      join(dir, '2026-09-01.md'),
    )
  })

  it('creates the file with a heading once and appends subsequent entries', () => {
    const path = appendJournal(entry, new Date('2026-08-31T01:00:00Z'), dir)
    appendJournal({ ...entry, actor: 'harness-agent' }, new Date('2026-08-31T02:00:00Z'), dir)
    const text = readFileSync(path, 'utf8')
    expect(text.match(/^# 2026-08-31$/gm)).toHaveLength(1)
    expect(text).toContain('## 10:00 JST — daily-ops (automated)')
    expect(text).toContain('## 11:00 JST — harness-agent')
  })

  it('omits sections that have no items', () => {
    const path = appendJournal(
      { actor: 'x', done: ['d'], spent: [], learnings: ['l'], next: [] },
      new Date('2026-08-31T01:00:00Z'),
      dir,
    )
    const text = readFileSync(path, 'utf8')
    expect(text).toContain('### Done')
    expect(text).toContain('### Learnings')
    expect(text).not.toContain('### Spent')
    expect(text).not.toContain('### Next')
  })
})
