import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { BudgetController } from '../budget/controller.ts'
import type { Logger } from '../logging/logger.ts'
import { H3MaxGenerator } from '../generation/fal/h3max.ts'
import type { VideoSpec } from '../generation/types.ts'
import { extractFrames } from '../evaluation/frames.ts'
import { Evaluator } from '../evaluation/evaluator.ts'
import { GeminiVideoEvaluator, type VideoEvaluationScores } from '../evaluation/gemini-video.ts'
import { CreativeRepo, type NewCreative } from './repo.ts'
import { applyOverlay, type OverlayText } from './overlay.ts'

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
): Promise<{ creativeId: number; disqualified: boolean; overall: number; videoPath: string }> {
  const repo = new CreativeRepo(db)
  const budget = new BudgetController(db)
  const gen = new H3MaxGenerator()
  const evaluator = new Evaluator()
  // Instantiate before the paid video generation so a missing Gemini key
  // cannot leave us with a generated candidate that is ineligible to deploy.
  const videoEvaluator = new GeminiVideoEvaluator()

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

  // Evaluate from evenly spaced frames.
  const workDir = `data/creatives/${creativeId}`
  mkdirSync(workDir, { recursive: true })
  const rawPath = `${workDir}/raw.mp4`
  execFileSync('curl', ['-sfL', '-o', rawPath, result.assetUrl])
  // Readable copy (brand/CTA) is burned in post; the evaluation must see the
  // final ad, not the raw generation.
  const videoPath = overlay ? applyOverlay(rawPath, `${workDir}/final.mp4`, overlay) : rawPath
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
