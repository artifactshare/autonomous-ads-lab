// One-off, budgeted H3 Max vs H3 Max Turbo comparison.
// Run from the repository root with:
// node --env-file=.env --import tsx src/generation/compare-h3.ts
import { openDb } from '../db/index.ts'
import { Logger } from '../logging/logger.ts'
import { CreativeRepo } from '../creative/repo.ts'
import { produceCreative } from '../creative/pipeline.ts'
import { appendJournal } from '../reporting/journal.ts'
import { H3MaxGenerator, H3MaxTurboGenerator, type H3Generator } from './fal/h3max.ts'

const SOURCE_CREATIVE_ID = 3
const DURATION_SEC = 8
const SEED = 20260903
const SPEC = { aspectRatio: '16:9', durationSec: DURATION_SEC, resolution: '768P' } as const

interface SourceCreative {
  concept: string
  hook: string
  message: string
  cta: string
  prompt: string
}

interface ComparisonRow {
  id: number
  generation_model: string | null
  generation_cost_usd: number | null
  generation_latency_ms: number | null
  generation_price_per_second_usd: number | null
  generation_pricing_checked_at: string | null
  expanded_prompt: string | null
  frame_overall: number | null
  frame_disqualified: number | null
  video_overall: number | null
  video_disqualified: number | null
  video_notes: string | null
}

const db = openDb()
const log = Logger.newRun('logs/h3-comparison.jsonl', db)
const repo = new CreativeRepo(db)

try {
  const source = db.prepare('select concept, hook, message, cta, prompt from creatives where id = ?').get(
    SOURCE_CREATIVE_ID,
  ) as SourceCreative | undefined
  if (!source) throw new Error(`source creative ${SOURCE_CREATIVE_ID} not found`)

  const generators: H3Generator[] = [new H3MaxGenerator(), new H3MaxTurboGenerator()]
  const allocated = generators.reduce((sum, gen) => sum + gen.estimateCostUsd({ ...SPEC, prompt: source.prompt, seed: SEED }), 0)
  const experimentId = repo.createExperiment({
    domain: 'x-video-ads',
    objective: 'compare H3 Max and H3 Max Turbo under identical eight-second generation conditions',
    hypothesis: 'H3 Max Turbo preserves deployable ad quality while reducing generation cost and latency',
    budgetAllocatedUsd: allocated,
  })

  const ids: number[] = []
  for (const gen of generators) {
    const before = (db.prepare('select coalesce(max(id), 0) id from creatives').get() as { id: number }).id
    try {
      const result = await produceCreative(
        db,
        log,
        {
          experimentId,
          parentCreativeId: SOURCE_CREATIVE_ID,
          role: 'challenger',
          ...source,
          seed: SEED,
          deploymentEligible: false,
        },
        SPEC,
        { hook: source.hook, brand: 'artifactshare.com', cta: source.cta },
        gen,
      )
      ids.push(result.creativeId)
    } catch (error) {
      const created = db.prepare('select max(id) id from creatives where experiment_id = ? and id > ?').get(
        experimentId,
        before,
      ) as { id: number | null }
      if (created.id !== null) ids.push(created.id)
      log.error('h3_comparison_candidate_failed', { model: gen.model, error: String(error) })
    }
  }

  const rows = ids.map((id) =>
    db.prepare(
      `select c.id, c.generation_model, c.generation_cost_usd, c.generation_latency_ms,
              c.generation_price_per_second_usd, c.generation_pricing_checked_at, c.expanded_prompt,
              e.overall_score frame_overall, e.disqualified frame_disqualified,
              v.overall_score video_overall, v.disqualified video_disqualified, v.critic_notes video_notes
       from creatives c
       left join evaluations e on e.id = (select id from evaluations where creative_id = c.id order by id desc limit 1)
       left join video_evaluations v on v.id = (select id from video_evaluations where creative_id = c.id order by id desc limit 1)
       where c.id = ?`,
    ).get(id) as ComparisonRow,
  )
  const baseline = rows.find((row) => row.generation_model === 'minimax/h3-max/text-to-video')
  const turbo = rows.find((row) => row.generation_model === 'minimax/h3-max-turbo/text-to-video')
  const qualified = (row: ComparisonRow | undefined) =>
    !!row && row.frame_disqualified === 0 && row.video_disqualified === 0 && row.frame_overall !== null && row.video_overall !== null
  const turboWithinTolerance =
    qualified(turbo) &&
    (!qualified(baseline) ||
      (turbo!.frame_overall! >= baseline!.frame_overall! - 0.5 &&
        turbo!.video_overall! >= baseline!.video_overall! - 0.5))
  const selected = turboWithinTolerance ? turbo : qualified(baseline) ? baseline : undefined
  const decision = selected
    ? `adopt ${selected.generation_model} for the next creative round`
    : 'adopt neither candidate; retain the existing H3 Max rollback path'
  const evidence = JSON.stringify({
    conditions: { ...SPEC, seed: SEED, prompt: source.prompt },
    candidates: rows,
    decisionRule: 'qualified; prefer Turbo when frame and full-video scores are each within 0.5 of H3 Max',
  })
  repo.recordLearning({
    experimentId,
    observation: `H3 Max vs H3 Max Turbo comparison at ${DURATION_SEC}s under identical input conditions`,
    hypothesis: 'H3 Max Turbo preserves deployable ad quality while reducing generation cost and latency',
    evidence,
    confidence: baseline && turbo ? 'medium' : 'insufficient_data',
    lesson: decision,
    recommendedAction: selected?.generation_model === turbo?.generation_model
      ? 'Use H3 Max Turbo by default; keep H3 Max selectable for rollback.'
      : 'Keep H3 Max as default and revisit Turbo with a later prompt.',
  })

  const spent = db.prepare(
    `select category, coalesce(sum(amount_usd), 0) amount from budget_ledger where experiment_id = ? group by category`,
  ).all(experimentId) as { category: string; amount: number }[]
  const describe = (row: ComparisonRow | undefined) => row
    ? `${row.generation_model}: creative #${row.id}, $${(row.generation_cost_usd ?? 0).toFixed(4)}, ${(row.generation_latency_ms ?? 0) / 1000}s, frame ${row.frame_overall ?? 'n/a'}, video ${row.video_overall ?? 'n/a'}, disqualified=${row.frame_disqualified === 1 || row.video_disqualified === 1}`
    : 'candidate did not complete'
  appendJournal({
    actor: 'H3 Max / Turbo comparison',
    done: [
      `同一prompt・seed・768P・16:9・${DURATION_SEC}秒でH3 MaxとH3 Max Turboを比較した。`,
      describe(baseline),
      describe(turbo),
      `判断: ${decision}`,
    ],
    spent: spent.map((item) => `${item.category}: $${item.amount.toFixed(6)}`),
    learnings: [selected ? `${selected.generation_model}を比較ルール上の採用候補とした。` : '両候補を採用できるだけの評価結果が揃わなかった。'],
    next: ['実配信するcreativeの成果は、生成モデル比較とは分けて通常の広告実験で観測する。'],
  })
  console.log(JSON.stringify({ experimentId, rows, decision, spent }, null, 2))
} finally {
  db.close()
}
