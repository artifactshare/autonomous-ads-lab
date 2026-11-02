import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Logger } from '../src/logging/logger.ts'
import {
  findCommitDrift,
  isCovered,
  parseChangedPaths,
  parseGitAddPaths,
  reportCommitDrift,
  workflowFileFromRef,
} from '../src/ops/commit-drift.ts'

const WORKFLOW_DIR = '.github/workflows'

function workflow(file: string): string {
  return readFileSync(`${WORKFLOW_DIR}/${file}`, 'utf8')
}

/** A logger that records instead of writing, so assertions can read it back. */
function captureLog(): { log: Logger; lines: Array<Record<string, unknown>> } {
  const lines: Array<Record<string, unknown>> = []
  const log = new Logger({ runId: 'test' }, undefined, (line) => lines.push(JSON.parse(line)))
  return { log, lines }
}

describe('parseGitAddPaths', () => {
  it('reads the allowlist off a commit step', () => {
    expect(parseGitAddPaths('        run: |\n          git add data/ journal/\n')).toEqual([
      'data/',
      'journal/',
    ])
  })

  it('drops a trailing `|| true` rather than reading it as a path', () => {
    expect(parseGitAddPaths('          git add journal/ || true\n')).toEqual(['journal/'])
  })

  it('collects paths from every git add in the file', () => {
    const yaml = ['          git add docs/strategy.md journal/', '          git add data/'].join('\n')
    expect(parseGitAddPaths(yaml)).toEqual(['docs/strategy.md', 'journal/', 'data/'])
  })

  it('normalises whole-tree forms to `.`', () => {
    expect(parseGitAddPaths('          git add -A\n')).toEqual(['.'])
    expect(parseGitAddPaths('          git add .\n')).toEqual(['.'])
  })

  it('ignores flags that are not paths', () => {
    expect(parseGitAddPaths('          git add --force data/\n')).toEqual(['data/'])
  })

  it('finds nothing in a workflow that never commits', () => {
    expect(parseGitAddPaths('name: CI\non:\n  pull_request:\n')).toEqual([])
  })
})

describe('isCovered', () => {
  it('covers files under a directory entry', () => {
    expect(isCovered('data/events/x.jsonl', ['data/', 'journal/'])).toBe(true)
    expect(isCovered('journal/2026-11-02/093000-harness-agent.md', ['journal/'])).toBe(true)
  })

  it('does not cover a path outside every entry', () => {
    expect(isCovered('prompts/knowledge/x-video-ads.md', ['data/', 'journal/'])).toBe(false)
  })

  it('covers an exact file entry only', () => {
    expect(isCovered('docs/strategy.md', ['docs/strategy.md'])).toBe(true)
    expect(isCovered('docs/model-policy.md', ['docs/strategy.md'])).toBe(false)
  })

  it('does not let a name prefix pass as a directory match', () => {
    // `git add data/` must not be read as covering a sibling `data-export/`.
    expect(isCovered('data-export/x.csv', ['data/'])).toBe(false)
  })

  it('covers everything under a whole-tree entry', () => {
    expect(isCovered('anything/at/all.txt', ['.'])).toBe(true)
  })
})

describe('parseChangedPaths', () => {
  it('reads modified, added and untracked lines', () => {
    const porcelain = [' M data/events/a.jsonl', 'A  journal/2026-11-02/x.md', '?? scratch.txt'].join(
      '\n',
    )
    expect(parseChangedPaths(porcelain)).toEqual([
      'data/events/a.jsonl',
      'journal/2026-11-02/x.md',
      'scratch.txt',
    ])
  })

  it('reports the destination of a rename', () => {
    expect(parseChangedPaths('R  docs/old.md -> docs/new.md')).toEqual(['docs/new.md'])
  })

  it('unquotes a path git had to quote', () => {
    expect(parseChangedPaths('?? "journal/with space.md"')).toEqual(['journal/with space.md'])
  })

  it('is empty for a clean tree', () => {
    expect(parseChangedPaths('')).toEqual([])
    expect(parseChangedPaths('\n')).toEqual([])
  })
})

describe('findCommitDrift', () => {
  const dailyish = '          git add data/ journal/\n'

  it('reports a write the allowlist would drop', () => {
    const porcelain = [' M data/events/a.jsonl', '?? prompts/knowledge/x-video-ads.md'].join('\n')
    // This is the #23 near-miss: weekly writing prompts/knowledge/ under
    // `git add data/ journal/` would have discarded a paid research query.
    expect(findCommitDrift(dailyish, porcelain)).toEqual(['prompts/knowledge/x-video-ads.md'])
  })

  it('reports nothing when every write is inside the allowlist', () => {
    const porcelain = [' M data/events/a.jsonl', 'A  journal/2026-11-02/x.md'].join('\n')
    expect(findCommitDrift(dailyish, porcelain)).toEqual([])
  })

  it('reports nothing for a workflow that stages no paths', () => {
    // No `git add` means committing nothing is the intent, so a dirty tree is
    // not drift. ci.yml and ga4-report.yml are in this shape.
    expect(findCommitDrift('name: CI\n', '?? anything.txt')).toEqual([])
  })
})

