// One-off manual test generation: pnpm tsx src/generation/testgen.ts
// Goes through the Budget Controller like any paid action.
import { openDb } from '../db/index.ts'
import { BudgetController } from '../budget/controller.ts'
import { Logger } from '../logging/logger.ts'
import { H3MaxGenerator } from './fal/h3max.ts'

const log = Logger.newRun('logs/testgen.jsonl')
const db = openDb()
const budget = new BudgetController(db)
const gen = new H3MaxGenerator()

const spec = {
  prompt:
    'A sleek 15-second tech product ad concept, opening shot: a developer at a desk late at night, ' +
    'screen glowing, dragging a file into a chat window. Clean modern UI, cinematic lighting, ' +
    'subtle camera push-in, realistic style.',
  aspectRatio: '16:9',
  durationSec: 5,
  resolution: '768P',
  seed: 42,
} as const

const estimate = gen.estimateCostUsd(spec)
const auth = budget.authorize({
  category: 'creative',
  amountUsd: estimate,
  description: `testgen ${gen.model} ${spec.durationSec}s ${spec.resolution}`,
  runId: log.runId,
  idempotencyKey: `testgen-${new Date().toISOString().slice(0, 10)}`,
})
if (!auth.ok) {
  log.error('budget_denied', { reason: auth.reason })
  process.exit(1)
}
log.decision('generate_test_video', 'verify fal H3 Max pipeline end-to-end', { estimate })

const result = await gen.generate(spec)
log.info('generation_complete', {
  assetUrl: result.assetUrl,
  seed: result.seed,
  costUsd: result.costUsd,
  latencyMs: result.latencyMs,
})
console.log(`\nvideo: ${result.assetUrl}`)
db.close()
