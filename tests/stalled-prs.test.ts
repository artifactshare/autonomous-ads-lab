import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Logger } from '../src/logging/logger.ts'
import {
  SALVAGE_MARKER,
  checkStalledPrs,
  describeStalled,
  recoverStalledPrs,
  retryWorkflowFor,
  salvageBranch,
  selectRecoverable,
  selectStalled,
} from '../src/ops/stalled-prs.ts'
import type { PrSummary } from '../src/ops/stalled-prs.ts'

const NOW = new Date('2026-08-31T12:00:00Z')

function pr(over: Partial<PrSummary> = {}): PrSummary {
  return {
    number: 1,
    title: 'Daily Ops: experience db + journal update',
    createdAt: '2026-08-31T00:00:00Z', // 12h old
    headRefName: 'auto/Daily-Ops-20260831-000000',
    mergeStateStatus: 'DIRTY',
    ...over,
  }
}

const numbers = (prs: PrSummary[]) => selectStalled(prs, NOW).map((p) => p.number)

describe('selectStalled', () => {
  it('flags the states auto-merge cannot recover from', () => {
    const prs = ['DIRTY', 'BLOCKED', 'UNKNOWN', 'BEHIND'].map((s, i) =>
      pr({ number: i + 1, mergeStateStatus: s }),
    )
    expect(numbers(prs)).toEqual([1, 2, 3, 4])
  })

  it('ignores PRs that are still on track', () => {
    expect(
      numbers([pr({ number: 1, mergeStateStatus: 'CLEAN' }), pr({ number: 2, mergeStateStatus: 'HAS_HOOKS' })]),
    ).toEqual([])
  })

  it('gives a fresh PR a grace period before calling it stalled', () => {
    // A PR opened minutes ago legitimately reports UNKNOWN while checks queue.
    expect(numbers([pr({ createdAt: '2026-08-31T11:30:00Z', mergeStateStatus: 'UNKNOWN' })])).toEqual([])
    expect(numbers([pr({ createdAt: '2026-08-31T09:00:00Z', mergeStateStatus: 'UNKNOWN' })])).toEqual([1])
  })

  it('only watches branches this project automates', () => {
    const prs = [
      pr({ number: 1, headRefName: 'auto/Weekly-Learning-x' }),
      pr({ number: 2, headRefName: 'fix/journal-jst' }),
      pr({ number: 3, headRefName: 'improve/persist-run-logs' }),
      pr({ number: 4, headRefName: 'my-human-branch' }),
    ]
    expect(numbers(prs)).toEqual([1, 2, 3])
  })

  // Regression: PR #106 sat BLOCKED and unreported because the strategist
  // opened it from `strategist/` while its prompt prescribes `improve/`.
  it('watches bot-authored PRs on branches outside the prefix allowlist', () => {
    const prs = [
      pr({
        number: 106,
        headRefName: 'strategist/2026-09-07-weekly-review',
        mergeStateStatus: 'BLOCKED',
        author: { login: 'app/github-actions', is_bot: true },
      }),
      pr({ number: 2, headRefName: 'feat/ad-reaction-analysis', author: { login: 'github-actions[bot]' } }),
    ]
    expect(numbers(prs)).toEqual([106, 2])
  })

  it('still ignores a human PR on a branch the agents do not use', () => {
    expect(numbers([pr({ headRefName: 'coji-experiment', author: { login: 'coji', is_bot: false } })])).toEqual([])
  })
})

describe('describeStalled', () => {
  it('reports the state and how long it has been stuck', () => {
    expect(describeStalled(pr(), NOW)).toBe(
      'PR #1 (DIRTY, 12h): Daily Ops: experience db + journal update',
    )
  })
})

