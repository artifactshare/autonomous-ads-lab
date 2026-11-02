// Every workflow that opens a PR stages an explicit path allowlist before it
// commits:
//
//   daily.yml      git add data/ journal/
//   weekly.yml     git add data/ journal/
//   strategist.yml git add docs/strategy.md journal/
//   harness.yml    git add journal/
//
// Anything an ops script writes outside its own workflow's allowlist is never
// staged, never reaches the PR, and raises nothing: the script exits 0, the
// log looks healthy, and only the artifact disappears. #247 caught this one
// step before it bit -- the first #23 design had the weekly job writing
// `prompts/knowledge/`, which `git add data/ journal/` would have dropped,
// silently discarding a monthly *paid* research query every single month.
//
// #247 weighed two detectors. Having each script declare its output paths is
// only ever as good as the declarations, and it cannot see a write made by an
// external CLI (`npx @artifactshare/cli`) or through a computed path -- the
// exact cases most likely to drift. So this checks the real thing instead:
// after the work is done, ask git what actually changed on disk and compare
// that against the allowlist parsed out of the workflow that is running.
// Nothing to keep in sync, and a write through any route is visible.
//
// This reports; it does not fail the run. A dropped artifact is a bug worth
// surfacing, but the run that noticed it still has real work (journal, DB
// rows) to commit, and exiting non-zero would throw that away too.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Logger } from '../logging/logger.ts'

/** `git add` forms that stage the whole tree, so nothing can drift. */
const STAGES_EVERYTHING = new Set(['.', '-A', '--all', '-u', '--update', ':/'])

/**
 * Pull the staged-path allowlist out of a workflow's YAML.
 *
 * Read as text rather than parsed YAML, matching `workflow-approve-audit.ts`
 * and the budget-guard check in ci.yml: the shape being matched is a shell
 * line inside a `run:` block, which a YAML parser hands back as an opaque
 * string anyway.
 *
 * A whole-tree form (`git add -A`) is normalised to `.`, which `isCovered`
 * treats as covering everything.
 */
export function parseGitAddPaths(yaml: string): string[] {
  const paths: string[] = []
  for (const line of yaml.split('\n')) {
    const add = /^\s*git\s+add\s+(.+)$/.exec(line)
    if (!add) continue
    // Strip a trailing `|| true` / `; ...` tail so it is not read as a path.
    const args = (add[1] ?? '').split(/\s*(?:\|\||;|&&|#)/)[0] ?? ''
    for (const raw of args.trim().split(/\s+/)) {
      const token = raw.replace(/^["']|["']$/g, '')
      if (!token) continue
      if (STAGES_EVERYTHING.has(token)) {
        paths.push('.')
        continue
      }
      // Any other flag (`--force`, `-f`) is not a path.
      if (token.startsWith('-')) continue
      paths.push(token)
    }
  }
  return [...new Set(paths)]
}

/** Whether `git add <allowlist>` would stage a change at `path`. */
export function isCovered(path: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    if (entry === '.') return true
    const base = entry.replace(/\/+$/, '')
    return path === base || path.startsWith(base + '/')
  })
}

/**
 * Paths with uncommitted changes, from `git status --porcelain`.
 *
 * Ignored files are absent by design (no `--ignored`): `data/experience.db`
 * and `data/living-report.html` are gitignored build artifacts, and flagging
 * them as drift every run would train us to ignore this check.
 *
 * For a rename (`R  old -> new`) only `new` is reported -- that is the path
 * whose content has to reach the commit.
 */
export function parseChangedPaths(porcelain: string): string[] {
  const paths: string[] = []
  for (const line of porcelain.split('\n')) {
    // Two status columns then a space; the rest is the path.
    if (line.length < 4) continue
    const rest = line.slice(3)
    const arrow = rest.indexOf(' -> ')
    const path = arrow === -1 ? rest : rest.slice(arrow + 4)
    const unquoted = path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path
    if (unquoted) paths.push(unquoted)
  }
  return [...new Set(paths)]
}

/**
 * Which workflow file is running, from `GITHUB_WORKFLOW_REF`, e.g.
 * `owner/repo/.github/workflows/daily.yml@refs/heads/main`.
 *
 * `GITHUB_WORKFLOW` holds the display name ("Daily Ops"), which does not map
 * back to a filename, so the ref is the only reliable source.
 */
export function workflowFileFromRef(ref: string | undefined): string | undefined {
  if (!ref) return undefined
  const path = ref.split('@')[0] ?? ''
  const at = path.indexOf('.github/workflows/')
  return at === -1 ? undefined : path.slice(at)
}

/** Changed paths that this workflow's `git add` would silently leave behind. */
export function findCommitDrift(workflowYaml: string, porcelain: string): string[] {
  const allowlist = parseGitAddPaths(workflowYaml)
  // A workflow with no `git add` at all commits nothing on purpose; treating
  // its whole working tree as drift would be noise, not signal.
  if (allowlist.length === 0) return []
  return parseChangedPaths(porcelain).filter((p) => !isCovered(p, allowlist))
}

export interface CommitDriftDeps {
  env?: NodeJS.ProcessEnv
  readWorkflow?: (file: string) => string
  gitStatus?: () => string
}

/**
 * Log any artifact this run wrote that its workflow will not commit.
 *
 * Call last, after every write. Returns the dropped paths (empty when fine)
 * so a caller can also surface them; the warning lands in `run_logs`, which
 * is replayed from the committed event log and so is the one log sink that
 * outlives the runner.
 *
 * Silent outside Actions: a developer's working tree is full of unrelated
 * edits, and warning about those would make the check meaningless where it
 * matters. Equally silent on any failure to gather inputs -- a diagnostic has
 * no business breaking the run it is diagnosing.
 */
export function reportCommitDrift(log: Logger, deps: CommitDriftDeps = {}): string[] {
  const env = deps.env ?? process.env
  if (env.GITHUB_ACTIONS !== 'true') return []

  const workflow = workflowFileFromRef(env.GITHUB_WORKFLOW_REF)
  if (!workflow) return []

  const readWorkflow = deps.readWorkflow ?? ((f: string) => readFileSync(f, 'utf8'))
  const gitStatus =
    deps.gitStatus ??
    (() =>
      execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        encoding: 'utf8',
      }))

  let dropped: string[]
  let allowlist: string[]
  try {
    const yaml = readWorkflow(workflow)
    allowlist = parseGitAddPaths(yaml)
    dropped = findCommitDrift(yaml, gitStatus())
  } catch (err) {
    log.warn('commit_drift_check_failed', { error: String(err).slice(0, 200) })
    return []
  }

  if (dropped.length > 0) {
    log.warn('commit_drift', {
      workflow,
      allowlist,
      // Bounded: a genuinely broken run could dirty hundreds of paths, and
      // this value goes into a committed DB row.
      dropped: dropped.slice(0, 20),
      droppedCount: dropped.length,
    })
  }
  return dropped
}
