// Re-apply overlays for experiment 001 with the corrected domain (artifactshare.com).
import { applyOverlay } from '../src/creative/overlay.ts'

const fixes = [
  { id: 1, hook: 'AI made the file. Why are you still uploading it?', cta: 'Share one URL instead' },
  { id: 2, hook: 'One URL. Comments in. AI fixes. Same URL.', cta: 'Try Artifact Share' },
  { id: 3, hook: 'final_v2. final_v3. final_final. final_v7.', cta: 'One URL that updates - artifactshare.com' },
]
for (const f of fixes) {
  applyOverlay(`data/creatives/${f.id}/raw.mp4`, `data/creatives/${f.id}/final.mp4`, {
    hook: f.hook,
    brand: 'artifactshare.com',
    cta: f.cta,
  })
  console.log(`re-overlaid creative ${f.id}`)
}
