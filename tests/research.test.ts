import { describe, expect, it } from 'vitest'
import { openDb } from '../src/db/index.ts'
import { ResearchRepo } from '../src/research/repo.ts'
import { recordTechniques } from '../src/research/research.ts'

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
