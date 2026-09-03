import type Database from 'better-sqlite3'
import type { GenerationResult } from '../generation/types.ts'
import type { EvaluationScores } from '../evaluation/evaluator.ts'
import type { GeminiVideoEvaluationResult } from '../evaluation/gemini-video.ts'

export interface NewExperiment {
  domain: string
  objective: string
  hypothesis: string
  budgetAllocatedUsd: number
}

export interface NewCreative {
  experimentId: number
  parentCreativeId?: number
  role: 'champion' | 'mutation' | 'challenger'
  concept: string
  hook: string
  message: string
  cta: string
  prompt: string
  seed?: number
}

export class CreativeRepo {
  private db: Database.Database
  constructor(db: Database.Database) {
    this.db = db
  }

  createExperiment(e: NewExperiment): number {
    const info = this.db
      .prepare(
        `insert into experiments (status, domain, objective, hypothesis, budget_allocated_usd)
         values ('running', ?, ?, ?, ?)`,
      )
      .run(e.domain, e.objective, e.hypothesis, e.budgetAllocatedUsd)
    return Number(info.lastInsertRowid)
  }

  createCreative(c: NewCreative): number {
    const info = this.db
      .prepare(
        `insert into creatives
           (experiment_id, parent_creative_id, role, concept, hook, message, cta, prompt, seed)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        c.experimentId,
        c.parentCreativeId ?? null,
        c.role,
        c.concept,
        c.hook,
        c.message,
        c.cta,
        c.prompt,
        c.seed ?? null,
      )
    return Number(info.lastInsertRowid)
  }

  /** Persist provider job id immediately after submit, before any polling. */
  recordSubmission(creativeId: number, model: string, requestId: string): void {
    this.db
      .prepare('update creatives set generation_model = ?, generation_request_id = ? where id = ?')
      .run(model, requestId, creativeId)
  }

  recordGeneration(creativeId: number, r: GenerationResult): void {
    this.db
      .prepare(
        `update creatives set expanded_prompt = ?, seed = ?, generation_settings = ?,
           asset_url = ?, generation_cost_usd = ?, generation_latency_ms = ? where id = ?`,
      )
      .run(
        typeof (r.raw as { expanded_prompt?: string })?.expanded_prompt === 'string'
          ? (r.raw as { expanded_prompt: string }).expanded_prompt
          : null,
        r.seed,
        JSON.stringify(r.settings),
        r.assetUrl,
        r.costUsd,
        r.latencyMs,
        creativeId,
      )
  }

  recordEvaluation(creativeId: number, harnessVersion: string, s: EvaluationScores): number {
    const info = this.db
      .prepare(
        `insert into evaluations
           (creative_id, harness_version, hook_score, product_clarity, message_clarity,
            product_salience, cta_intent, visual_quality, artifact_score, overall_score,
            disqualified, failure_modes, critic_notes)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        creativeId,
        harnessVersion,
        s.hook_score,
        s.product_clarity,
        s.message_clarity,
        s.product_salience,
        s.cta_intent,
        s.visual_quality,
        s.artifact_score,
        s.overall_score,
        s.disqualified ? 1 : 0,
        JSON.stringify(s.failure_modes),
        s.critic_notes,
      )
    return Number(info.lastInsertRowid)
  }

  recordVideoEvaluation(creativeId: number, result: GeminiVideoEvaluationResult): number {
    const s = result.scores
    const info = this.db
      .prepare(
        `insert into video_evaluations
           (creative_id, model, harness_version, content_summary, message_understood,
            temporal_coherence, motion_quality, audio_quality, audio_visual_sync,
            narrative_clarity, artifact_score, overall_score, disqualified,
            failure_modes, key_moments, critic_notes, input_tokens, output_tokens,
            thought_tokens, cost_usd)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        creativeId,
        result.model,
        result.harnessVersion,
        s.content_summary,
        s.message_understood,
        s.temporal_coherence,
        s.motion_quality,
        s.audio_quality,
        s.audio_visual_sync,
        s.narrative_clarity,
        s.artifact_score,
        s.overall_score,
        s.disqualified ? 1 : 0,
        JSON.stringify(s.failure_modes),
        JSON.stringify(s.key_moments),
        s.critic_notes,
        result.usage.inputTokens,
        result.usage.outputTokens,
        result.usage.thoughtTokens,
        result.costUsd,
      )
    return Number(info.lastInsertRowid)
  }

  /** Creatives whose submit succeeded but whose result was never collected. */
  pendingSubmissions(): { id: number; generation_request_id: string }[] {
    return this.db
      .prepare(
        `select id, generation_request_id from creatives
         where generation_request_id is not null and asset_url is null`,
      )
      .all() as { id: number; generation_request_id: string }[]
  }
}
