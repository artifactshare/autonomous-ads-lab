import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  approveIsReachable,
  auditWorkflow,
  hasActionsWrite,
  splitSteps,
} from '../src/ops/workflow-approve-audit.ts'

const WORKFLOW_DIR = '.github/workflows'

function workflows(): Array<{ file: string; yaml: string }> {
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml'))
    .map((file) => ({ file, yaml: readFileSync(`${WORKFLOW_DIR}/${file}`, 'utf8') }))
}

/**
 * Workflows known to mishandle their own action_required run, tracked in #107.
 *
 * All three fixes are workflow-file edits, and GITHUB_TOKEN cannot modify
 * `.github/workflows/**` -- a push is rejected with "refusing to allow a
 * GitHub App to create or update workflow ... without `workflows` permission".
 * One of them (`actions: write` on strategist.yml) is also a permission
 * expansion the harness agent is forbidden to make. So this list cannot be
 * emptied by an agent; it needs the human steps written up in #107.
 *
 * Asserted as an upper bound, never an exact match: fixing one of these must
 * not turn CI red, because a red CI blocks the auto-merge path that every
 * automated run depends on. The list should shrink to empty once #107 lands.
 */
const KNOWN_BROKEN = new Set(['harness.yml', 'strategist.yml', 'weekly.yml'])

describe('workflow approve audit', () => {
  it('finds the workflows that open PRs', () => {
    const creators = workflows()
      .filter(({ file, yaml }) => auditWorkflow(file, yaml).createsPr)
      .map(({ file }) => file)
    // If a new workflow starts opening PRs it must be audited too, so assert
    // the full set rather than just that daily.yml is in it.
    expect(creators.sort()).toEqual(['daily.yml', 'harness.yml', 'strategist.yml', 'weekly.yml'])
  })

  it('no workflow outside the known-broken set mishandles its action_required run', () => {
    const broken = workflows()
      .map(({ file, yaml }) => auditWorkflow(file, yaml))
      .filter((a) => a.problems.length > 0)

    const unexpected = broken.filter((a) => !KNOWN_BROKEN.has(a.file))
    expect(
      unexpected.map((a) => `${a.file}: ${a.problems.join('; ')}`),
      'a PR-opening workflow cannot approve its own CI run, so its PR will sit in action_required until the next daily run',
    ).toEqual([])
  })

  it('daily.yml is the reference implementation and stays correct', () => {
    const daily = workflows().find((w) => w.file === 'daily.yml')
    expect(daily).toBeDefined()
    // Regression guard on the one workflow the whole auto-merge path relies on.
    expect(auditWorkflow('daily.yml', daily!.yaml).problems).toEqual([])
  })
})

describe('splitSteps', () => {
  const yaml = [
    'jobs:',
    '  a:',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - name: commit',
    '        run: |',
    '          git add -A',
    '          # a dash - inside a script is not a step',
    '          if git diff --cached --quiet; then exit 0; fi',
    '      - name: approve',
    '        run: |',
    '          gh api -X POST "repos/x/actions/runs/1/approve" || true',
    '  b:',
    '    steps:',
    '      - run: echo hi',
  ].join('\n')

  it('splits a job into one chunk per step', () => {
    const steps = splitSteps(yaml)
    expect(steps).toHaveLength(4)
    expect(steps[0]).toContain('actions/checkout')
    expect(steps[1]).toContain('git add -A')
    expect(steps[2]).toContain('/approve')
    expect(steps[3]).toContain('echo hi')
  })

  it('does not treat a dash inside a run block as a step boundary', () => {
    expect(splitSteps(yaml)[1]).toContain('a dash - inside a script')
  })

  it('keeps the commit guard out of the approve step', () => {
    const approve = splitSteps(yaml).find((s) => s.includes('/approve'))!
    expect(approve).not.toContain('exit 0')
    expect(approveIsReachable(approve)).toBe(true)
  })
})

describe('approveIsReachable', () => {
  it('rejects an approve call behind an early exit in the same block', () => {
    const step = [
      '      - name: commit and approve',
      '        run: |',
      '          if git diff --cached --quiet; then exit 0; fi',
      '          gh pr create --fill',
      '          gh api -X POST "repos/x/actions/runs/1/approve" || true',
    ].join('\n')
    expect(approveIsReachable(step)).toBe(false)
  })

  it('accepts an approve call with no preceding exit', () => {
    const step = [
      '      - name: approve',
      '        run: |',
      '          gh api -X POST "repos/x/actions/runs/1/approve" || true',
    ].join('\n')
    expect(approveIsReachable(step)).toBe(true)
  })

  it('is false when the step has no approve call at all', () => {
    expect(approveIsReachable('      - run: echo hi')).toBe(false)
  })
})

describe('hasActionsWrite', () => {
  it('detects the permission', () => {
    expect(hasActionsWrite('permissions:\n  actions: write # approve runs\n')).toBe(true)
  })

  it('does not accept read access', () => {
    expect(hasActionsWrite('permissions:\n  actions: read\n')).toBe(false)
  })

  it('is false when permissions omit actions', () => {
    expect(hasActionsWrite('permissions:\n  contents: write\n')).toBe(false)
  })
})

describe('auditWorkflow', () => {
  it('reports nothing for a workflow that opens no PR', () => {
    expect(auditWorkflow('ci.yml', 'name: CI\non:\n  pull_request:\n')).toEqual({
      file: 'ci.yml',
      createsPr: false,
      problems: [],
    })
  })

  it('reports both defects for the strategist shape', () => {
    const yaml = [
      'permissions:',
      '  contents: write',
      'jobs:',
      '  s:',
      '    steps:',
      '      - name: commit',
      '        run: |',
      '          if git diff --cached --quiet; then exit 0; fi',
      '          gh pr create --fill',
      '          gh api -X POST "repos/x/actions/runs/1/approve" || true',
    ].join('\n')
    const audit = auditWorkflow('strategist.yml', yaml)
    expect(audit.createsPr).toBe(true)
    expect(audit.problems).toHaveLength(2)
    expect(audit.problems[0]).toContain('unreachable')
    expect(audit.problems[1]).toContain('actions: write')
  })

  it('reports a missing approve step for the weekly shape', () => {
    const yaml = [
      'permissions:',
      '  actions: write',
      'jobs:',
      '  w:',
      '    steps:',
      '      - name: commit',
      '        run: |',
      '          gh pr create --fill',
    ].join('\n')
    const audit = auditWorkflow('weekly.yml', yaml)
    expect(audit.problems).toEqual([
      'opens a PR but never approves the run it leaves in action_required',
    ])
  })

  it('reports nothing for the daily shape', () => {
    const yaml = [
      'permissions:',
      '  actions: write',
      'jobs:',
      '  d:',
      '    steps:',
      '      - name: commit',
      '        run: |',
      '          if git diff --cached --quiet; then exit 0; fi',
      '          gh pr create --fill',
      '      - name: Approve stuck workflow runs',
      '        if: always()',
      '        run: |',
      '          gh api -X POST "repos/x/actions/runs/1/approve" || true',
    ].join('\n')
    expect(auditWorkflow('daily.yml', yaml).problems).toEqual([])
  })
})
