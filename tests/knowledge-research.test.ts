import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { openDb } from '../src/db/index.ts'
import { Logger } from '../src/logging/logger.ts'
import { ResearchRepo } from '../src/research/repo.ts'
import {
  DOMAIN_ROTATION,
  MAX_PROPOSALS,
  domainForMonth,
  jstMonth,
  knowledgePrompt,
  monthlyKnowledgeResearch,
  parseKnowledgeProposals,
  pendingKnowledgeUpdates,
  shouldRunThisMonth,
} from '../src/research/knowledge-research.ts'

function setup(): { db: Database.Database; log: Logger } {
  const db = openDb(':memory:')
  return { db, log: Logger.newRun(undefined, db) }
}

const proposal = (n: number, over: Record<string, unknown> = {}) => ({
  insight: `insight ${n}`,
  detail: 'detail',
  source: `https://example.com/${n}`,
  confidence: 'medium',
  ...over,
})

/** Record an observation the way runQuery does, so enrichment has a target. */
function recordAsRunQueryWould(db: Database.Database, runId: string): number {
  return new ResearchRepo(db).recordObservation({
    kind: 'knowledge_update',
    query: 'knowledge refresh',
    source: 'grok',
    summary: 'raw text',
    raw: { toolCalls: 4, usage: { input: 1, output: 2 } },
    costUsd: 0.02,
    runId,
  })
}

describe('domainForMonth', () => {
  it('advances exactly once per calendar month', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map((m) =>
      domainForMonth(new Date(`${m}-10T00:00:00Z`)),
    )
    // Four distinct domains, then the rotation repeats.
    expect(new Set(months.slice(0, 4)).size).toBe(4)
    expect(months[4]).toBe(months[0])
  })

  it('is stable for every day within one month', () => {
    const days = ['01', '09', '17', '28'].map((d) => domainForMonth(new Date(`2026-07-${d}T12:00:00Z`)))
    expect(new Set(days).size).toBe(1)
  })

  it('only ever returns a real knowledge domain', () => {
    for (let m = 0; m < 12; m++) {
      const date = new Date(Date.UTC(2026, m, 15))
      expect(DOMAIN_ROTATION).toContain(domainForMonth(date))
    }
  })

  it('uses the JST month, so a late-UTC-month timestamp rotates with JST', () => {
    // 2026-01-31T16:00Z is already 2026-02-01 in JST.
    expect(jstMonth(new Date('2026-01-31T16:00:00Z'))).toBe('2026-02')
    expect(domainForMonth(new Date('2026-01-31T16:00:00Z'))).toBe(
      domainForMonth(new Date('2026-02-15T00:00:00Z')),
    )
  })
})

describe('parseKnowledgeProposals', () => {
  it('keeps well-formed entries', () => {
    const out = parseKnowledgeProposals(JSON.stringify([proposal(1), proposal(2)]))
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ insight: 'insight 1', source: 'https://example.com/1', confidence: 'medium' })
  })

  it('extracts the array from prose and code fences', () => {
    const text = 'Found these:\n```json\n' + JSON.stringify([proposal(1)]) + '\n```\n'
    expect(parseKnowledgeProposals(text)).toHaveLength(1)
  })

  it('drops entries with no source URL', () => {
    const out = parseKnowledgeProposals(
      JSON.stringify([proposal(1, { source: 'the official docs' }), proposal(2, { source: '' }), proposal(3)]),
    )
    expect(out.map((p) => p.insight)).toEqual(['insight 3'])
  })

  it('drops entries with no insight', () => {
    expect(parseKnowledgeProposals(JSON.stringify([proposal(1, { insight: '   ' })]))).toEqual([])
  })

  it('downgrades an unknown or missing confidence to low rather than up', () => {
    const out = parseKnowledgeProposals(
      JSON.stringify([proposal(1, { confidence: 'certain' }), proposal(2, { confidence: undefined })]),
    )
    expect(out.map((p) => p.confidence)).toEqual(['low', 'low'])
  })

  it('normalizes confidence case', () => {
    expect(parseKnowledgeProposals(JSON.stringify([proposal(1, { confidence: 'HIGH' })]))[0]?.confidence).toBe('high')
  })

  it('caps the number of proposals', () => {
    const many = Array.from({ length: MAX_PROPOSALS + 4 }, (_, i) => proposal(i))
    expect(parseKnowledgeProposals(JSON.stringify(many))).toHaveLength(MAX_PROPOSALS)
  })

  it('returns [] for an empty, absent or malformed array instead of throwing', () => {
    expect(parseKnowledgeProposals('[]')).toEqual([])
    expect(parseKnowledgeProposals('nothing worth adding')).toEqual([])
    expect(parseKnowledgeProposals('[ {insight: ')).toEqual([])
    expect(parseKnowledgeProposals(JSON.stringify({ insight: 'not an array' }))).toEqual([])
  })

  it('ignores non-object entries', () => {
    expect(parseKnowledgeProposals(JSON.stringify([null, 'a string', 42, proposal(1)]))).toHaveLength(1)
  })
})

