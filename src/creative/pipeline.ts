import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { BudgetController } from '../budget/controller.ts'
import type { Logger } from '../logging/logger.ts'
import { H3MaxGenerator } from '../generation/fal/h3max.ts'
import type { VideoSpec } from '../generation/types.ts'
import { extractFrames } from '../evaluation/frames.ts'
import { Evaluator } from '../evaluation/evaluator.ts'
import { CreativeRepo, type NewCreative } from './repo.ts'

/**
 * Generate + evaluate one creative, end to end, with budget authorization,
 * crash-recoverable submission, and full DB recording.
 */
export async function produceCreative(
  db: Database.Database,
  log: Logger,
  creative: NewCreative,
  video: Omit<VideoSpec, 'prompt' | 'seed'>,
): Promise<{ creativeId: number; disqualified: boolean; overall: number }> {
  const repo = new CreativeRepo(db)
  const budget = new BudgetController(db)
  const gen = new H3MaxGenerator()
  const evaluator = new Evaluator()

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
  const videoPath = `${workDir}/video.mp4`
  execFileSync('curl', ['-sfL', '-o', videoPath, result.assetUrl])
  const frames = extractFrames(videoPath, `${workDir}/frames`)
  const scores = await evaluator.evaluate(frames, creative)
  repo.recordEvaluation(creativeId, evaluator.harnessVersion, scores)
  clog.info('evaluation_complete', {
    overall: scores.overall_score,
    disqualified: scores.disqualified,
    failureModes: scores.failure_modes,
  })

  return { creativeId, disqualified: scores.disqualified, overall: scores.overall_score }
}
