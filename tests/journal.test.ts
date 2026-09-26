import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { appendJournal, journalDays, newJournalFile, readJournalDay } from '../src/reporting/journal.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'journal-test-'))
})

const entry = { actor: 'daily-ops (automated)', done: ['a'], spent: [], learnings: [], next: [] }

describe('appendJournal', () => {
  it('files an entry under the JST date, not the UTC date', () => {
    // 22:00 UTC is the daily cron; in JST that is 07:00 the NEXT day.
    const path = appendJournal(entry, new Date('2026-08-30T22:00:00Z'), dir)
    expect(path).toBe(join(dir, '2026-08-31', '070000-daily-ops.md'))
    expect(readFileSync(path, 'utf8')).toMatch(/^## 07:00 JST — daily-ops \(automated\)\n/)
  })

  it('keeps a late-evening JST run on the same JST day', () => {
    // 14:59 UTC = 23:59 JST same day; 15:00 UTC rolls over to the next.
    expect(appendJournal(entry, new Date('2026-08-31T14:59:00Z'), dir)).toContain(join(dir, '2026-08-31'))
    expect(appendJournal(entry, new Date('2026-08-31T15:00:00Z'), dir)).toContain(join(dir, '2026-09-01'))
  })

  it('gives every entry its own file, so parallel PRs never touch the same path', () => {
    const at = new Date('2026-08-31T01:00:00Z')
    const a = appendJournal(entry, at, dir)
    const b = appendJournal(entry, at, dir) // same actor, same second
    const c = appendJournal({ ...entry, actor: 'harness-agent' }, at, dir)
    expect(new Set([a, b, c]).size).toBe(3)
    expect(readdirSync(join(dir, '2026-08-31')).sort()).toEqual([
      '100000-daily-ops-2.md',
      '100000-daily-ops.md',
      '100000-harness-agent.md',
    ])
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

describe('reading a day back', () => {
  it('joins the legacy day file and the entry files in time order', () => {
    writeFileSync(join(dir, '2026-09-26.md'), '# 2026-09-26\n\n## 09:35 JST — daily-ops (automated)\n\n- old\n')
    appendJournal({ ...entry, actor: 'strategist (automated)' }, new Date('2026-09-26T05:00:00Z'), dir)
    newJournalFile('manual', new Date('2026-09-26T03:00:00Z'), dir)
    const text = readJournalDay('2026-09-26', dir)
    expect(text.match(/^# 2026-09-26$/gm)).toHaveLength(1)
    const order = ['09:35 JST — daily-ops', '12:00 JST — manual', '14:00 JST — strategist'].map((h) => text.indexOf(h))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((x, y) => x - y))
  })

  it('lists days from both layouts once each', () => {
    writeFileSync(join(dir, '2026-09-25.md'), '# 2026-09-25\n')
    writeFileSync(join(dir, '2026-09-26.md'), '# 2026-09-26\n')
    mkdirSync(join(dir, '2026-09-26'))
    mkdirSync(join(dir, '2026-09-27'))
    expect(journalDays(dir)).toEqual(['2026-09-25', '2026-09-26', '2026-09-27'])
  })
})