describe('DIRTY PR recovery', () => {
  it('maps only rerunnable local ops branches to workflows', () => {
    expect(retryWorkflowFor(pr({ headRefName: 'auto/Daily-Ops-20260831-000000' }))).toBe('daily.yml')
    expect(retryWorkflowFor(pr({ headRefName: 'auto/Weekly-Learning-20260831-000000' }))).toBe('weekly.yml')
    expect(retryWorkflowFor(pr({ headRefName: 'auto/metrics-20260831-000000' }))).toBeNull()
    expect(retryWorkflowFor(pr({ headRefName: 'fix/human-change' }))).toBeNull()
  })

  it('recovers only old DIRTY PRs with a known idempotent workflow', () => {
    const prs = [
      pr({ number: 1, headRefName: 'auto/Daily-Ops-old', mergeStateStatus: 'DIRTY' }),
      pr({ number: 2, headRefName: 'auto/Weekly-Learning-old', mergeStateStatus: 'DIRTY' }),
      pr({ number: 3, headRefName: 'auto/Daily-Ops-blocked', mergeStateStatus: 'BLOCKED' }),
      pr({ number: 4, headRefName: 'auto/metrics-old', mergeStateStatus: 'DIRTY' }),
      pr({ number: 5, headRefName: 'fix/human-change', mergeStateStatus: 'DIRTY' }),
    ]
    expect(selectRecoverable(prs, NOW).map((p) => p.number)).toEqual([1, 2])
  })

  it('records each successful recovery in the journal output', async () => {
    const recovered: number[] = []
    const lines = await recoverStalledPrs(
      new Logger({ runId: 'r' }, undefined, () => {}),
      NOW,
      () => [pr({ number: 82, headRefName: 'auto/Daily-Ops-old' })],
      (candidate) => { recovered.push(candidate.number); return 'replaced' },
    )
    expect(recovered).toEqual([82])
    expect(lines).toEqual(['watchdog: closed DIRTY PR #82 and dispatched daily.yml'])
  })

  it('keeps recovery failures observable without failing daily ops', async () => {
    const logged: string[] = []
    const log = new Logger({ runId: 'r' }, undefined, (line) => logged.push(line))
    await expect(
      recoverStalledPrs(log, NOW, () => [pr({ headRefName: 'auto/Daily-Ops-old' })], () => {
        throw new Error('dispatch denied')
      }),
    ).resolves.toEqual([])
    expect(logged.some((line) => line.includes('stalled_pr_recovery_failed'))).toBe(true)
  })
})

