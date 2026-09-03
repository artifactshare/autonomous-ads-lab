// Backfill the first known public ad reply reported on 2026-09-03.
// Idempotent by reaction_url.
import { openDb } from '../db/index.ts'
import { CreativeRepo } from '../creative/repo.ts'
import { ResearchRepo } from './repo.ts'

const PARENT = 'https://x.com/artifactshare_/status/2093628999910187191'
const REACTION = 'https://x.com/kralseienjoy/status/2095128322963366335'
const TEXT = 'did you write this with ai to because it makes no fucking sense'

const db = openDb()
try {
  const deployment = db.prepare(
    `select d.id deployment_id, d.creative_id, c.experiment_id
     from deployments d join creatives c on c.id = d.creative_id
     where d.post_url = ?`,
  ).get(PARENT) as { deployment_id: number; creative_id: number; experiment_id: number } | undefined
  if (!deployment) throw new Error(`deployment not found for ${PARENT}`)

  const inserted = new ResearchRepo(db).recordAdReaction({
    deploymentId: deployment.deployment_id,
    creativeId: deployment.creative_id,
    parentPostUrl: PARENT,
    reactionUrl: REACTION,
    reactionType: 'reply',
    authorHandle: 'kralseienjoy',
    text: TEXT,
    sentiment: 'negative',
    signals: {
      message_confusion: true,
      ai_trust_concern: true,
      value_objection: false,
      question_or_interest: false,
      positive: false,
      spam_or_irrelevant: false,
    },
    analysis: 'The reply explicitly says the ad makes no sense and asks whether AI wrote it. This supports message-confusion and AI-trust-concern signals, but one reply does not establish prevalence or causality.',
    observedAt: new Date().toISOString(),
    source: 'reported',
  })
  if (inserted) {
    new CreativeRepo(db).recordLearning({
      experimentId: deployment.experiment_id,
      observation: 'One public reply to creative #3 explicitly said the ad made no sense and questioned whether AI wrote it.',
      hypothesis: 'The version-chaos copy or AI-generated presentation may be reducing comprehension and trust for some viewers.',
      evidence: JSON.stringify({ parentPostUrl: PARENT, reactionUrl: REACTION, text: TEXT }),
      confidence: 'low',
      lesson: 'Treat this as a clarity/trust probe, not proof that the ad or audience premise has failed.',
      recommendedAction: 'Use plain workflow language in the next creative and monitor whether message-confusion and AI-trust signals recur.',
    })
  }
  console.log(JSON.stringify({ inserted, deploymentId: deployment.deployment_id, creativeId: deployment.creative_id }))
} finally {
  db.close()
}
