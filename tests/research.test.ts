import { describe, expect, it } from 'vitest'
import { openDb } from '../src/db/index.ts'
import { ResearchRepo } from '../src/research/repo.ts'
import { recordTechniques, researchVerdict } from '../src/research/research.ts'

function setup() {
  const repo = new ResearchRepo(openDb(':memory:'))
  return repo
}

const technique = (name: string) => ({
  name,
  description: 'd',
  hypothesis: 'if we do X, CTR improves because Y',
  implementation_hint: 'h',
  source: '@someone',
})

describe('researchVerdict', () => {
  it('trusts a trailing VERDICT line', () => {
    expect(researchVerdict('1. @someone asked for exactly this.\nVERDICT: FOUND')).toBe('found')
    expect(researchVerdict('Nothing matched the criteria.\nVERDICT: NONE')).toBe('none')
  })

  it('is not fooled by a leading INSUFFICIENT_DATA label above real findings', () => {
    // The 10/19 label-collapse case: label first, findings below (strategy.md I12).
    expect(researchVerdict('**INSUFFICIENT_DATA**\n1. Showly tutorial series by @someone...\nVERDICT: FOUND')).toBe('found')
  })

  it('uses the last verdict when several appear', () => {
    expect(researchVerdict('VERDICT: NONE for query 1.\nBut query 2 matched:\nVERDICT: FOUND')).toBe('found')
  })

  it('falls back to the legacy whole-text label when no verdict line exists', () => {
    expect(researchVerdict('**INSUFFICIENT_DATA**')).toBe('none')
    expect(researchVerdict('Here are 3 accounts: @a, @b, @c')).toBe('found')
  })
})

describe('recordTechniques', () => {
  it('returns the number actually stored, not the response length', () => {
    const repo = setup()
    const text = JSON.stringify([1, 2, 3, 4, 5].map((n) => technique(`t${n}`)))
    // Response offered 5; only the first 3 are stored.
    expect(recordTechniques(repo, text)).toBe(3)
    expect(repo.techniques('discovered')).toHaveLength(3)
  })

  it('does not count entries dropped for a missing name or hypothesis', () => {
    const repo = setup()
    const text = JSON.stringify([
      technique('good'),
      { description: 'no name', hypothesis: 'h' },
      { name: 'no hypothesis', description: 'd' },
    ])
    expect(recordTechniques(repo, text)).toBe(1)
    expect(repo.techniques('discovered')).toHaveLength(1)
  })

  it('extracts the array even when wrapped in prose or code fences', () => {
    const repo = setup()
    const text = 'Here are the techniques:\n```json\n' + JSON.stringify([technique('a')]) + '\n```\nHope this helps.'
    expect(recordTechniques(repo, text)).toBe(1)
  })

  it('returns 0 for an explicitly empty result', () => {
    const repo = setup()
    expect(recordTechniques(repo, 'Nothing credible found: []')).toBe(0)
    expect(repo.techniques('discovered')).toHaveLength(0)
  })

  it('treats a response with no array at all as zero techniques', () => {
    const repo = setup()
    // No bracketed span to extract -> falls back to [], not an error.
    expect(recordTechniques(repo, 'INSUFFICIENT_DATA')).toBe(0)
    expect(recordTechniques(repo, 'broken [ {name: ')).toBe(0)
  })

  it('throws when a bracketed span is present but is not valid JSON', () => {
    const repo = setup()
    // Caller catches this and journals "not parseable as techniques JSON".
    expect(() => recordTechniques(repo, 'here: [ {name: broken} ]')).toThrow()
    expect(repo.techniques('discovered')).toHaveLength(0)
  })
})
