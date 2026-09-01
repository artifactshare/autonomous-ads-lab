// Daily decide step: continue / mutate the running campaign based on real
// performance. This is the OODA "decide+act" v1:
//
// - Needs at least MIN_DAYS_EARLY days of metrics to judge anything.
// - Generates the next creative generation when the deployed creative has
//   MIN_DAYS_FULL days of data, or earlier when CTR is clearly dead.
// - Generation = hypothesis LLM (fable, opus fallback via modelFor) proposes
//   challengers grounded in the knowledge library + our own results; each is
//   produced and evaluated through the normal budget-guarded pipeline.
// - Deployment is handled by the ads-lab-bridge repo's morning run: it finds
//   the undeployed winner in this DB and swaps the ad in Ads Manager via the
//   logged-in browser (Ads API approval pending). While an evaluated-but-
//   undeployed challenger exists, no new round starts.
import { query } from '@anthropic-ai/claude-agent-sdk'
import type Database from 'better-sqlite3'
import type { Logger } from '../logging/logger.ts'
import { modelFor } from '../llm/policy.ts'
import { loadKnowledge } from '../llm/knowledge.ts'
import { CreativeRepo } from '../creative/repo.ts'
import { produceCreative } from '../creative/pipeline.ts'

const MIN_DAYS_EARLY = 3
const MIN_DAYS_FULL = 7
const EARLY_KILL_CTR = 0.0015 // 0.15%: clearly dead for a traffic objective
const CHALLENGERS = 3
const VIDEO = { aspectRatio: '16:9', durationSec: 5, resolution: '768P' } as const
const BRAND = 'artifactshare.com'

interface ProposedCreative {
  concept: string
  hook: string
  message: string
  cta: string
  prompt: string
}

export async function decideAndAct(db: Database.Database, log: Logger): Promise<string[]> {
  const dep = db
    .prepare(
      `select d.creative_id, d.started_at from deployments d where d.status = 'active' order by d.id desc limit 1`,
    )
    .get() as { creative_id: number; started_at: string | null } | undefined
  if (!dep) return ['decide: no active deployment; nothing to optimize']

  const pending = db
    .prepare(
      `select count(*) as n from creatives c
       join evaluations e on e.creative_id = c.id
       where c.id > ? and e.disqualified = 0
         and c.id not in (select creative_id from deployments)`,
    )
    .get(dep.creative_id) as { n: number }
  if (pending.n > 0) {
    return [`decide: ${pending.n} evaluated challenger(s) await bridge auto-deploy; no new round`]
  }

  const perf = db
    .prepare(
      `select count(distinct substr(observed_at,1,10)) as days,
              coalesce(sum(impressions),0) as impressions, coalesce(sum(clicks),0) as clicks,
              coalesce(sum(spend_usd),0) as spend
       from performance where creative_id = ?`,
    )
    .get(dep.creative_id) as { days: number; impressions: number; clicks: number; spend: number }
  const ctr = perf.impressions > 0 ? perf.clicks / perf.impressions : 0
  // GA4 outcomes for this creative's utm_campaign. Auto-deploys use
  // exp-auto-{id}; creative 3 was deployed manually as exp001. Zero rows just
  // means no synced conversions yet.
  const campaigns = dep.creative_id === 3 ? [`exp-auto-${dep.creative_id}`, 'exp001'] : [`exp-auto-${dep.creative_id}`]
  const conv = db
    .prepare(
      `select coalesce(sum(sessions),0) as sessions, coalesce(sum(sign_ups),0) as signUps
       from conversions where campaign in (${campaigns.map(() => '?').join(',')})`,
    )
    .get(...campaigns) as { sessions: number; signUps: number }
  const summary = `creative ${dep.creative_id}: ${perf.days}d, ${perf.impressions} imp, ${perf.clicks} clicks, CTR ${(ctr * 100).toFixed(2)}%, $${perf.spend.toFixed(2)}, GA4 ${conv.sessions} sessions / ${conv.signUps} sign_ups`

  if (perf.days < MIN_DAYS_EARLY) return [`decide: continue (${summary}; need ${MIN_DAYS_EARLY}d minimum)`]
  const earlyKill = ctr < EARLY_KILL_CTR
  if (perf.days < MIN_DAYS_FULL && !earlyKill) {
    return [`decide: continue (${summary}; next generation at ${MIN_DAYS_FULL}d unless CTR collapses)`]
  }

  const reason = earlyKill && perf.days < MIN_DAYS_FULL ? `early kill: CTR ${(ctr * 100).toFixed(2)}% < 0.15%` : `${perf.days} days of data collected`
  log.decision('generation_round', reason)
  const notes = [`decide: NEW GENERATION round (${reason}; ${summary})`]

  const proposal = await proposeChallengers(db, log, dep.creative_id, summary)
  const repo = new CreativeRepo(db)
  const experimentId = repo.createExperiment({
    domain: 'x-video-ads',
    objective: 'beat the deployed creative on CTR (website traffic)',
    hypothesis: proposal.hypothesis,
    budgetAllocatedUsd: CHALLENGERS * 0.4,
  })
  notes.push(`hypothesis (experiment ${experimentId}): ${proposal.hypothesis}`)

  const results: { creativeId: number; overall: number; disqualified: boolean; hook: string; videoPath: string }[] = []
  for (const c of proposal.creatives.slice(0, CHALLENGERS)) {
    try {
      const r = await produceCreative(
        db,
        log,
        { experimentId, parentCreativeId: dep.creative_id, role: 'challenger', ...c },
        VIDEO,
        { hook: c.hook, brand: BRAND, cta: c.cta },
      )
      results.push({ ...r, hook: c.hook })
      notes.push(`generated creative ${r.creativeId} "${c.concept}" -> ${r.overall}/10${r.disqualified ? ' (disqualified)' : ''}`)
    } catch (err) {
      // Budget denial or generation failure: record and keep going with what we have.
      log.error('challenger_failed', { concept: c.concept, error: String(err) })
      notes.push(`challenger "${c.concept}" failed: ${String(err).slice(0, 200)}`)
      if (String(err).includes('budget denied')) break
    }
  }

  const winner = results.filter((r) => !r.disqualified).sort((a, b) => b.overall - a.overall)[0]
  if (!winner) {
    notes.push('no qualified challenger this round; keeping current creative')
    return notes
  }

  notes.push(
    `winner: creative ${winner.creativeId} (${winner.overall}/10) — awaiting bridge auto-deploy (next 06:30 JST run)`,
  )
  return notes
}

