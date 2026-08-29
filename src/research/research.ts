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
    // The authorize() above charged a flat conservative estimate. Grok reports
    // the real token/tool usage, so correct the ledger to what we actually
    // spent -- otherwise the AI cap fires ~3x early. Skipped for duplicates:
    // that ledger row belongs to an earlier, already-paid action.
    if (!auth.duplicate) {
      const rec = budget.reconcile(auth.ledgerId, r.costUsd)
      if (rec.ok) log.info('budget_reconciled', { kind, ledgerId: auth.ledgerId, actualUsd: r.costUsd, deltaUsd: rec.deltaUsd })
      else log.warn('budget_reconcile_failed', { kind, ledgerId: auth.ledgerId, reason: rec.reason })
    }
    log.info('research_observation', { kind, toolCalls: r.toolCalls, costUsd: r.costUsd })
    return r.text
  } catch (err) {
    // Deliberately leave the estimate charged: a failure may still have cost
    // money upstream (e.g. timeout after the request was billed). Fail closed.
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

/** Max techniques stored from a single ad_trends response. */
const MAX_TECHNIQUES_PER_RUN = 3

/**
 * Parse an ad_trends response into techniques and store them.
 * Returns how many were ACTUALLY stored -- entries past the cap, or missing a
 * name/hypothesis, are dropped, so the response's array length would overstate
 * what the technique library holds. That count goes into the public journal.
 * Throws if the response contains no parseable JSON array.
 */
export function recordTechniques(repo: ResearchRepo, text: string): number {
  const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as Record<string, string>[]
  if (!Array.isArray(arr)) throw new Error('techniques response was not a JSON array')
  let recorded = 0
  for (const t of arr.slice(0, MAX_TECHNIQUES_PER_RUN)) {
    if (!t.name || !t.hypothesis) continue
    repo.addTechnique({
      name: t.name,
      source: t.source ?? 'grok research',
      description: t.description ?? '',
      hypothesis: t.hypothesis,
      implementationHint: t.implementation_hint,
      applicableDomains: ['artifact_share'],
    })
    recorded += 1
  }
  return recorded
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
      const recorded = recordTechniques(repo, trends)
      notes.push(`ad_trends: recorded ${recorded} candidate technique(s) (status=discovered; validation requires experiments)`)
    } catch {
      log.warn('technique_parse_failed')
      notes.push('ad_trends: response was not parseable as techniques JSON')
    }
  }
  return notes
}
