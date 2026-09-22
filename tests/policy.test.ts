import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from '../src/db/index.ts'
import {
  FABLE_CALLS_PER_WEEK,
  MODEL_FOR_ROLE,
  modelFor,
  resetFableCounter,
  type LlmRole,
} from '../src/llm/policy.ts'

/**
 * CLAUDE.md makes two promises about model selection that cost real money if
 * broken: every LLM call goes through modelFor(role), and fable-5 is reserved
 * for the hypothesis role with a hard weekly cap. Neither had a test (#174).
 */

beforeEach(() => resetFableCounter())

describe('role -> model assignment', () => {
  it('reserves fable for the hypothesis role only', () => {
    const fableRoles = (Object.keys(MODEL_FOR_ROLE) as LlmRole[]).filter((r) =>
      MODEL_FOR_ROLE[r].startsWith('claude-fable'),
    )
    expect(fableRoles).toEqual(['hypothesis'])
  })

  it('runs fable at low effort and everything else at high, except video', () => {
    expect(modelFor('hypothesis')).toEqual({ model: 'claude-fable-5', effort: 'low' })
    expect(modelFor('analysis')).toEqual({ model: 'claude-opus-5', effort: 'high' })
    expect(modelFor('video_evaluation').effort).toBe('low')
    expect(modelFor('evaluation').effort).toBe('high')
  })
})

describe('fable weekly cap', () => {
  it('falls back to the analysis model once the per-process cap is spent', () => {
    for (let i = 0; i < FABLE_CALLS_PER_WEEK; i++) {
      expect(modelFor('hypothesis').model).toBe('claude-fable-5')
    }
    expect(modelFor('hypothesis').model).toBe(MODEL_FOR_ROLE.analysis)
  })

  it('persists the count across processes when a db is passed', () => {
    // Each modelFor(db) call stands in for a separate job run: the in-process
    // counter is reset between them, so only fable_usage can hold the line.
    // Without persistence the daily job would burn the weekly limit 7x.
    const db = openDb(':memory:')
    for (let i = 0; i < FABLE_CALLS_PER_WEEK; i++) {
      resetFableCounter()
      expect(modelFor('hypothesis', db).model).toBe('claude-fable-5')
    }
    resetFableCounter()
    expect(modelFor('hypothesis', db).model).toBe(MODEL_FOR_ROLE.analysis)
  })

  it('keeps counting attempts after the cap, so the week stays closed', () => {
    const db = openDb(':memory:')
    for (let i = 0; i < FABLE_CALLS_PER_WEEK + 3; i++) modelFor('hypothesis', db)
    const { calls } = db.prepare('select calls from fable_usage').get() as { calls: number }
    expect(calls).toBe(FABLE_CALLS_PER_WEEK + 3)
    expect(modelFor('hypothesis', db).model).toBe(MODEL_FOR_ROLE.analysis)
  })

  it('does not touch the counter for non-hypothesis roles', () => {
    const db = openDb(':memory:')
    modelFor('analysis', db)
    modelFor('copywriting', db)
    expect(db.prepare('select count(*) as n from fable_usage').get()).toEqual({ n: 0 })
  })

  it('starts a fresh allowance in a new week', () => {
    // A row from a previous Monday must not gate this week's calls.
    const db = openDb(':memory:')
    db.prepare('insert into fable_usage (week_start, calls) values (?, ?)').run('2000-01-03', 99)
    expect(modelFor('hypothesis', db).model).toBe('claude-fable-5')
  })
})

describe('model ids live only in the policy module', () => {
  // Same discipline as tests/generated-artifacts.test.ts: the rule is only
  // real if something fails when it is broken. A hardcoded id elsewhere
  // silently bypasses the fable cap and the role tiering.
  it('has no hardcoded model id outside src/llm/policy.ts', () => {
    const pattern = 'claude-(opus|sonnet|haiku|fable)|gemini-[0-9]|grok-[0-9]|gpt-[0-9]'
    let hits: string[] = []
    try {
      hits = execFileSync(
        'git',
        // --untracked so a brand-new file fails locally, not just once committed.
        ['grep', '--untracked', '-nE', pattern, '--', 'src/', ':!src/llm/policy.ts'],
        { encoding: 'utf8' },
      )
        .trim()
        .split('\n')
    } catch {
      hits = [] // git grep exits 1 when nothing matches
    }
    // A model id named in a comment (e.g. a cost note) is not a call site.
    const callSites = hits.filter((line) => !/:\s*(\/\/|\*)/.test(line.replace(/^[^:]+:\d+:/, ': ')))
    expect(callSites).toEqual([])
  })
})
