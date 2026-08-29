import { existsSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { config } from '../config.ts'
import { BudgetController } from '../budget/controller.ts'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const money = (v: unknown) => (typeof v === 'number' ? `$${v.toFixed(2)}` : '—')
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null)

// final.mp4 is committed to the public repo, so the report can embed it.
const RAW_BASE = 'https://raw.githubusercontent.com/artifactshare/autonomous-ads-lab/main'
function videoUrl(creativeId: unknown): string | null {
  return existsSync(`data/creatives/${creativeId}/final.mp4`)
    ? `${RAW_BASE}/data/creatives/${creativeId}/final.mp4`
    : null
}

function bar(spent: number, limit: number): string {
  const pct = Math.min(100, (spent / limit) * 100)
  return `<div class="bar"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>`
}

const STATUS_JA: Record<string, string> = {
  active: '配信中',
  paused: '一時停止',
  stopped: '終了',
  pending: '審査待ち',
  rejected: '審査落ち',
}
const CONFIDENCE_JA: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  insufficient_data: 'データ不足',
}

// The experiment runs for months: dozens of creatives and learnings will
// accumulate. Newest/active items get full cards; the rest collapse into
// tables so the page stays readable at month three.
const CARD_LIMIT = 8
const LEARNING_LIMIT = 8

