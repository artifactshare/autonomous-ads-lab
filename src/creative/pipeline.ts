import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { BudgetController } from '../budget/controller.ts'
import type { Logger } from '../logging/logger.ts'
import { H3Generator, H3MaxTurboGenerator } from '../generation/fal/h3max.ts'
import type { VideoSpec } from '../generation/types.ts'
import { extractFrames } from '../evaluation/frames.ts'
import { Evaluator } from '../evaluation/evaluator.ts'
import { GeminiVideoEvaluator, type VideoEvaluationScores } from '../evaluation/gemini-video.ts'
import { CreativeRepo, type NewCreative } from './repo.ts'
import { applyOverlay, assertOverlayToolchain, type OverlayText } from './overlay.ts'

interface CreativeForEvaluation extends NewCreative {
  assetUrl: string
}

/**
 * Generate + evaluate one creative, end to end, with budget authorization,
 * crash-recoverable submission, and full DB recording.
 */
export async function produceCreative(
  db: Database.Database,
  log: Logger,
  creative: NewCreative,
  video: Omit<VideoSpec, 'prompt' | 'seed'>,
  overlay?: OverlayText,
  gen: H3Generator = new H3MaxTurboGenerator(),
  preflight: () => unknown = assertOverlayToolchain,
): Promise<{ creativeId: number; disqualified: boolean; overall: number; videoPath: string }> {
  assertArtifactShareDomain(creative, overlay)
  preflight()
  const repo = new CreativeRepo(db)
  const budget = new BudgetController(db)
  // Instantiate before the paid video generation so a missing Gemini key
  // cannot leave us with a generated candidate that is ineligible to deploy.
  new GeminiVideoEvaluator()

  const creativeId = repo.createCreative(creative)
  const clog = log.child({ creativeId, experimentId: creative.experimentId })

  const spec: VideoSpec = { ...video, prompt: creative.prompt, seed: creative.seed }
  const estimate = gen.estimateCostUsd(spec)
  const auth = budget.authorize({
    category: 'creative',
    amountUsd: estimate,
    description: `generate ${gen.model} ${spec.durationSec}s for creative ${creativeId}`,
    runId: clog.runId,
    experimentId: creative.experimentId,
    creativeId,
    idempotencyKey: `gen-creative-${creativeId}`,
  })
  if (!auth.ok) {
    clog.error('budget_denied', { reason: auth.reason })
    throw new Error(`budget denied: ${auth.reason}`)
  }

  clog.decision('generate_creative', `role=${creative.role} estimate=$${estimate.toFixed(2)}`)
  const requestId = await gen.submit(spec)
  repo.recordSubmission(creativeId, gen.model, requestId)
  const result = await gen.awaitResult(requestId, spec)
  repo.recordGeneration(creativeId, result)
  clog.info('generation_complete', { assetUrl: result.assetUrl, latencyMs: result.latencyMs })

  return evaluateCreativeAsset(db, log, creativeId, { ...creative, assetUrl: result.assetUrl }, video.durationSec, overlay)
}

/** Resume post-processing/evaluation for a paid generation already in the DB. */
export async function resumeCreativeEvaluation(
  db: Database.Database,
  log: Logger,
  creativeId: number,
  durationSec: number,
  overlay?: OverlayText,
  preflight: () => unknown = assertOverlayToolchain,
): Promise<{ creativeId: number; disqualified: boolean; overall: number; videoPath: string }> {
  preflight()
  const row = db
    .prepare(
      `select experiment_id, parent_creative_id, role, concept, hook, message, cta,
              prompt, seed, asset_url
       from creatives where id = ? and asset_url is not null`,
    )
    .get(creativeId) as {
      experiment_id: number
      parent_creative_id: number | null
      role: NewCreative['role']
      concept: string
      hook: string
      message: string
      cta: string
      prompt: string
      seed: number | null
      asset_url: string
    } | undefined
  if (!row) throw new Error(`creative ${creativeId} has no generated asset to resume`)
  const evaluated = db.prepare('select 1 from evaluations where creative_id = ?').get(creativeId)
  if (evaluated) throw new Error(`creative ${creativeId} is already evaluated`)

  return evaluateCreativeAsset(
    db,
    log,
    creativeId,
    {
      experimentId: row.experiment_id,
      parentCreativeId: row.parent_creative_id ?? undefined,
      role: row.role,
      concept: row.concept,
      hook: row.hook,
      message: row.message,
      cta: row.cta,
      prompt: row.prompt,
      seed: row.seed ?? undefined,
      assetUrl: row.asset_url,
    },
    durationSec,
    overlay,
  )
}