describe('salvage before destroy', () => {
  it('reports a salvaged PR as kept, not replaced', async () => {
    const lines = await recoverStalledPrs(
      new Logger({ runId: 'r' }, undefined, () => {}),
      NOW,
      () => [pr({ number: 82, headRefName: 'auto/Daily-Ops-old' })],
      () => 'salvaged',
    )
    expect(lines).toEqual(['watchdog: merged main into DIRTY PR #82, keeping its event log'])
  })

  /** Record the git calls and answer the queries salvageBranch makes. */
  function fakeGit(over: Record<string, string | (() => never)> = {}) {
    const calls: string[][] = []
    const git = (args: string[]): string => {
      calls.push(args)
      const key = args[0] ?? ''
      const canned = over[key]
      if (typeof canned === 'function') return canned()
      if (canned !== undefined) return canned
      switch (key) {
        case 'rev-parse': return 'false\n'
        case 'log': return 'Daily Ops: experience db + journal update\n'
        // Non-zero means main is NOT an ancestor, i.e. the branch is stale.
        case 'merge-base': throw new Error('not an ancestor')
        case 'merge-tree': return 'tree123\n'
        case 'commit-tree': return 'commit456\n'
        default: return ''
      }
    }
    return { git, calls }
  }

  const names = (calls: string[][]) => calls.map((c) => c[0])

  it('pushes a merge commit whose first parent is the branch tip', () => {
    const { git, calls } = fakeGit()
    expect(salvageBranch('auto/Daily-Ops-old', git)).toBe(true)

    const commitTree = calls.find((c) => c[0] === 'commit-tree')!
    // First parent = branch tip keeps the push a fast-forward, never a rewrite.
    expect(commitTree.slice(0, 6)).toEqual([
      'commit-tree', 'tree123',
      '-p', 'refs/remotes/origin/auto/Daily-Ops-old',
      '-p', 'refs/remotes/origin/main',
    ])
    expect(calls.at(-1)).toEqual([
      'push', 'origin', 'commit456:refs/heads/auto/Daily-Ops-old',
    ])
    expect(calls.some((c) => c.includes('--force'))).toBe(false)
  })

  it('fills in history first when the checkout is shallow', () => {
    const { git, calls } = fakeGit({ 'rev-parse': 'true\n' })
    salvageBranch('auto/Daily-Ops-old', git)
    expect(calls[1]).toEqual(['fetch', '--unshallow', '--no-tags', 'origin'])
  })

  it('gives up on a real conflict without pushing', () => {
    const { git, calls } = fakeGit({
      'merge-tree': () => { throw new Error('CONFLICT') },
    })
    expect(salvageBranch('auto/Daily-Ops-old', git)).toBe(false)
    expect(names(calls)).not.toContain('push')
  })

  it('only tries once per branch, so it cannot livelock', () => {
    const { git, calls } = fakeGit({ log: `${SALVAGE_MARKER} auto/Daily-Ops-old\n` })
    expect(salvageBranch('auto/Daily-Ops-old', git)).toBe(false)
    expect(names(calls)).not.toContain('push')
  })

  it('does nothing when the branch already contains main', () => {
    const { git, calls } = fakeGit({ 'merge-base': '' }) // exit 0 = is an ancestor
    expect(salvageBranch('auto/Daily-Ops-old', git)).toBe(false)
    expect(names(calls)).not.toContain('push')
  })

  /**
   * The point of salvaging is that the #133 conflict shape (daily and weekly
   * both appending to journal/YYYY-MM-DD.md) resolves without a working tree.
   * merge-tree must honour the union driver from the repo's .gitattributes,
   * and the run's event log must survive into the merged tree.
   */
  it('resolves the real journal conflict with plumbing only', () => {
    const repo = mkdtempSync(join(tmpdir(), 'salvage-'))
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' })
    git('init', '-q', '-b', 'main', '.')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'test')
    copyFileSync(join(import.meta.dirname, '..', '.gitattributes'), join(repo, '.gitattributes'))
    mkdirSync(join(repo, 'journal'), { recursive: true })
    mkdirSync(join(repo, 'data', 'events'), { recursive: true })
    git('add', '-A')
    git('commit', '-qm', 'base')

    // The weekly branch: its journal section plus the event log it paid for.
    git('checkout', '-qb', 'weekly')
    writeFileSync(join(repo, 'journal', '2026-09-14.md'), '# 2026-09-14\n\n## 09:08 JST — weekly\n')
    writeFileSync(join(repo, 'data', 'events', 'weekly.jsonl'), '{"grok":"paid"}\n')
    git('add', '-A')
    git('commit', '-qm', 'weekly')

    // main moves on with its own section in the same file: add/add conflict.
    git('checkout', '-q', 'main')
    mkdirSync(join(repo, 'journal'), { recursive: true }) // git drops empty dirs
    writeFileSync(join(repo, 'journal', '2026-09-14.md'), '# 2026-09-14\n\n## 09:07 JST — daily\n')
    git('add', '-A')
    git('commit', '-qm', 'daily')

    const tree = git('merge-tree', '--write-tree', 'main', 'weekly').trim()
    const journal = git('cat-file', '-p', `${tree}:journal/2026-09-14.md`)
    expect(journal).toContain('## 09:07 JST — daily')
    expect(journal).toContain('## 09:08 JST — weekly')
    expect(journal).not.toContain('<<<<<<<')
    // The irreplaceable part: the paid run's event log is in the merged tree.
    expect(git('cat-file', '-p', `${tree}:data/events/weekly.jsonl`)).toContain('paid')
    // And the working tree is untouched, so daily ops can still commit from it.
    expect(git('status', '--porcelain')).toBe('')
  })
})

describe('checkStalledPrs', () => {
  const silent = () => new Logger({ runId: 'r' }, undefined, () => {})

  it('returns a journal line naming every stalled PR', async () => {
    const lines = await checkStalledPrs(silent(), NOW, () => [
      pr({ number: 35, mergeStateStatus: 'DIRTY' }),
      pr({ number: 41, mergeStateStatus: 'BLOCKED' }),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('stalled on 2 PR(s)')
    expect(lines[0]).toContain('PR #35 (DIRTY, 12h)')
    expect(lines[0]).toContain('PR #41 (BLOCKED, 12h)')
  })

  it('stays quiet when nothing is stalled', async () => {
    expect(await checkStalledPrs(silent(), NOW, () => [pr({ mergeStateStatus: 'CLEAN' })])).toEqual([])
  })

  it('never throws when the gh call fails', async () => {
    const logged: string[] = []
    const log = new Logger({ runId: 'r' }, undefined, (l) => logged.push(l))
    await expect(
      checkStalledPrs(log, NOW, () => {
        throw new Error('gh: not authenticated')
      }),
    ).resolves.toEqual([])
    expect(logged.some((l) => l.includes('stalled_pr_check_failed'))).toBe(true)
  })
})
