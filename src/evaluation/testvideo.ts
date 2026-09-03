// One-off full-video inspection, budgeted and recorded. Usage:
// node --env-file=.env --import tsx src/evaluation/testvideo.ts 3 data/creatives/3/final.mp4 [attempt]
import { BudgetController } from '../budget/controller.ts'
import { CreativeRepo } from '../creative/repo.ts'
import { openDb } from '../db/index.ts'
import { Logger } from '../logging/logger.ts'
import { GeminiVideoEvaluator } from './gemini-video.ts'

const creativeId = Number(process.argv[2])
const videoPath = process.argv[3]
const attempt = process.argv[4] ?? '1'
if (!Number.isInteger(creativeId) || creativeId <= 0 || !videoPath) {
  throw new Error('usage: testvideo.ts <creative-id> <video.mp4> [attempt]')
}
if (!/^[a-zA-Z0-9_-]+$/.test(attempt)) throw new Error('attempt must be alphanumeric')

const db = openDb()
const creative = db
  .prepare('select id, experiment_id, concept, hook, message, cta from creatives where id = ?')
  .get(creativeId) as
  | { id: number; experiment_id: number; concept: string; hook: string; message: string; cta: string }
  | undefined
if (!creative) throw new Error(`creative ${creativeId} does not exist`)

const log = Logger.newRun('logs/gemini-video-eval.jsonl', db)
const evaluator = new GeminiVideoEvaluator()
const budget = new BudgetController(db)
const auth = budget.authorize({
  category: 'ai',
  amountUsd: evaluator.estimateCostUsd(),
  description: `manual complete-video evaluation with ${evaluator.model} for creative ${creativeId}`,
  runId: log.runId,
  experimentId: creative.experiment_id,
  creativeId,
  idempotencyKey: `manual-${evaluator.harnessVersion}-creative-${creativeId}-attempt-${attempt}`,
})
if (!auth.ok) throw new Error(`video evaluation budget denied: ${auth.reason}`)
if (auth.duplicate) throw new Error(`manual video evaluation was already attempted for creative ${creativeId}`)

try {
  const result = await evaluator.evaluate(videoPath, creative)
  new CreativeRepo(db).recordVideoEvaluation(creativeId, result)
  const rec = budget.reconcile(auth.ledgerId, result.costUsd)
  if (!rec.ok) log.warn('video_evaluation_budget_reconcile_failed', { reason: rec.reason })
  log.info('video_evaluation_complete', {
    creativeId,
    model: result.model,
    overall: result.scores.overall_score,
    disqualified: result.scores.disqualified,
    costUsd: result.costUsd,
    usage: result.usage,
  })
  console.log(
    JSON.stringify(
      { model: result.model, scores: result.scores, usage: result.usage, costUsd: result.costUsd },
      null,
      2,
    ),
  )
} catch (err) {
  log.error('video_evaluation_failed', { creativeId, model: evaluator.model, error: String(err) })
  throw err
} finally {
  db.close()
}
