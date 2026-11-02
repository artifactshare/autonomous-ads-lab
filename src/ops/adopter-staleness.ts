// Liveness check for data/adopter-signals.json, the only instrument behind
// premise P12 (docs/strategy.md). The private refresh pipeline stalled silently
// for 3 weekly cycles (10/19–11/2, I13/#243) and nothing in the lab noticed
// until a strategist review read the file's generated_at by hand. This check
// runs in the weekly job: a loud journal line always, a needs-human issue when
// a token is available and no open issue already tracks it.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// The refresh lands weekly (Mondays, ~01:30 UTC); 8 days = one missed cycle
// plus a day of slack. Pre-registered in docs/strategy.md I13 (2026-10-26).
export const STALE_AFTER_DAYS = 8

export function adopterSignalsAgeDays(path = 'data/adopter-signals.json', now: Date = new Date()): number | null {
  try {
    const generated: unknown = JSON.parse(readFileSync(path, 'utf8')).generated_at
    if (typeof generated !== 'string') return null
    const t = Date.parse(generated)
    if (Number.isNaN(t)) return null
    return (now.getTime() - t) / 86_400_000
  } catch {
    return null
  }
}

function runGh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/**
 * Journal note about adopter-signals freshness, or null when the file is fresh.
 * Side effect: opens a needs-human issue when stale, GH_TOKEN is set, and no
 * open needs-human issue mentions adopter-signals yet (so a hand-written issue
 * like #243 suppresses the automated one).
 */
export function adopterSignalsStalenessNote(
  opts: { path?: string; now?: Date; env?: NodeJS.ProcessEnv; gh?: (args: string[]) => string } = {},
): string | null {
  const { path = 'data/adopter-signals.json', now = new Date(), env = process.env, gh = runGh } = opts
  const age = adopterSignalsAgeDays(path, now)
  if (age === null) return `adopter-signals: ${path} missing or unreadable — the P12 funnel instrument is dark (docs/strategy.md I13)`
  if (age <= STALE_AFTER_DAYS) return null
  const days = Math.floor(age)
  const note = `adopter-signals: STALE — generated_at is ${days} days old (>${STALE_AFTER_DAYS}d); the P12 funnel instrument is dark (docs/strategy.md I13, #243)`
  if (!env.GH_TOKEN) return note
  try {
    const open: unknown[] = JSON.parse(gh(['issue', 'list', '--state', 'open', '--label', 'needs-human', '--search', 'adopter-signals', '--json', 'number']))
    if (open.length > 0) return `${note}; an open needs-human issue already tracks it`
    gh([
      'issue',
      'create',
      '--title',
      `adopter-signals が stale: generated_at が ${days} 日前 — 週次更新が止まっている(private 側 ops:adopter-signals の確認)`,
      '--label',
      'needs-human',
      '--body',
      [
        `\`data/adopter-signals.json\` の \`generated_at\` が ${days} 日前のままです(しきい値 ${STALE_AFTER_DAYS} 日、docs/strategy.md I13 で事前登録)。`,
        '',
        'P12(プロダクト自身の share loop が主要獲得チャネル)の唯一の計器がこのファイルです。暗転している間、joined funnel(viewer→poster→comment)の判定ができません。',
        '',
        'private 側の `ops:adopter-signals` cron が動いているか確認してください。過去の正常時は月曜 01:30 UTC 頃に refresh PR が届いていました(#190→#204→#217)。',
        '',
        '(この issue は weekly-learning の staleness チェックが自動起票しました: `src/ops/adopter-staleness.ts`)',
      ].join('\n'),
    ])
    return `${note}; needs-human issue opened`
  } catch (err) {
    return `${note}; issue check/create failed: ${String(err).slice(0, 120)}`
  }
}
