import { describe, expect, it } from 'vitest'
import { CreativeRepo } from '../src/creative/repo.ts'
import { openDb } from '../src/db/index.ts'
import { Logger } from '../src/logging/logger.ts'
import { renderLivingReportHtml } from '../src/reporting/html.ts'
import { parseReactionResponse, recordParsedReactions } from '../src/research/reactions.ts'
import { ResearchRepo } from '../src/research/repo.ts'

const responseJson = JSON.stringify({
  status: 'verified',
  reactions: [{
    url: 'https://x.com/person/status/123',
    type: 'reply',
    text: 'I do not understand this ad',
    sentiment: 'negative',
    signals: { message_confusion: true, ai_trust_concern: false },
    analysis: 'The reply explicitly reports confusion.',
  }],
})

describe('ad reaction collection', () => {
  it('parses structured reply evidence and fills absent signals with false', () => {
    const parsed = parseReactionResponse(responseJson)
    expect(parsed.status).toBe('verified')
    expect(parsed.reactions[0]?.signals.message_confusion).toBe(true)
    expect(parsed.reactions[0]?.signals.positive).toBe(false)
  })

  it('rejects unverifiable reaction URLs', () => {
    expect(() => parseReactionResponse(responseJson.replace('https://x.com/person/status/123', 'https://example.com/123'))).toThrow('invalid reaction URL')
  })

  it('deduplicates reactions and records a verified zero separately from failure', () => {
    const db = openDb(':memory:')
    const repo = new CreativeRepo(db)
    const experimentId = repo.createExperiment({ domain: 'x', objective: 'x', hypothesis: 'x', budgetAllocatedUsd: 1 })
    const creativeId = repo.createCreative({ experimentId, role: 'challenger', concept: 'c', hook: 'h', message: 'm', cta: 'c', prompt: 'p' })
    const deploymentId = Number(db.prepare(
      `insert into deployments (creative_id, status, post_url) values (?, 'active', ?)`,
    ).run(creativeId, 'https://x.com/artifactshare_/status/999').lastInsertRowid)
    const log = Logger.newRun('/tmp/reactions-test.jsonl')
    const target = { deploymentId, creativeId, postUrl: 'https://x.com/artifactshare_/status/999' }
    expect(recordParsedReactions(db, log, target, parseReactionResponse(responseJson), '2026-09-03')).toEqual({ observed: 1, inserted: 1 })
    expect(recordParsedReactions(db, log, target, parseReactionResponse(responseJson), '2026-09-03')).toEqual({ observed: 1, inserted: 0 })
    expect((db.prepare('select count(*) n from ad_reactions').get() as { n: number }).n).toBe(1)

    recordParsedReactions(db, log, target, { status: 'verified', reactions: [] }, '2026-09-04')
    const zero = db.prepare('select status, observed_count from reaction_collection_runs where checked_date = ?').get('2026-09-04') as Record<string, unknown>
    expect(zero).toEqual(expect.objectContaining({ status: 'success', observed_count: 0 }))
    new ResearchRepo(db).recordReactionCollection({ checkedDate: '2026-09-05', deploymentId, runId: 'x', status: 'failed', error: 'API unavailable' })
    const failed = db.prepare('select status, observed_count from reaction_collection_runs where checked_date = ?').get('2026-09-05') as Record<string, unknown>
    expect(failed).toEqual(expect.objectContaining({ status: 'failed', observed_count: null }))
    expect(renderLivingReportHtml(db)).toContain('I do not understand this ad')
    db.close()
  })

  it('does not persist guessed posts from an unverified collection', () => {
    const db = openDb(':memory:')
    const repo = new CreativeRepo(db)
    const experimentId = repo.createExperiment({ domain: 'x', objective: 'x', hypothesis: 'x', budgetAllocatedUsd: 1 })
    const creativeId = repo.createCreative({ experimentId, role: 'challenger', concept: 'c', hook: 'h', message: 'm', cta: 'c', prompt: 'p' })
    const deploymentId = Number(db.prepare(`insert into deployments (creative_id, status, post_url) values (?, 'active', ?)`).run(creativeId, 'https://x.com/artifactshare_/status/999').lastInsertRowid)
    const parsed = parseReactionResponse(responseJson) as ReturnType<typeof parseReactionResponse>
    parsed.status = 'unverified'
    const result = recordParsedReactions(db, Logger.newRun('/tmp/reactions-unverified-test.jsonl'), { deploymentId, creativeId, postUrl: 'https://x.com/artifactshare_/status/999' }, parsed, '2026-09-03')
    expect(result).toEqual({ observed: 0, inserted: 0 })
    expect((db.prepare('select count(*) n from ad_reactions').get() as { n: number }).n).toBe(0)
    expect((db.prepare('select status from reaction_collection_runs').get() as { status: string }).status).toBe('unverified')
    db.close()
  })
})
