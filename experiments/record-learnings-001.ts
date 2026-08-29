// Record experiment 001 learnings into the Experience DB.
import { openDb } from '../src/db/index.ts'

const db = openDb()
const insert = db.prepare(
  `insert into learnings (experiment_id, observation, hypothesis, evidence, confidence, lesson, recommended_action)
   values (?, ?, ?, ?, ?, ?, ?)`,
)
const rows: [string, string | null, string, string, string, string][] = [
  [
    'H3 Max garbles all rendered UI/on-screen text',
    'Any creative relying on generated readable text will be disqualified',
    'testgen video + candidate 1: every on-screen text unreadable (evaluator + human check)',
    'high',
    'Burn all must-read copy (brand, URL, CTA) in post with ffmpeg drawtext',
    'Keep overlay pipeline as the standard path',
  ],
  [
    'Retrying a paid generation on fetch failure re-charges',
    null,
    'Polling URL bug caused 4x submission of the same spec ($1.60 instead of $0.40)',
    'high',
    'Persist provider request_id immediately after submit; retry = collect, not re-submit',
    'Implemented in pipeline (recordSubmission before polling)',
  ],
  [
    'Creatives without visible product UI cap around 4/10 on product_clarity',
    'Showing the real product screen will raise product_clarity and cta_intent',
    'All 3 candidates of experiment 001 scored 3.5-4.5; evaluator consistently flagged missing product UI',
    'medium',
    'Abstract-UI-only prompts protect against garbled text but hide the product',
    'Next generation: composite real Artifact Share screen recording/screenshot into the ad',
  ],
]
for (const [observation, hypothesis, evidence, confidence, lesson, action] of rows) {
  insert.run(1, observation, hypothesis, evidence, confidence, lesson, action)
}
console.log('recorded', rows.length, 'learnings')
db.close()