describe('knowledgePrompt', () => {
  it('includes the existing file so the search looks for what is missing', () => {
    const prompt = knowledgePrompt('video-ads', 'EXISTING KNOWLEDGE BODY')
    expect(prompt).toContain('EXISTING KNOWLEDGE BODY')
    expect(prompt).toContain('video-ads')
  })

  it('bounds the existing file so a large one cannot blow up the request', () => {
    const prompt = knowledgePrompt('audience', 'x'.repeat(50_000))
    expect(prompt.length).toBeLessThan(10_000)
  })
})

describe('shouldRunThisMonth', () => {
  it('is true when no knowledge update exists at all', () => {
    const { db } = setup()
    expect(shouldRunThisMonth(db, new Date('2026-10-26T00:00:00Z'))).toBe(true)
  })

  it('is false once one was recorded in the same JST month', () => {
    const { db, log } = setup()
    recordAsRunQueryWould(db, log.runId)
    expect(shouldRunThisMonth(db, new Date())).toBe(false)
  })

  it('is true again in the next month', () => {
    const { db } = setup()
    db.prepare(
      `insert into research_observations (created_at, kind, query, source, summary, cost_usd, run_id)
       values ('2026-09-10T00:00:00.000Z', 'knowledge_update', 'q', 'grok', 's', 0, 'r')`,
    ).run()
    expect(shouldRunThisMonth(db, new Date('2026-10-01T00:00:00Z'))).toBe(true)
    expect(shouldRunThisMonth(db, new Date('2026-09-25T00:00:00Z'))).toBe(false)
  })

  it('is not confused by other observation kinds', () => {
    const { db, log } = setup()
    new ResearchRepo(db).recordObservation({
      kind: 'ad_trends', query: 'q', source: 'grok', summary: 's', costUsd: 0, runId: log.runId,
    })
    expect(shouldRunThisMonth(db, new Date())).toBe(true)
  })
})

