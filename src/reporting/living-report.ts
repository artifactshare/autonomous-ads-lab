import type Database from 'better-sqlite3'
import { config } from '../config.ts'
import { BudgetController } from '../budget/controller.ts'

/** Render the public living report (Markdown) from the Experience DB. */
export function renderLivingReport(db: Database.Database): string {
  const budget = new BudgetController(db).status()
  const experiments = db
    .prepare('select * from experiments order by id desc limit 10')
    .all() as Record<string, unknown>[]
  const creatives = db
    .prepare(
      `select c.id, c.role, c.concept, c.hook, c.generation_cost_usd,
              e.overall_score, e.disqualified, e.critic_notes
       from creatives c
       left join evaluations e on e.creative_id = c.id
       order by c.id`,
    )
    .all() as Record<string, unknown>[]
  const learnings = db
    .prepare('select * from learnings order by id desc limit 20')
    .all() as Record<string, unknown>[]
  const deployments = db
    .prepare('select * from deployments order by id desc limit 10')
    .all() as Record<string, unknown>[]

  const money = (v: unknown) => (typeof v === 'number' ? `$${v.toFixed(2)}` : '—')
  const lines: string[] = []
  lines.push('# Autonomous Ads Lab — Living Report')
  lines.push('')
  lines.push(
    'An AI autonomously runs X ads for [Artifact Share](https://artifactshare.com) and improves itself from real-world results. ' +
      'This report updates in place. Code and full logs: [autonomous-ads-lab](https://github.com/artifactshare/autonomous-ads-lab). ' +
      'Failures are published, not hidden.',
  )
  lines.push('')
  lines.push(`_Updated: ${new Date().toISOString()}_`)
  lines.push('')
  lines.push('## Budget')
  lines.push('')
  lines.push('| Category | Spent (month) | Limit |')
  lines.push('|---|---|---|')
  lines.push(`| Creative | ${money(budget.month.creative.spent)} | $${config.budget.monthlyCreativeUsd} |`)
  lines.push(`| X Ads | ${money(budget.month.ads.spent)} | $${config.budget.monthlyAdsUsd} |`)
  lines.push(`| AI/API | ${money(budget.month.ai.spent)} | $${config.budget.monthlyAiUsd} |`)
  lines.push(`| Ads today | ${money(budget.today.ads.spent)} | $${config.budget.dailyAdsCapUsd}/day |`)
  lines.push('')
  lines.push('## Experiments')
  lines.push('')
  for (const e of experiments) {
    lines.push(`### #${e.id} — ${e.objective}`)
    lines.push('')
    lines.push(`- status: ${e.status}`)
    lines.push(`- hypothesis: ${e.hypothesis}`)
    lines.push('')
  }
  lines.push('## Creatives')
  lines.push('')
  lines.push('| # | Role | Concept | AI score | Cost | Verdict |')
  lines.push('|---|---|---|---|---|---|')
  for (const c of creatives) {
    const verdict = c.disqualified ? 'disqualified' : c.overall_score != null ? 'qualified' : 'pending'
    lines.push(
      `| ${c.id} | ${c.role} | ${c.concept} | ${c.overall_score ?? '—'} | ${money(c.generation_cost_usd)} | ${verdict} |`,
    )
  }
  lines.push('')
  lines.push('AI scores are predictions. They will be compared against actual CTR once ads run.')
  lines.push('')
  if (deployments.length > 0) {
    lines.push('## Deployments')
    lines.push('')
    for (const d of deployments) {
      lines.push(`- creative ${d.creative_id} on ${d.platform}: ${d.status}`)
    }
    lines.push('')
  }
  lines.push('## Learnings')
  lines.push('')
  if (learnings.length === 0) {
    lines.push('_No structured learnings recorded yet (see journal in the repo for narrative notes)._')
  }
  for (const l of learnings) {
    lines.push(`- **${l.observation}** (confidence: ${l.confidence})${l.lesson ? ` — ${l.lesson}` : ''}`)
  }
  lines.push('')
  lines.push('## Current status')
  lines.push('')
  lines.push('- X Ads API access: application submitted, awaiting approval (weeks-to-months is normal)')
  lines.push('- Fallback: first deployment will be manual via X Ads Manager')
  lines.push('')
  return lines.join('\n')
}
