// CLI: pnpm creative:footage --hook "Still deploying to Vercel just to show a doc?" --concept "..." [--end "..."] [--experiment N] [--render-only out.mp4]
// Renders a footage-mode creative (real loop recording + hook card) and evaluates it like any other creative.
import { openDb } from '../db/index.ts'
import { Logger } from '../logging/logger.ts'
import { CreativeRepo } from '../creative/repo.ts'
import { adPropsFor, produceFootageCreative, renderAd } from '../creative/footage.ts'

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined }
const hook = arg('hook'); if (!hook) { console.error('--hook is required'); process.exit(1) }
if (arg('render-only')) { renderAd(adPropsFor({ hook, endTitle: arg('end') }), arg('render-only')!); console.log('rendered', arg('render-only')); process.exit(0) }
const db = openDb()
const log = Logger.newRun('logs/creative-footage.jsonl', db)
const repo = new CreativeRepo(db)
const experimentId = arg('experiment')
  ? Number(arg('experiment'))
  : repo.createExperiment({ domain: 'x-video-ads', objective: 'footage-mode hooks: real loop recording, hook names the workaround (docs/strategy.md P9, audience.md)', hypothesis: 'A hook that names the viewer\'s current workaround (Vercel deploy, Slack versions, editing agent code) lands more sessions per dollar than an abstract pain hook, given the same real footage', budgetAllocatedUsd: 0 })
const r = await produceFootageCreative(db, log, {
  experimentId, role: 'challenger', concept: arg('concept') ?? `hook: ${hook}`, hook, message: arg('message') ?? 'Humans point, agents edit. Same URL, any agent.', cta: arg('end') ?? 'Share once. Review at one URL. Any agent.', prompt: `footage:loop-2026-09-14 hook="${hook}"`,
}, { hook, endTitle: arg('end') })
console.log(JSON.stringify(r))
db.close()
