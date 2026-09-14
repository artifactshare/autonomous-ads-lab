import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * Files that are rendered from the experience DB on every run and shipped
 * elsewhere (artifactshare, or rebuilt by `pnpm db:init`). Committing them made
 * the daily and weekly jobs conflict whenever both ran on the same JST day:
 * each regenerates the file from its own checkout, so the second PR to reach
 * main goes DIRTY and the watchdog closes it, discarding that run's work and
 * its budget_ledger rows (#133).
 */
const GENERATED = ['data/living-report.html', 'data/experience.db']

/** True when git tracks the path (exit 0), false when it does not (exit 1). */
function isTracked(path: string): boolean {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', path], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/** True when .gitignore excludes the path (exit 0), false otherwise (exit 1). */
function isIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

describe('generated artifacts stay out of git', () => {
  it.each(GENERATED)('%s is gitignored', (path) => {
    expect(isIgnored(path)).toBe(true)
  })

  it.each(GENERATED)('%s is not tracked', (path) => {
    expect(isTracked(path)).toBe(false)
  })
})
