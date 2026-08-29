import type Database from 'better-sqlite3'
import { BudgetController } from '../budget/controller.ts'
import type { Logger } from '../logging/logger.ts'
import { estimateQueryCostUsd, grokQuery, type GrokSearchOptions } from './grok.ts'
import { ResearchRepo, type Observation } from './repo.ts'

function lastWeek(): { fromDate: string; toDate: string } {
  const to = new Date()
  const from = new Date(to.getTime() - 7 * 86400_000)
  return { fromDate: from.toISOString().slice(0, 10), toDate: to.toISOString().slice(0, 10) }
}

async function runQuery(
  db: Database.Database,
  log: Logger,
  kind: Observation['kind'],
  prompt: string,
  opts: GrokSearchOptions,
): Promise<string | null> {
  const budget = new BudgetController(db)
  const repo = new ResearchRepo(db)
  const auth = budget.authorize({
    category: 'ai',
    amountUsd: estimateQueryCostUsd(),
    description: `grok research: ${kind}`,
    runId: log.runId,
  })
  if (!auth.ok) {
    log.warn('research_skipped', { kind, reason: auth.reason })
    return null
  }
  try {
    const r = await grokQuery(prompt, opts)
    repo.recordObservation({ kind, query: prompt.slice(0, 200), source: 'grok', summary: r.text, raw: { toolCalls: r.toolCalls, usage: r.usage }, costUsd: r.costUsd, runId: log.runId })
    log.info('research_observation', { kind, toolCalls: r.toolCalls, costUsd: r.costUsd })
    return r.text
  } catch (err) {
    log.error('research_failed', { kind, error: String(err) })
    return null
  }
}

/** Daily: monitor mentions/reactions to our account and ads. Cheap, 1-2 queries. */
export async function dailyObservation(db: Database.Database, log: Logger): Promise<string[]> {
  const week = lastWeek()
  const notes: string[] = []
  const mentions = await runQuery(
    db,
    log,
    'mentions',
    `Search X for recent posts mentioning "artifactshare" or "@artifactshare_" or artifactshare.com (last 7 days).
Summarize: how many posts, who is talking, sentiment, any reactions to ads or the product. If nothing found, say exactly "NO_MENTIONS". Be factual, no padding.`,
    { xSearch: week },
  )
  if (mentions) notes.push(`mentions: ${mentions.slice(0, 300)}`)
  return notes
}

/** Weekly: pain points + ad trends -> candidate techniques (evidence-gated). */
export async function weeklyResearch(db: Database.Database, log: Logger): Promise<string[]> {
  const week = lastWeek()
  const repo = new ResearchRepo(db)
  const notes: string[] = []

  const pain = await runQuery(
    db,
    log,
    'pain_points',
    `Search X for posts from developers using AI coding agents (Claude Code, Cursor, Codex, Copilot) complaining about SHARING their AI-generated output: sending HTML files, screenshots of artifacts, "final_v2" style re-uploads, pasting code for feedback, updating shared files. Last 7 days.
Report the 3-5 most concrete pain expressions with short quotes and what triggered them. If nothing meaningful, say "INSUFFICIENT_DATA".`,
    { xSearch: week },
  )
  if (pain) notes.push(`pain_points: ${pain.slice(0, 300)}`)

  const trends = await runQuery(
    db,
    log,
    'ad_trends',
    `Search X and the web for currently effective short-video ad techniques for developer tools / SaaS on X (Twitter) - hooks, formats, lengths, text overlay styles that got high engagement recently.
Then output ONLY a JSON array (no fences) of at most 3 techniques: [{"name": "...", "description": "...", "hypothesis": "if we apply X, CTR improves because Y", "implementation_hint": "...", "source": "url or handle"}]. If nothing credible, output [].`,
    { xSearch: week, webSearch: true },
  )
  if (trends) {
    try {
      const arr = JSON.parse(trends.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as Record<string, string>[]
      for (const t of arr.slice(0, 3)) {
        if (!t.name || !t.hypothesis) continue
        repo.addTechnique({
          name: t.name,
          source: t.source ?? 'grok research',
          description: t.description ?? '',
          hypothesis: t.hypothesis,
          implementationHint: t.implementation_hint,
          applicableDomains: ['artifact_share'],
        })
      }
      notes.push(`ad_trends: recorded ${arr.length} candidate technique(s) (status=discovered; validation requires experiments)`)
    } catch {
      log.warn('technique_parse_failed')
      notes.push('ad_trends: response was not parseable as techniques JSON')
    }
  }
  return notes
}