async function evaluateCreativeAsset(
  db: Database.Database,
  log: Logger,
  creativeId: number,
  creative: CreativeForEvaluation,
  durationSec: number,
  overlay?: OverlayText,
): Promise<{ creativeId: number; disqualified: boolean; overall: number; videoPath: string }> {
  const repo = new CreativeRepo(db)
  const budget = new BudgetController(db)
  const evaluator = new Evaluator()
  const videoEvaluator = new GeminiVideoEvaluator()
  const clog = log.child({ creativeId, experimentId: creative.experimentId })

  // Evaluate from evenly spaced frames.
  const workDir = `data/creatives/${creativeId}`
  mkdirSync(workDir, { recursive: true })
  const rawPath = `${workDir}/raw.mp4`
  execFileSync('curl', ['-sfL', '-o', rawPath, creative.assetUrl])
  // Readable copy (brand/CTA) is burned in post; the evaluation must see the
  // final ad, not the raw generation.
  const videoPath = overlay ? applyOverlay(rawPath, `${workDir}/final.mp4`, overlay, durationSec) : rawPath
  const frames = extractFrames(videoPath, `${workDir}/frames`)
  const frameScores = await evaluator.evaluate(frames, creative)

  const videoEstimate = videoEvaluator.estimateCostUsd()
  const videoAuth = budget.authorize({
    category: 'ai',
    amountUsd: videoEstimate,
    description: `evaluate complete video with ${videoEvaluator.model} for creative ${creativeId}`,
    runId: clog.runId,
    experimentId: creative.experimentId,
    creativeId,
    idempotencyKey: `video-eval-${videoEvaluator.harnessVersion}-creative-${creativeId}`,
  })
  if (!videoAuth.ok) {
    clog.error('video_evaluation_budget_denied', { reason: videoAuth.reason })
    throw new Error(`video evaluation budget denied: ${videoAuth.reason}`)
  }
  if (videoAuth.duplicate) {
    throw new Error(`video evaluation was already authorized for creative ${creativeId}; refusing a duplicate paid call`)
  }

  let videoResult
  try {
    videoResult = await videoEvaluator.evaluate(videoPath, creative)
  } catch (err) {
    // Keep the conservative estimate charged: a failed or timed-out request
    // may still have incurred provider cost.
    clog.error('video_evaluation_failed', { model: videoEvaluator.model, error: String(err) })
    throw err
  }
  repo.recordVideoEvaluation(creativeId, videoResult)
  const rec = budget.reconcile(videoAuth.ledgerId, videoResult.costUsd)
  if (!rec.ok) clog.warn('video_evaluation_budget_reconcile_failed', { reason: rec.reason })

  const scores = applyVideoHardGate(frameScores, videoResult.scores)
  repo.recordEvaluation(
    creativeId,
    `${evaluator.harnessVersion}+${videoEvaluator.harnessVersion}`,
    scores,
  )
  clog.info('video_evaluation_complete', {
    model: videoResult.model,
    overall: videoResult.scores.overall_score,
    disqualified: videoResult.scores.disqualified,
    costUsd: videoResult.costUsd,
    usage: videoResult.usage,
  })
  clog.info('evaluation_complete', {
    overall: scores.overall_score,
    disqualified: scores.disqualified,
    failureModes: scores.failure_modes,
  })

  return { creativeId, disqualified: scores.disqualified, overall: scores.overall_score, videoPath }
}

/** Fail before creative creation or paid generation when ad copy points at a stale domain. */
export function assertArtifactShareDomain(creative: NewCreative, overlay?: OverlayText): void {
  const text = [creative.hook, creative.message, creative.cta, overlay?.hook, overlay?.brand, overlay?.cta]
    .filter(Boolean)
    .join(' ')
  const domains = text.match(/artifactshare\.[a-z0-9.-]+/gi) ?? []
  const invalid = domains.find((domain) => domain.toLowerCase() !== 'artifactshare.com')
  if (invalid) throw new Error(`creative copy contains stale or conflicting domain: ${invalid}`)
}

/**
 * Keep the established frame scores comparable with historical creatives.
 * Gemini adds a conservative hard gate for defects that only exist over time;
 * its independent scores stay in video_evaluations for later calibration.
 */
export function applyVideoHardGate(
  frameScores: import('../evaluation/evaluator.ts').EvaluationScores,
  videoScores: VideoEvaluationScores,
): import('../evaluation/evaluator.ts').EvaluationScores {
  if (!videoScores.disqualified) return frameScores
  return {
    ...frameScores,
    disqualified: true,
    failure_modes: [
      ...frameScores.failure_modes,
      ...videoScores.failure_modes.map((failure) => `video: ${failure}`),
    ],
    critic_notes: `${frameScores.critic_notes}\nGemini full-video gate: ${videoScores.critic_notes}`,
  }
}
