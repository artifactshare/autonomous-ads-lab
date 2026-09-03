import type Database from 'better-sqlite3'

export interface Observation {
  kind: 'mentions' | 'ad_reactions' | 'pain_points' | 'ad_trends' | 'techniques'
  query: string
  source: 'grok' | 'web'
  summary: string
  raw?: unknown
  costUsd: number
  runId: string
}

export interface AdReaction {
  deploymentId: number
  creativeId: number
  parentPostUrl: string
  reactionUrl: string
  reactionType: 'reply' | 'quote'
  authorHandle?: string
  text: string
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  signals: {
    message_confusion: boolean
    ai_trust_concern: boolean
    value_objection: boolean
    question_or_interest: boolean
    positive: boolean
    spam_or_irrelevant: boolean
  }
  analysis: string
  observedAt: string
  source: 'grok' | 'reported'
}

export interface Technique {
  name: string
  source: string
  description: string
  applicableDomains?: string[]
  hypothesis: string
  implementationHint?: string
  evidence?: string
  confidence?: 'low' | 'medium' | 'high'
  observationId?: number
}

export class ResearchRepo {
  private db: Database.Database
  constructor(db: Database.Database) {
    this.db = db
  }

  recordObservation(o: Observation): number {
    const info = this.db
      .prepare(
        `insert into research_observations (kind, query, source, summary, raw, cost_usd, run_id)
         values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(o.kind, o.query, o.source, o.summary, o.raw ? JSON.stringify(o.raw) : null, o.costUsd, o.runId)
    return Number(info.lastInsertRowid)
  }

  addTechnique(t: Technique): number {
    const info = this.db
      .prepare(
        `insert into techniques
           (name, source, description, applicable_domains, hypothesis, implementation_hint, evidence, confidence, observation_id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        t.name,
        t.source,
        t.description,
        t.applicableDomains ? JSON.stringify(t.applicableDomains) : null,
        t.hypothesis,
        t.implementationHint ?? null,
        t.evidence ?? null,
        t.confidence ?? 'low',
        t.observationId ?? null,
      )
    return Number(info.lastInsertRowid)
  }

  /** Returns true only when this public post URL was newly inserted. */
  recordAdReaction(r: AdReaction): boolean {
    const info = this.db
      .prepare(
        `insert or ignore into ad_reactions
           (observed_at, deployment_id, creative_id, parent_post_url, reaction_url,
            reaction_type, author_handle, text, sentiment, signals, analysis, source)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        r.observedAt,
        r.deploymentId,
        r.creativeId,
        r.parentPostUrl,
        r.reactionUrl,
        r.reactionType,
        r.authorHandle ?? null,
        r.text,
        r.sentiment,
        JSON.stringify(r.signals),
        r.analysis,
        r.source,
      )
    return info.changes === 1
  }

  recordReactionCollection(input: {
    checkedDate: string
    deploymentId: number
    runId: string
    status: 'success' | 'failed' | 'unverified'
    observedCount?: number
    newCount?: number
    error?: string
  }): void {
    this.db
      .prepare(
        `insert into reaction_collection_runs
           (checked_date, deployment_id, run_id, status, observed_count, new_count, error)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(deployment_id, checked_date) do update set
           collected_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           run_id = excluded.run_id, status = excluded.status,
           observed_count = excluded.observed_count, new_count = excluded.new_count,
           error = excluded.error`,
      )
      .run(
        input.checkedDate,
        input.deploymentId,
        input.runId,
        input.status,
        input.observedCount ?? null,
        input.newCount ?? null,
        input.error ?? null,
      )
  }

  setTechniqueStatus(id: number, status: 'discovered' | 'experimental' | 'validated' | 'rejected', evidence?: string): void {
    this.db
      .prepare('update techniques set status = ?, evidence = coalesce(?, evidence) where id = ?')
      .run(status, evidence ?? null, id)
  }

  recentObservations(days = 7): Record<string, unknown>[] {
    return this.db
      .prepare(`select * from research_observations where created_at >= datetime('now', ?) order by id desc`)
      .all(`-${days} days`) as Record<string, unknown>[]
  }

  techniques(status?: string): Record<string, unknown>[] {
    return status
      ? (this.db.prepare('select * from techniques where status = ? order by id desc').all(status) as Record<string, unknown>[])
      : (this.db.prepare('select * from techniques order by id desc').all() as Record<string, unknown>[])
  }
}