describe('workflowFileFromRef', () => {
  it('extracts the workflow path from the ref', () => {
    expect(workflowFileFromRef('coji/autonomous-ads-lab/.github/workflows/daily.yml@refs/heads/main')).toBe(
      '.github/workflows/daily.yml',
    )
  })

  it('is undefined when the variable is unset or unexpected', () => {
    expect(workflowFileFromRef(undefined)).toBeUndefined()
    expect(workflowFileFromRef('Daily Ops')).toBeUndefined()
  })
})

describe('reportCommitDrift', () => {
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/weekly.yml@refs/heads/main',
  } as NodeJS.ProcessEnv

  it('warns with the dropped paths', () => {
    const { log, lines } = captureLog()
    const dropped = reportCommitDrift(log, {
      env,
      readWorkflow: () => '          git add data/ journal/\n',
      gitStatus: () => '?? prompts/knowledge/x.md\n M data/events/a.jsonl',
    })
    expect(dropped).toEqual(['prompts/knowledge/x.md'])
    const warn = lines.find((l) => l.event === 'commit_drift')
    expect(warn).toMatchObject({
      level: 'warn',
      workflow: '.github/workflows/weekly.yml',
      dropped: ['prompts/knowledge/x.md'],
      droppedCount: 1,
    })
  })

  it('stays quiet when nothing drifted', () => {
    const { log, lines } = captureLog()
    expect(
      reportCommitDrift(log, {
        env,
        readWorkflow: () => '          git add data/ journal/\n',
        gitStatus: () => ' M data/events/a.jsonl',
      }),
    ).toEqual([])
    expect(lines).toEqual([])
  })

  it('does nothing outside Actions, so a dev working tree is never flagged', () => {
    const { log, lines } = captureLog()
    const gitStatus = vi.fn(() => '?? scratch.txt')
    expect(
      reportCommitDrift(log, {
        env: { GITHUB_WORKFLOW_REF: env.GITHUB_WORKFLOW_REF } as NodeJS.ProcessEnv,
        readWorkflow: () => '          git add data/\n',
        gitStatus,
      }),
    ).toEqual([])
    expect(gitStatus).not.toHaveBeenCalled()
    expect(lines).toEqual([])
  })

  it('caps the dropped list it writes to the DB', () => {
    const { log, lines } = captureLog()
    const many = Array.from({ length: 25 }, (_, i) => `?? out/f${i}.txt`).join('\n')
    reportCommitDrift(log, {
      env,
      readWorkflow: () => '          git add data/\n',
      gitStatus: () => many,
    })
    const warn = lines.find((l) => l.event === 'commit_drift')!
    expect((warn.dropped as string[]).length).toBe(20)
    expect(warn.droppedCount).toBe(25)
  })

  it('warns but does not throw when git or the workflow file is unreadable', () => {
    const { log, lines } = captureLog()
    expect(
      reportCommitDrift(log, {
        env,
        readWorkflow: () => {
          throw new Error('ENOENT')
        },
      }),
    ).toEqual([])
    expect(lines[0]).toMatchObject({ event: 'commit_drift_check_failed', level: 'warn' })
  })
})

// Static half of the #247 guard: the allowlists themselves. The runtime check
// above only fires on a run that actually writes outside one, which may be
// months after a `git add` line is narrowed. This notices the edit instead.
describe('workflow commit allowlists', () => {
  const EXPECTED: Record<string, string[]> = {
    'daily.yml': ['data/', 'journal/'],
    'weekly.yml': ['data/', 'journal/'],
    'strategist.yml': ['docs/strategy.md', 'journal/'],
    'harness.yml': ['journal/'],
  }

  it('match what the ops code expects to be committed', () => {
    const actual: Record<string, string[]> = {}
    for (const file of readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml'))) {
      const paths = parseGitAddPaths(workflow(file))
      if (paths.length > 0) actual[file] = paths
    }
    // Asserted as an exact map: a workflow that starts or stops committing, or
    // changes which paths it stages, has to be reviewed against what the ops
    // scripts write -- that mismatch is the silent-artifact-loss bug in #247.
    expect(actual).toEqual(EXPECTED)
  })

  it('cover the journal, which every automated actor writes', () => {
    for (const [file, paths] of Object.entries(EXPECTED)) {
      expect(isCovered('journal/2026-11-02/093000-actor.md', paths), file).toBe(true)
    }
  })
})
