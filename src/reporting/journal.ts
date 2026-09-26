import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface JournalEntry {
  actor: string // e.g. 'daily-ops (automated)'
  done: string[]
  spent: string[]
  learnings: string[]
  next: string[]
}

/**
 * The journal is a public, human-facing artifact and the project is run from
 * JST, so a "day" here means a JST day. Using UTC would split one working day
 * across two files: the daily cron fires at 22:00 UTC, which is 07:00 JST the
 * *next* day, so a JST-morning run would land in the previous day's file.
 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** ISO-like string shifted into JST, e.g. '2026-08-31T07:00:00.000Z' for 22:00 UTC on 08-30. */
function jstParts(date: Date): { day: string; time: string; stamp: string } {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS).toISOString()
  return { day: shifted.slice(0, 10), time: shifted.slice(11, 16), stamp: shifted.slice(11, 19).replaceAll(':', '') }
}

const slug = (actor: string) =>
  actor.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entry'

/**
 * Each entry is its own file, journal/YYYY-MM-DD/HHMMSS-<actor>.md (JST).
 *
 * Until 2026-09-26 every run appended to one journal/YYYY-MM-DD.md. Daily,
 * weekly, strategist and harness each do that from their own auto-merge PR,
 * and GitHub's server-side merge ignores the `merge=union` attribute, so any
 * two same-day PRs conflicted and auto-merge stalled for days (#168, #177).
 * With one file per entry no two PRs ever touch the same journal path.
 * Read a whole day back with readJournalDay().
 */
export function newJournalFile(actor: string, date = new Date(), dir = 'journal'): string {
  const { day, time, stamp } = jstParts(date)
  const dayDir = join(dir, day)
  mkdirSync(dayDir, { recursive: true })
  let path = join(dayDir, `${stamp}-${slug(actor)}.md`)
  for (let n = 2; existsSync(path); n++) path = join(dayDir, `${stamp}-${slug(actor)}-${n}.md`)
  writeFileSync(path, `## ${time} JST — ${actor}\n`)
  return path
}

/**
 * Write a public journal entry. Automated runs use this so the journal covers
 * ALL work, not just human-driven sessions. Never write secrets or personal
 * data here.
 */
export function appendJournal(entry: JournalEntry, date = new Date(), dir = 'journal'): string {
  const section = (title: string, items: string[]) =>
    items.length ? `\n### ${title}\n\n${items.map((i) => `- ${i}`).join('\n')}\n` : ''

  const path = newJournalFile(entry.actor, date, dir)
  writeFileSync(
    path,
    readFileSync(path, 'utf8') +
      section('Done', entry.done) +
      section('Spent', entry.spent) +
      section('Learnings', entry.learnings) +
      section('Next', entry.next),
  )
  return path
}

/** Every JST day that has a journal, from legacy day files and entry directories. */
export function journalDays(dir = 'journal'): string[] {
  if (!existsSync(dir)) return []
  const days = new Set<string>()
  for (const f of readdirSync(dir)) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})(\.md)?$/)
    if (m) days.add(m[1]!)
  }
  return [...days].sort()
}

/**
 * One day's journal as a single document: the legacy journal/YYYY-MM-DD.md
 * (entries written before the per-entry layout) followed by the entry files
 * in time order.
 */
export function readJournalDay(day: string, dir = 'journal'): string {
  const parts: string[] = []
  const legacy = join(dir, `${day}.md`)
  if (existsSync(legacy)) parts.push(readFileSync(legacy, 'utf8').replace(/^# .*\n/, '').trim())
  const dayDir = join(dir, day)
  if (existsSync(dayDir)) {
    for (const f of readdirSync(dayDir).filter((f) => f.endsWith('.md')).sort()) {
      parts.push(readFileSync(join(dayDir, f), 'utf8').trim())
    }
  }
  return `# ${day}\n\n${parts.filter(Boolean).join('\n\n')}\n`
}
