import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { appendJournal } from '../src/reporting/journal.ts'

/**
 * daily, weekly and the agents each append a section to the same JST-dated
 * journal file, usually from checkouts taken before the others merged. Without
 * a union merge driver every such pair conflicts, the auto PR goes DIRTY, and
 * the watchdog closes it -- discarding that run's work and budget rows (#133).
 *
 * These tests run a real `git merge` against the repo's own .gitattributes, so
 * they fail if that file stops covering journal/*.md.
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

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'journal-merge-'))
  git('init', '-q', '-b', 'main', '.')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  // The behaviour under test lives in the repo's real .gitattributes.
  copyFileSync(join(import.meta.dirname, '..', '.gitattributes'), join(repo, '.gitattributes'))
  mkdirSync(join(repo, 'journal'), { recursive: true })
  git('add', '-A')
  git('commit', '-qm', 'base')
})

/** Commit a journal entry on `branch`, branched off `from`. */
function commitEntry(branch: string, from: string, e: Parameters<typeof appendJournal>[0], at: Date) {
  git('checkout', '-q', from)
  git('checkout', '-qb', branch)
  appendJournal(e, at, join(repo, 'journal'))
  git('add', '-A')
  git('commit', '-qm', branch)
}

describe('journal union merge', () => {
  it('keeps both sections when daily and weekly both create the day file', () => {
    // add/add: neither checkout had journal/2026-09-14.md yet. This is the
    // exact shape that made PR #130 DIRTY.
    commitEntry('weekly', 'main', entry('weekly-learning (automated)', 'weekly stuff'), WEEKLY)
    commitEntry('daily', 'main', entry('daily-ops (automated)', 'daily stuff'), DAILY)
    git('merge', '--no-edit', 'weekly')

    const merged = readFileSync(join(repo, 'journal', '2026-09-14.md'), 'utf8')
    expect(merged).toContain('## 09:07 JST — daily-ops (automated)')
    expect(merged).toContain('## 09:08 JST — weekly-learning (automated)')
    expect(merged).toContain('- daily stuff')
    expect(merged).toContain('- weekly stuff')
    expect(merged).not.toContain('<<<<<<<')
  })

  it('keeps both sections when the day file already exists', () => {
    // content conflict: both sides append after a shared earlier entry.
    commitEntry('seed', 'main', entry('metrics (automated)', 'earlier stuff'), DAILY)
    git('checkout', '-q', 'main')
    git('merge', '--no-edit', 'seed')

    commitEntry('weekly', 'main', entry('weekly-learning (automated)', 'weekly stuff'), WEEKLY)
    commitEntry('daily', 'main', entry('strategist (automated)', 'daily stuff'), DAILY)
    git('merge', '--no-edit', 'weekly')

    const merged = readFileSync(join(repo, 'journal', '2026-09-14.md'), 'utf8')
    expect(merged).toContain('- earlier stuff')
    expect(merged).toContain('- daily stuff')
    expect(merged).toContain('- weekly stuff')
    expect(merged).not.toContain('<<<<<<<')
  })
})
