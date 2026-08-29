import type Database from 'better-sqlite3'

export interface Observation {
  kind: 'mentions' | 'pain_points' | 'ad_trends' | 'techniques'
  query: string
  source: 'grok' | 'web'
  summary: string
  raw?: unknown
  costUsd: number
  runId: string
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