/** Render the public living report as a self-contained HTML page (Japanese). */
export function renderLivingReportHtml(db: Database.Database): string {
  const budget = new BudgetController(db).status()
  const experiments = db.prepare('select * from experiments order by id desc').all() as Record<string, unknown>[]
  const creatives = db
    .prepare(
      `select c.id, c.role, c.concept, c.hook, c.message, c.cta, c.generation_cost_usd, c.created_at,
              e.overall_score, e.disqualified, e.critic_notes
       from creatives c left join evaluations e on e.creative_id = c.id order by c.id desc`,
    )
    .all() as Record<string, unknown>[]
  const learnings = db.prepare('select * from learnings order by id desc').all() as Record<string, unknown>[]
  const deployments = db
    .prepare(
      `select d.*, c.concept from deployments d
       left join creatives c on c.id = d.creative_id order by d.id desc`,
    )
    .all() as Record<string, unknown>[]
  const perfDaily = db
    .prepare(
      `select substr(observed_at, 1, 10) as d,
              sum(spend_usd) as spend, sum(impressions) as impressions, sum(clicks) as clicks
       from performance group by d order by d`,
    )
    .all() as { d: string; spend: number; impressions: number; clicks: number }[]
  const updated = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

  const activeIds = new Set(deployments.filter((d) => d.status === 'active').map((d) => d.creative_id))
  const cardCreatives = creatives.filter((c, i) => i < CARD_LIMIT || activeIds.has(c.id))
  const restCreatives = creatives.filter((c) => !cardCreatives.includes(c))
  const startDate = experiments.length ? day(experiments[experiments.length - 1]!.created_at) : null
  const daysRunning = startDate
    ? Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / 86400_000) + 1)
    : 0
  const totalVariable = budget.month.creative.spent + budget.month.ads.spent + budget.month.ai.spent

  // The ledger includes spend that never became a listed creative (pipeline
  // tests, duplicate-submission incidents). Surface the delta so the budget
  // table always reconciles with the creative list, whatever happens later.
  const listedCreativeCost = creatives.reduce(
    (sum, c) => sum + (typeof c.generation_cost_usd === 'number' ? c.generation_cost_usd : 0),
    0,
  )
  const unlistedCreativeCost = Math.max(0, budget.month.creative.spent - listedCreativeCost)

  const budgetRows = [
    ['クリエイティブ生成', budget.month.creative.spent, config.budget.monthlyCreativeUsd],
    ['X広告配信', budget.month.ads.spent, config.budget.monthlyAdsUsd],
    ['AI / API', budget.month.ai.spent, config.budget.monthlyAiUsd],
  ] as const

  const scoreData = cardCreatives
    .filter((c) => c.overall_score != null)
    .map((c) => ({ label: `#${c.id}`, concept: String(c.concept).slice(0, 24), score: c.overall_score }))
    .reverse()

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Autonomous Ads Lab — Living Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #faf9f7; --fg: #1a1a1a; --muted: #6b6b6b; --line: #e5e2dc;
    --card: #ffffff; --accent: #c2410c; --accent-soft: rgba(194,65,12,.16);
    --ok: #15803d; --bad: #b91c1c;
    --mono: "SF Mono", ui-monospace, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #171614; --fg: #ece9e4; --muted: #9a968f; --line: #2e2c28;
            --card: #201e1b; --accent: #fb923c; --accent-soft: rgba(251,146,60,.18);
            --ok: #4ade80; --bad: #f87171; }
  }
  * { box-sizing: border-box; margin: 0 }
  body { background: var(--bg); color: var(--fg);
         font: 16px/1.8 -apple-system, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Segoe UI", sans-serif;
         word-break: auto-phrase; overflow-wrap: anywhere;
         max-width: 920px; margin: 0 auto; padding: 44px 22px 96px }
  h1 { font-size: 2rem; letter-spacing: -0.02em; margin-bottom: 4px }
  h2 { font-size: 1.2rem; margin: 48px 0 14px; padding-top: 28px; border-top: 1px solid var(--line) }
  .sub { color: var(--muted); margin-bottom: 8px; font-size: .95rem }
  .updated { color: var(--muted); font-size: 0.82rem; font-family: var(--mono) }
  a { color: var(--accent) }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-top: 22px }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px }
  .tile .v { font-family: var(--mono); font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em }
  .tile .k { color: var(--muted); font-size: 0.78rem; margin-top: 2px }
  .tile.live .v { color: var(--ok) }
  table { width: 100%; border-collapse: collapse; font-size: 0.92rem; margin-top: 8px }
  th { text-align: left; color: var(--muted); font-weight: 600; font-size: 0.78rem;
       letter-spacing: 0.05em; padding: 6px 10px 6px 0; white-space: nowrap }
  td { padding: 8px 10px 8px 0; border-top: 1px solid var(--line); vertical-align: top }
  .table-scroll { overflow-x: auto }
  .num { font-family: var(--mono); white-space: nowrap }
  .bar { width: 120px; height: 6px; background: var(--line); border-radius: 3px; margin-top: 6px }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 3px }
  .tag { display: inline-block; font-size: 0.74rem; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--line); white-space: nowrap }
  .tag.ok { color: var(--ok); border-color: var(--ok) }
  .tag.bad { color: var(--bad); border-color: var(--bad) }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; margin: 10px 0 }
  .card h3 { font-size: 0.98rem; margin-bottom: 4px }
  .meta { color: var(--muted); font-size: 0.84rem }
  .note { color: var(--muted); font-size: 0.9rem; font-style: italic }
  .chart-box { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px 10px; margin: 14px 0 }
  .chart-box h3 { font-size: .92rem; margin-bottom: 10px; color: var(--muted); font-weight: 600 }
  .chart-wrap { position: relative; height: 220px }
  .chart-wrap.tall { height: 260px }
  .smalls { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px }
  .creative { display: grid; grid-template-columns: 230px minmax(0,1fr); gap: 18px;
              background: var(--card); border: 1px solid var(--line); border-radius: 12px;
              padding: 16px 18px; margin: 12px 0 }
  .creative video { width: 100%; border-radius: 8px; background: #000; display: block }
  .creative .copy { font-size: 0.88rem; color: var(--muted); margin-top: 6px }
  .scores { margin-top: 8px; font-size: 0.9rem }
  details { margin: 14px 0; border: 1px solid var(--line); border-radius: 12px; background: var(--card) }
  summary { cursor: pointer; padding: 12px 18px; font-weight: 600; font-size: .92rem }
  details .inner { padding: 0 18px 14px }
  @media (max-width: 640px) { .creative { grid-template-columns: 1fr } }
</style>
</head>
<body>
<h1>Autonomous Ads Lab</h1>
<p class="sub">AIが <a href="https://artifactshare.com">Artifact Share</a> のX広告を自律運用し、実世界の結果から自分を改善していく公開実験のライブレポートです。同じURLのまま自動更新されます。失敗も隠さず公開します。コードと全ログ: <a href="https://github.com/artifactshare/autonomous-ads-lab">autonomous-ads-lab</a> / <a href="https://artifactshare.com/a/m9gn48oo9z">企画書</a></p>
<p class="updated">最終更新 ${updated} · Experience DBから自動生成</p>

<div class="tiles">
  <div class="tile"><div class="v">${daysRunning}日目</div><div class="k">実験開始から (${startDate ?? '—'}〜)</div></div>
  <div class="tile"><div class="v">${money(totalVariable)}</div><div class="k">今月の変動費支出</div></div>
  <div class="tile"><div class="v">${creatives.length}</div><div class="k">生成クリエイティブ</div></div>
  <div class="tile live"><div class="v">${activeIds.size}</div><div class="k">配信中</div></div>
  <div class="tile"><div class="v">${learnings.length}</div><div class="k">記録された学び</div></div>
</div>

<h2>パフォーマンス推移</h2>
${
  perfDaily.length
    ? `<div class="smalls">
<div class="chart-box"><h3>広告支出 (USD/日)</h3><div class="chart-wrap"><canvas id="c-spend"></canvas></div></div>
<div class="chart-box"><h3>インプレッション/日</h3><div class="chart-wrap"><canvas id="c-imp"></canvas></div></div>
<div class="chart-box"><h3>クリック/日</h3><div class="chart-wrap"><canvas id="c-clicks"></canvas></div></div>
</div>`
    : '<p class="note">配信metricsの取得はこれから。データが入り次第、ここに支出・インプレッション・クリックの日次推移グラフが描画されます。</p>'
}

<h2>予算</h2>
<div class="table-scroll"><table>
<tr><th>項目</th><th>今月の支出</th><th>上限</th><th></th></tr>
${budgetRows
  .map(
    ([name, spent, limit]) =>
      `<tr><td>${name}</td><td class="num">${money(spent)}</td><td class="num">$${limit}</td><td>${bar(spent, limit)}</td></tr>`,
  )
  .join('\n')}
<tr><td>本日の広告支出</td><td class="num">${money(budget.today.ads.spent)}</td><td class="num">$${config.budget.dailyAdsCapUsd}/日</td><td>${bar(budget.today.ads.spent, config.budget.dailyAdsCapUsd)}</td></tr>
</table></div>
${
  unlistedCreativeCost > 0.005
    ? `<p class="note">クリエイティブ生成 ${money(budget.month.creative.spent)} のうち、下の一覧に載っている動画の分は ${money(listedCreativeCost)}。残り ${money(unlistedCreativeCost)} はパイプライン検証や重複生成事故など、作品にならなかった支出です(失敗分も隠さず計上しています。経緯はリポジトリのjournal参照)。</p>`
    : ''
}
<p class="note">別途固定費: X Premium ¥459/月(3ヶ月目から¥918/月)。広告配信の必須条件。</p>

<h2>実験</h2>
${experiments
  .slice(0, 6)
  .map(
    (e) => `<div class="card"><h3>#${e.id} — ${esc(e.objective)}</h3>
<p class="meta">状態: ${e.status === 'running' ? '進行中' : esc(e.status)}</p>
<p>仮説: ${esc(e.hypothesis)}</p></div>`,
  )
  .join('\n')}

<h2>クリエイティブ</h2>
${
  scoreData.length > 1
    ? `<div class="chart-box"><h3>AI事前評価スコア (overall / 10) — 実CTRとの答え合わせ用の予測</h3><div class="chart-wrap tall"><canvas id="c-scores"></canvas></div></div>`
    : ''
}
${cardCreatives
  .map((c) => {
    const verdict = c.disqualified
      ? '<span class="tag bad">失格</span>'
      : c.overall_score != null
        ? '<span class="tag ok">合格</span>'
        : '<span class="tag">評価待ち</span>'
    const live = activeIds.has(c.id) ? ' <span class="tag ok">配信中</span>' : ''
    const url = videoUrl(c.id)
    const video = url
      ? `<video controls muted playsinline preload="none" src="${url}"></video>`
      : `<div class="note">動画は未公開</div>`
    return `<div class="creative">
<div>${video}</div>
<div>
  <h3>#${c.id} ${esc(c.concept)} ${verdict}${live}</h3>
  <p class="meta">${esc(String(c.role))} · 生成 ${day(c.created_at) ?? '—'} · コスト ${money(c.generation_cost_usd)}</p>
  <p class="copy">フック「${esc(c.hook)}」 / CTA「${esc(c.cta)}」</p>
  <p class="scores">AI評価: <b class="num">${c.overall_score ?? '—'}</b> / 10${c.critic_notes ? `<br><span class="meta">${esc(String(c.critic_notes).slice(0, 200))}${String(c.critic_notes).length > 200 ? '…' : ''}</span>` : ''}</p>
</div>
</div>`
  })
  .join('\n')}
${
  restCreatives.length
    ? `<details><summary>過去のクリエイティブ ${restCreatives.length}件を表示</summary><div class="inner"><div class="table-scroll"><table>
<tr><th>#</th><th>コンセプト</th><th>生成日</th><th>AI評価</th><th>判定</th><th>動画</th></tr>
${restCreatives
  .map((c) => {
    const url = videoUrl(c.id)
    return `<tr><td class="num">${c.id}</td><td>${esc(c.concept)}</td><td class="num">${day(c.created_at) ?? '—'}</td><td class="num">${c.overall_score ?? '—'}</td><td>${c.disqualified ? '失格' : '合格'}</td><td>${url ? `<a href="${url}">再生</a>` : '—'}</td></tr>`
  })
  .join('\n')}
</table></div></div></details>`
    : ''
}
<p class="note">AI評価は「予測」です。実際のCTRが溜まり次第、答え合わせを行います。</p>

<h2>配信履歴</h2>
${
  deployments.length
    ? `<div class="table-scroll"><table>
<tr><th>クリエイティブ</th><th>配信期間</th><th>状態</th><th>予算</th><th>キャンペーン</th></tr>
${deployments
  .map((d) => {
    const from = day(d.started_at) ?? day(d.created_at) ?? '—'
    const to = day(d.stopped_at)
    const period = to ? `${from} 〜 ${to}` : `${from} 〜 配信中`
    const st = STATUS_JA[String(d.status)] ?? esc(d.status)
    return `<tr><td>#${d.creative_id} ${esc(d.concept ?? '')}</td><td class="num">${period}</td><td><span class="tag ${d.status === 'active' ? 'ok' : ''}">${st}</span></td><td class="num">${money(d.budget_usd)}/日</td><td class="num">${esc(d.campaign_id ?? '—')}</td></tr>`
  })
  .join('\n')}
