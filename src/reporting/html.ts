import type Database from 'better-sqlite3'
import { config } from '../config.ts'
import { BudgetController } from '../budget/controller.ts'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const money = (v: unknown) => (typeof v === 'number' ? `$${v.toFixed(2)}` : '—')

function bar(spent: number, limit: number): string {
  const pct = Math.min(100, (spent / limit) * 100)
  return `<div class="bar"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>`
}

/** Render the public living report as a self-contained HTML page. */
export function renderLivingReportHtml(db: Database.Database): string {
  const budget = new BudgetController(db).status()
  const experiments = db.prepare('select * from experiments order by id desc limit 10').all() as Record<string, unknown>[]
  const creatives = db
    .prepare(
      `select c.id, c.role, c.concept, c.hook, c.generation_cost_usd, e.overall_score, e.disqualified, e.critic_notes
       from creatives c left join evaluations e on e.creative_id = c.id order by c.id`,
    )
    .all() as Record<string, unknown>[]
  const learnings = db.prepare('select * from learnings order by id desc limit 20').all() as Record<string, unknown>[]
  const deployments = db.prepare('select * from deployments order by id desc limit 10').all() as Record<string, unknown>[]
  const updated = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

  const budgetRows = [
    ['Creative', budget.month.creative.spent, config.budget.monthlyCreativeUsd],
    ['X Ads', budget.month.ads.spent, config.budget.monthlyAdsUsd],
    ['AI / API', budget.month.ai.spent, config.budget.monthlyAiUsd],
  ] as const

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Autonomous Ads Lab — Living Report</title>
<style>
  :root {
    --bg: #faf9f7; --fg: #1a1a1a; --muted: #6b6b6b; --line: #e5e2dc;
    --card: #ffffff; --accent: #c2410c; --ok: #15803d; --bad: #b91c1c;
    --mono: "SF Mono", ui-monospace, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #171614; --fg: #ece9e4; --muted: #9a968f; --line: #2e2c28;
            --card: #201e1b; --accent: #fb923c; --ok: #4ade80; --bad: #f87171; }
  }
  * { box-sizing: border-box; margin: 0 }
  body { background: var(--bg); color: var(--fg); font: 16px/1.65 -apple-system, "Segoe UI", sans-serif;
         max-width: 880px; margin: 0 auto; padding: 48px 24px 96px }
  h1 { font-size: 1.9rem; letter-spacing: -0.02em; margin-bottom: 4px }
  h2 { font-size: 1.15rem; margin: 40px 0 12px; padding-top: 24px; border-top: 1px solid var(--line) }
  .sub { color: var(--muted); margin-bottom: 8px }
  .updated { color: var(--muted); font-size: 0.85rem; font-family: var(--mono) }
  a { color: var(--accent) }
  table { width: 100%; border-collapse: collapse; font-size: 0.92rem; margin-top: 8px }
  th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.8rem;
       text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 10px 6px 0 }
  td { padding: 8px 10px 8px 0; border-top: 1px solid var(--line); vertical-align: top }
  .num { font-family: var(--mono); white-space: nowrap }
  .bar { width: 120px; height: 6px; background: var(--line); border-radius: 3px; margin-top: 6px }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 3px }
  .tag { display: inline-block; font-size: 0.75rem; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--line) }
  .tag.ok { color: var(--ok); border-color: var(--ok) }
  .tag.bad { color: var(--bad); border-color: var(--bad) }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; margin: 10px 0 }
  .card h3 { font-size: 0.98rem; margin-bottom: 4px }
  .meta { color: var(--muted); font-size: 0.85rem }
  .note { color: var(--muted); font-size: 0.9rem; font-style: italic }
</style>
</head>
<body>
<h1>Autonomous Ads Lab</h1>
<p class="sub">An AI autonomously runs X ads for <a href="https://artifactshare.com">Artifact Share</a> and improves itself from real-world results. Failures are published, not hidden. Code &amp; full logs: <a href="https://github.com/artifactshare/autonomous-ads-lab">autonomous-ads-lab</a>.</p>
<p class="updated">Updated ${updated} · report auto-generated from the Experience DB</p>

<h2>Budget</h2>
<table>
<tr><th>Category</th><th>Spent (month)</th><th>Limit</th><th></th></tr>
${budgetRows
  .map(
    ([name, spent, limit]) =>
      `<tr><td>${name}</td><td class="num">${money(spent)}</td><td class="num">$${limit}</td><td>${bar(spent, limit)}</td></tr>`,
  )
  .join('\n')}
<tr><td>Ads today</td><td class="num">${money(budget.today.ads.spent)}</td><td class="num">$${config.budget.dailyAdsCapUsd}/day</td><td>${bar(budget.today.ads.spent, config.budget.dailyAdsCapUsd)}</td></tr>
</table>

<h2>Experiments</h2>
${experiments
  .map(
    (e) => `<div class="card"><h3>#${e.id} — ${esc(e.objective)}</h3>
<p class="meta">status: ${esc(e.status)}</p>
<p>${esc(e.hypothesis)}</p></div>`,
  )
  .join('\n')}

<h2>Creatives</h2>
<table>
<tr><th>#</th><th>Role</th><th>Concept</th><th>AI score</th><th>Cost</th><th>Verdict</th></tr>
${creatives
  .map((c) => {
    const verdict = c.disqualified
      ? '<span class="tag bad">disqualified</span>'
      : c.overall_score != null
        ? '<span class="tag ok">qualified</span>'
        : '<span class="tag">pending</span>'
    return `<tr><td class="num">${c.id}</td><td>${esc(c.role)}</td><td>${esc(c.concept)}</td><td class="num">${c.overall_score ?? '—'}</td><td class="num">${money(c.generation_cost_usd)}</td><td>${verdict}</td></tr>`
  })
  .join('\n')}
</table>
<p class="note">AI scores are predictions. They will be compared against actual CTR once enough data accrues.</p>

${
  deployments.length
    ? `<h2>Deployments</h2>
${deployments
  .map(
    (d) => `<div class="card"><h3>Creative ${d.creative_id} on ${esc(d.platform)} <span class="tag ${d.status === 'active' ? 'ok' : ''}">${esc(d.status)}</span></h3>
<p class="meta">campaign ${esc(d.campaign_id)} · started ${esc(String(d.started_at ?? '').slice(0, 10))} · budget ${money(d.budget_usd)}/day</p></div>`,
  )
  .join('\n')}`
    : ''
}

<h2>Learnings</h2>
${
  learnings.length
    ? learnings
        .map(
          (l) => `<div class="card"><h3>${esc(l.observation)}</h3>
<p class="meta">confidence: ${esc(l.confidence)}</p>
${l.lesson ? `<p>${esc(l.lesson)}</p>` : ''}</div>`,
        )
        .join('\n')
    : '<p class="note">No structured learnings recorded yet — see the journal in the repo for narrative notes.</p>'
}

<h2>Current status</h2>
<div class="card">
<p>X Ads API access: application submitted, awaiting approval (weeks-to-months is normal). First deployment was made manually via X Ads Manager and is live.</p>
</div>
</body>
</html>`
}
