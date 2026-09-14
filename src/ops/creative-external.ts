// CLI: pnpm creative:external --video path.mp4 --experiment N --concept "..." --hook "..." [--model name] [--cost 0.30]
// Registers an externally produced video (e.g. keyframes + H3 Max Turbo) as a creative and runs the standard Gemini evaluation.
import { copyFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { openDb } from '../db/index.ts'
import { Logger } from '../logging/logger.ts'
import { CreativeRepo } from '../creative/repo.ts'
import { evaluateLocalVideo } from '../creative/pipeline.ts'

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined }
const video = arg('video'); const hook = arg('hook'); const experimentId = Number(arg('experiment'))
if (!video || !hook || !experimentId) { console.error('--video, --hook, --experiment are required'); process.exit(1) }
const db = openDb()
const log = Logger.newRun('logs/creative-external.jsonl', db)
const repo = new CreativeRepo(db)
const model = arg('model') ?? 'keyframes+minimax/h3-max-turbo'
const creative = {
  experimentId, role: 'challenger' as const, concept: arg('concept') ?? `external: ${model}`, hook,
  message: arg('message') ?? 'Humans point, agents edit. Same URL, any agent.', cta: arg('cta') ?? 'Try it free — artifactshare.com', prompt: `external:${model} hook="${hook}"`,
}
const creativeId = repo.createCreative(creative)
const dest = `data/creatives/${creativeId}/final.mp4`
mkdirSync(`data/creatives/${creativeId}`, { recursive: true }); copyFileSync(video, dest)
const durationSec = Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest], { encoding: 'utf8' })))
repo.recordSubmission(creativeId, model, `external-${creativeId}`)
repo.recordGeneration(creativeId, { assetUrl: dest, model, seed: null, settings: { source: video }, costUsd: Number(arg('cost') ?? 0), latencyMs: 0, raw: null })
const r = await evaluateLocalVideo(db, log.child({ creativeId, experimentId }), creativeId, { ...creative, assetUrl: dest }, dest, durationSec)
console.log(JSON.stringify(r))