describe('monthlyKnowledgeResearch', () => {
  /** Swap XAI_API_KEY-backed runQuery out by stubbing global fetch. */
  function stubGrok(text: string) {
    const original = globalThis.fetch
    process.env.XAI_API_KEY = 'test-key'
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
        { status: 200 },
      )) as typeof fetch
    return () => {
      globalThis.fetch = original
      delete process.env.XAI_API_KEY
    }
  }

  it('records one observation carrying the parsed proposals, not two', async () => {
    const { db, log } = setup()
    const restore = stubGrok(JSON.stringify([proposal(1), proposal(2)]))
    try {
      const notes = await monthlyKnowledgeResearch(db, log, new Date(), () => 'existing')
      expect(notes.join(' ')).toContain('2 sourced proposal(s)')
    } finally {
      restore()
    }
    const rows = db.prepare("select raw from research_observations where kind = 'knowledge_update'").all() as {
      raw: string
    }[]
    expect(rows).toHaveLength(1)
    const raw = JSON.parse(rows[0]!.raw) as Record<string, unknown>
    expect((raw.proposals as unknown[]).length).toBe(2)
    // Enrichment must not drop what runQuery stored.
    expect(raw.toolCalls).toBeDefined()
    expect(raw.usage).toBeDefined()
  })

  it('does nothing on a second call in the same month', async () => {
    const { db, log } = setup()
    const restore = stubGrok(JSON.stringify([proposal(1)]))
    try {
      await monthlyKnowledgeResearch(db, log, new Date(), () => 'existing')
      expect(await monthlyKnowledgeResearch(db, log, new Date(), () => 'existing')).toEqual([])
    } finally {
      restore()
    }
    expect(
      db.prepare("select count(*) c from research_observations where kind = 'knowledge_update'").get(),
    ).toEqual({ c: 1 })
  })

  it('still closes the month when the search returns nothing usable', async () => {
    const { db, log } = setup()
    const restore = stubGrok('nothing credible: []')
    try {
      const notes = await monthlyKnowledgeResearch(db, log, new Date(), () => 'existing')
      expect(notes.join(' ')).toContain('no sourced proposals')
    } finally {
      restore()
    }
    // An empty month is recorded, so the paid query is not retried next week.
    expect(shouldRunThisMonth(db, new Date())).toBe(false)
  })

  it('leaves the month open when the query itself could not run', async () => {
    const { db, log } = setup()
    // No XAI_API_KEY -> grokQuery throws -> runQuery catches and returns null.
    const notes = await monthlyKnowledgeResearch(db, log, new Date(), () => 'existing')
    expect(notes.join(' ')).toContain('will retry next week')
    expect(shouldRunThisMonth(db, new Date())).toBe(true)
  })
})

describe('pendingKnowledgeUpdates', () => {
  function knowledgeDir(files: Record<string, string> = {}): string {
    const dir = mkdtempSync(join(tmpdir(), 'knowledge-'))
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
    return dir
  }

  function withProposals(db: Database.Database, runId: string, domain: string, n: number): number {
    recordAsRunQueryWould(db, runId)
    return new ResearchRepo(db).enrichLatestObservation('knowledge_update', runId, {
      domain,
      proposals: Array.from({ length: n }, (_, i) => proposal(i)),
    })!
  }

  it('lists an update no knowledge file references', () => {
    const { db } = setup()
    const id = withProposals(db, 'run-1', 'video-ads', 2)
    const pending = pendingKnowledgeUpdates(db, knowledgeDir({ 'video-ads.md': '# video ads\n' }))
    expect(pending.map((p) => p.id)).toEqual([id])
    expect(pending[0]?.domain).toBe('video-ads')
    expect(pending[0]?.proposals).toHaveLength(2)
  })

  it('stops listing it once the marker is in any knowledge file', () => {
    const { db } = setup()
    const id = withProposals(db, 'run-1', 'video-ads', 2)
    const dir = knowledgeDir({ 'video-ads.md': `# video ads\n\n<!-- knowledge-update: obs ${id} -->\n` })
    expect(pendingKnowledgeUpdates(db, dir)).toEqual([])
  })

  it('does not treat a marker for one observation as applying to another', () => {
    const { db } = setup()
    const first = withProposals(db, 'run-1', 'video-ads', 1)
    const second = withProposals(db, 'run-2', 'audience', 1)
    const dir = knowledgeDir({ 'video-ads.md': `<!-- knowledge-update: obs ${first} -->` })
    expect(pendingKnowledgeUpdates(db, dir).map((p) => p.id)).toEqual([second])
  })

  it('skips an observation that produced no proposals', () => {
    const { db } = setup()
    withProposals(db, 'run-1', 'video-ads', 0)
    expect(pendingKnowledgeUpdates(db, knowledgeDir())).toEqual([])
  })

  it('returns [] rather than throwing when the knowledge dir is missing', () => {
    const { db } = setup()
    withProposals(db, 'run-1', 'video-ads', 1)
    expect(pendingKnowledgeUpdates(db, join(tmpdir(), 'definitely-not-here-12345'))).toEqual([])
  })
})
