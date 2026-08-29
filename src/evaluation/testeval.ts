// One-off: evaluate the existing test video. pnpm tsx src/evaluation/testeval.ts
import { extractFrames } from './frames.ts'
import { Evaluator } from './evaluator.ts'

const frames = extractFrames('data/testgen-01a04c9d.mp4', 'data/testeval-frames')
console.log(`extracted ${frames.length} frames`)
const scores = await new Evaluator().evaluate(frames, {
  concept: 'Late-night developer workflow pain: sharing AI-made files is still manual',
  hook: 'AI made the file. Why are you still uploading it?',
  message: 'Share one URL. Get comments. Let AI fix it. Same URL updates.',
  cta: 'Try Artifact Share',
})
console.log(JSON.stringify(scores, null, 2))