</table></div>`
    : '<p class="note">まだ配信履歴はありません。</p>'
}

<h2>学び</h2>
${learnings
  .slice(0, LEARNING_LIMIT)
  .map(
    (l) => `<div class="card"><h3>${esc(l.observation)}</h3>
<p class="meta">確度: ${CONFIDENCE_JA[String(l.confidence)] ?? esc(l.confidence)}</p>
${l.lesson ? `<p>${esc(l.lesson)}</p>` : ''}</div>`,
  )
  .join('\n')}
${
  learnings.length > LEARNING_LIMIT
    ? `<details><summary>過去の学び ${learnings.length - LEARNING_LIMIT}件を表示</summary><div class="inner">${learnings
        .slice(LEARNING_LIMIT)
        .map((l) => `<div class="card"><h3>${esc(l.observation)}</h3><p class="meta">確度: ${CONFIDENCE_JA[String(l.confidence)] ?? esc(l.confidence)}</p>${l.lesson ? `<p>${esc(l.lesson)}</p>` : ''}</div>`)
        .join('\n')}</div></details>`
    : ''
}
${learnings.length === 0 ? '<p class="note">構造化された学びはまだありません(経緯はリポジトリのjournalへ)。</p>' : ''}

<h2>現在の状態</h2>
<div class="card">
<p>X Ads APIのアクセス申請は提出済みで承認待ちです(数週間〜数ヶ月かかるのが通例)。それまでの入稿・運用はAds Managerでの半自動運用で行っています。</p>
</div>

<script>
(() => {
  if (typeof Chart === 'undefined') return; // CDN blocked -> tables still tell the story
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const accent = css('--accent'), soft = css('--accent-soft'), line = css('--line'), muted = css('--muted');
  Chart.defaults.color = muted;
  Chart.defaults.borderColor = line;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

  const perf = ${JSON.stringify(perfDaily)};
  const mkLine = (id, key) => {
    const el = document.getElementById(id);
    if (!el || !perf.length) return;
    new Chart(el, {
      type: 'line',
      data: { labels: perf.map(p => p.d.slice(5)), datasets: [{
        data: perf.map(p => p[key]), borderColor: accent, backgroundColor: soft,
        borderWidth: 2, pointRadius: perf.length > 45 ? 0 : 3, pointHoverRadius: 5,
        fill: true, tension: 0.25,
      }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
        interaction: { intersect: false, mode: 'index' },
        scales: { y: { beginAtZero: true, grid: { color: line } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } } },
      },
    });
  };
  mkLine('c-spend', 'spend');
  mkLine('c-imp', 'impressions');
  mkLine('c-clicks', 'clicks');

  const scores = ${JSON.stringify(scoreData)};
  const sc = document.getElementById('c-scores');
  if (sc && scores.length) {
    new Chart(sc, {
      type: 'bar',
      data: { labels: scores.map(s => s.label + ' ' + s.concept), datasets: [{
        data: scores.map(s => s.score), backgroundColor: soft, borderColor: accent,
        borderWidth: 1.5, borderRadius: 4, borderSkipped: false, maxBarThickness: 26,
      }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { min: 0, max: 10, grid: { color: line } }, y: { grid: { display: false } } },
      },
    });
  }
})();
</script>
</body>
</html>`
}
