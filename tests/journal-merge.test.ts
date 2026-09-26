import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { appendJournal, readJournalDay } from '../src/reporting/journal.ts'

/**
 * daily, weekly and the agents each write a journal entry from their own
 * auto-merge PR, usually from checkouts taken before the others merged.
 * GitHub's server-side merge ignores .gitattributes merge drivers, so the old
 * append-to-one-day-file layout conflicted on GitHub even with merge=union
 * (#168 and #177 stalled five days). Entries now live in separate files, so
 * these tests merge with plain git and NO attributes: if two same-day entries
 * ever share a path again, they fail.
 */
let repo: string
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })

const entry = (actor: string, done: string) => ({
  actor,
  done: [done],
  spent: [],
  learnings: [],
  next: [],
})

const DAILY = new Date('2026-09-14T00:07:00Z') // 09:07 JST
const WEEKLY = new Date('2026-09-14T00:08:00Z') // 09:08 JST, same JST day
const journal = () => join(repo, 'journal')

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'journal-merge-'))
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  mkdirSync(journal(), { recursive: true })
  writeFileSync(join(journal(), '.keep'), '')
  git('add', '-A')
  git('commit', '-qm', 'base')
})

/** Commit a journal entry on `branch`, branched off `from`. */
function commitEntry(branch: string, from: string, e: Parameters<typeof appendJournal>[0], at: Date) {
  git('checkout', '-q', from)
  git('checkout', '-qb', branch)
  appendJournal(e, at, journal())
  git('add', '-A')
  git('commit', '-qm', branch)
}

describe('journal entries from parallel PRs', () => {
  it('merge cleanly without any merge driver when both runs start the day', () => {
    commitEntry('weekly', 'main', entry('weekly-learning (automated)', 'weekly stuff'), WEEKLY)
    commitEntry('daily', 'main', entry('daily-ops (automated)', 'daily stuff'), DAILY)
    git('merge', '--no-edit', 'weekly')

    const day = readJournalDay('2026-09-14', journal())
    expect(day).toContain('## 09:07 JST — daily-ops (automated)')
    expect(day).toContain('## 09:08 JST — weekly-learning (automated)')
    expect(day).toContain('- daily stuff')
    expect(day).toContain('- weekly stuff')
  })

  it('merge cleanly when the day already has entries on main', () => {
    commitEntry('seed', 'main', entry('metrics (automated)', 'earlier stuff'), DAILY)
    git('checkout', '-q', 'main')
    git('merge', '--no-edit', 'seed')

    commitEntry('weekly', 'main', entry('weekly-learning (automated)', 'weekly stuff'), WEEKLY)
    commitEntry('strategist', 'main', entry('strategist (automated)', 'strategy stuff'), WEEKLY)
    git('merge', '--no-edit', 'weekly')

    const day = readJournalDay('2026-09-14', journal())
    for (const s of ['- earlier stuff', '- weekly stuff', '- strategy stuff']) expect(day).toContain(s)
  })
})
