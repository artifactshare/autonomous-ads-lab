// Every automated PR is opened through GITHUB_TOKEN and lands as
// github-actions[bot], which GitHub treats as a first-time contributor: the
// PR's CI run starts in `action_required` and auto-merge never fires. Each
// workflow that opens a PR therefore has to approve the resulting run itself.
//
// Only daily.yml actually does. The other three drifted, each in a different
// way, and every failure mode is silent -- the approve call is wrapped in
// `|| true`, so a missing permission looks identical to success in the log.
// The stuck PRs then wait for the next 07:00 JST daily run to un-stick them,
// which is the ~22h delay in #107.
//
// This module reads the workflow YAML as text (no YAML dependency, same
// approach as the budget-guard check in ci.yml) and reports the drift so a
// test can fail on it instead of a human noticing a PR sat overnight.

/** A step's raw YAML text, plus the file it came from. */
export interface WorkflowAudit {
  file: string
  /** Whether the workflow opens a PR, i.e. whether it needs an approve step. */
  createsPr: boolean
  /** Human-readable defects; empty means the workflow self-approves correctly. */
  problems: string[]
}

const PR_CREATE = 'gh pr create'
/** Tail of `repos/.../actions/runs/${id}/approve`. */
const APPROVE_CALL = '/approve'

/**
 * Split a workflow into the raw text of each `steps:` entry, in order.
 *
 * Step boundaries matter because reachability is per-step: a `run:` block is
 * one shell script, so an `exit 0` in it skips everything after it *in that
 * block only*. The next step still runs.
 */
export function splitSteps(yaml: string): string[] {
  const steps: string[] = []
  let current: string[] | null = null
  // Indent of the `steps:` key, and of the `- ` items nested under it.
  let stepsIndent: number | null = null
  let itemIndent: number | null = null

  const flush = () => {
    if (current) steps.push(current.join('\n'))
    current = null
  }

  for (const line of yaml.split('\n')) {
    const stepsKey = /^(\s*)steps:\s*$/.exec(line)
    if (stepsKey) {
      flush()
      stepsIndent = (stepsKey[1] ?? '').length
      itemIndent = null
      continue
    }
    if (stepsIndent === null) continue
    if (line.trim() === '') {
      current?.push(line)
      continue
    }
    const indent = line.search(/\S/)
    // Dedented back to or past `steps:` itself: the step list is over.
    if (indent <= stepsIndent) {
      flush()
      stepsIndent = null
      itemIndent = null
      continue
    }
    // All items in one step list share an indent; the first one sets it, so a
    // `- ` inside a step's own script cannot be mistaken for a new step.
    if (/^\s*-\s/.test(line) && (itemIndent === null || indent === itemIndent)) {
      itemIndent = indent
      flush()
      current = [line]
      continue
    }
    current?.push(line)
  }
  flush()
  return steps
}

/**
 * True when the approve call in this step can actually be reached.
 *
 * strategist.yml put the approve loop at the bottom of the same `run:` block
 * that commits, behind `if git diff --cached --quiet; then exit 0; fi`. The
 * strategist agent commits its own `improve/` branch during its turn, so by
 * the time that step runs there is nothing left to stage -- the guard fires
 * and the approve loop never executes. Confirmed in the 2026-10-12 run: the
 * step logged "No stash entries found" and went straight to cleanup, with no
 * approve output at all, leaving PR #220 stuck.
 */
export function approveIsReachable(step: string): boolean {
  const at = step.indexOf(APPROVE_CALL)
  if (at === -1) return false
  return !/\bexit 0\b/.test(step.slice(0, at))
}

/**
 * Whether the workflow grants `actions: write`, required by the
 * `actions/runs/{id}/approve` REST endpoint. Without it the call returns 403
 * "Resource not accessible by integration" -- swallowed by `|| true`.
 *
 * Matched as a bare line rather than by walking the `permissions:` block,
 * since the key only ever appears inside one and a false negative here would
 * fail CI on a workflow that is actually fine.
 */
export function hasActionsWrite(yaml: string): boolean {
  return /^\s*actions:\s*write\b/m.test(yaml)
}

/** Report how a single workflow handles the run it leaves in action_required. */
export function auditWorkflow(file: string, yaml: string): WorkflowAudit {
  const createsPr = yaml.includes(PR_CREATE)
  const problems: string[] = []

  if (createsPr) {
    const approve = splitSteps(yaml).find((s) => s.includes(APPROVE_CALL))
    if (!approve) {
      problems.push('opens a PR but never approves the run it leaves in action_required')
    } else if (!approveIsReachable(approve)) {
      problems.push('approve call sits after an `exit 0` in the same run block, so it is unreachable')
    }
    if (!hasActionsWrite(yaml)) {
      problems.push('missing `actions: write`, so the approve REST call returns 403')
    }
  }

  return { file, createsPr, problems }
}
