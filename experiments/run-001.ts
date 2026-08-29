// Experiment 001: control hypothesis, first real candidate generation.
// pnpm tsx experiments/run-001.ts
import { openDb } from '../src/db/index.ts'
import { Logger } from '../src/logging/logger.ts'
import { CreativeRepo } from '../src/creative/repo.ts'
import { produceCreative } from '../src/creative/pipeline.ts'

const db = openDb()
const log = Logger.newRun('logs/run-001.jsonl')
const repo = new CreativeRepo(db)

const experimentId = repo.createExperiment({
  domain: 'artifact_share',
  objective: 'First real X ad: find a creative that makes AI-native devs click',
  hypothesis:
    'Pain-first framing ("AI made the file, sharing is still manual") beats product-feature framing for AI coding agent users',
  budgetAllocatedUsd: 1.5,
})
log.child({ experimentId }).info('experiment_created')

// Visual prompts deliberately avoid readable UI text (H3 Max garbles it);
// all copy is burned in post via overlay.
const brand = 'artifactshare.net'
const candidates = [
  {
    concept: 'Pain montage: the manual sharing loop',
    hook: 'AI made the file. Why are you still uploading it?',
    message: 'Sharing AI output is still download, upload, resend',
    cta: 'Share one URL instead',
    prompt:
      'Cinematic ad, live action. A tired developer at a desk at night repeatedly performs the same tedious loop: dragging a file from a folder to an email window, attaching it, sending, then doing it again with a slightly different file. Quick cuts, escalating rhythm, mild absurdist comedy of repetition. Frustrated sigh. Warm desk lamp against cool monitor glow. No readable text on screens, screens show only abstract blurred UI shapes.',
  },
  {
    concept: 'Transformation: one link, live updates',
    hook: 'One URL. Comments in. AI fixes. Same URL.',
    message: 'The artifact lives at one link and keeps improving',
    cta: 'Try Artifact Share',
    prompt:
      'Cinematic ad, live action with subtle motion graphics. A developer sends a single glowing link from a laptop; the link floats to three teammates on phones and laptops who react and leave floating comment bubbles (abstract shapes, no readable text); the original page visibly refreshes and improves in place with a satisfying pulse of light. Clean bright modern office, optimistic mood, smooth camera moves. No readable text anywhere, abstract UI only.',
  },
  {
    concept: 'Absurdist: final_v7 file multiplication',
    hook: 'final_v2. final_v3. final_final. final_v7.',
    message: 'Version-suffix chaos is a choice. So is one living URL.',
    cta: 'One URL that updates - artifactshare.net',
    prompt:
      'Comedic cinematic ad. A desktop folder overflows: duplicate file icons multiply absurdly across the screen and spill out of the monitor onto the physical desk as physical paper files, stacking into a teetering tower while a developer watches in deadpan horror. Practical-effect surrealism, crisp lighting, wide angle final shot of the buried desk. No readable text, file icons are abstract.',
  },
] as const

const results = []
for (const c of candidates) {
  const r = await produceCreative(
    db,
    log,
    { experimentId, role: 'challenger', ...c },
    { aspectRatio: '16:9', durationSec: 5, resolution: '768P' },
    { hook: c.hook, brand, cta: c.cta },
  )
  results.push({ ...r, concept: c.concept })
}

const qualified = results.filter((r) => !r.disqualified)
const winner = qualified.sort((a, b) => b.overall - a.overall)[0]
log.decision(
  winner ? `winner_creative_${winner.creativeId}` : 'no_winner',
  winner
    ? `highest overall (${winner.overall}) among ${qualified.length} qualified of ${results.length}`
    : 'all candidates disqualified',
  { results },
)
console.log(JSON.stringify({ results, winner }, null, 2))
db.close()