async function proposeChallengers(
  db: Database.Database,
  log: Logger,
  deployedId: number,
  perfSummary: string,
): Promise<{ hypothesis: string; creatives: ProposedCreative[] }> {
  const past = db
    .prepare(
      `select c.id, c.role, c.concept, c.hook, c.message, c.cta, c.prompt, e.overall_score, e.disqualified, e.critic_notes
       from creatives c left join evaluations e on e.creative_id = c.id order by c.id`,
    )
    .all()
  const learnings = db
    .prepare('select insight from learnings order by id desc limit 8')
    .all() as { insight: string }[]

  const prompt = `You design the next generation of short X video ads for Artifact Share
(https://artifactshare.com): share one URL for an AI-generated artifact, get comments,
let AI update it at the same URL. Audience: English-speaking developers using AI coding
agents. Videos are 5s MiniMax H3 Max generations; readable text is burned in later, so
prompts must ask for NO readable on-screen text.

## Internalized knowledge (source-attributed)
${loadKnowledge(['h3max-prompting', 'video-ads', 'marketing-strategy'])}

## Our own results so far
Deployed creative ${deployedId} real performance: ${perfSummary}
All creatives (with AI pre-scores; scores are predictions to beat):
${JSON.stringify(past, null, 1)}
Recent learnings: ${learnings.map((l) => l.insight).join(' / ')}

## Task
State ONE testable hypothesis about what will raise CTR versus the deployed creative,
then propose ${CHALLENGERS} challenger creatives that test it from different angles.
Output ONLY JSON: {"hypothesis": string, "creatives": [{"concept","hook","message","cta","prompt"} x${CHALLENGERS}]}
- hook: <=60 chars, burned onto the opening frames
- cta: <=40 chars, end card
- prompt: H3 Max video prompt following the knowledge above; no readable text in the video`

  const q = query({ prompt, options: { ...modelFor('hypothesis', db), maxTurns: 3 } })
  let text = ''
  for await (const m of q) {
    if (m.type === 'result') {
      if (m.subtype !== 'success' || !('result' in m)) throw new Error(`hypothesis LLM failed: ${m.subtype}`)
      text = m.result
    }
  }
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`hypothesis LLM returned no JSON: ${text.slice(0, 300)}`)
  const raw = JSON.parse(match[0]) as { hypothesis?: unknown; creatives?: unknown }
  const creatives = (Array.isArray(raw.creatives) ? raw.creatives : []).filter(
    (c): c is ProposedCreative =>
      !!c && ['concept', 'hook', 'message', 'cta', 'prompt'].every((k) => typeof (c as Record<string, unknown>)[k] === 'string'),
  )
  if (typeof raw.hypothesis !== 'string' || creatives.length === 0) {
    throw new Error('hypothesis LLM output missing hypothesis/creatives')
  }
  log.info('challengers_proposed', { hypothesis: raw.hypothesis, count: creatives.length })
  return { hypothesis: raw.hypothesis, creatives }
}

