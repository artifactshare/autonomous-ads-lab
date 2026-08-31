import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
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
function jstParts(date: Date): { day: string; time: string } {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS).toISOString()
  return { day: shifted.slice(0, 10), time: shifted.slice(11, 16) }
}

/**
 * Append a public journal entry to journal/YYYY-MM-DD.md (JST date).
 * Automated runs use this so the journal covers ALL work, not just
 * human-driven sessions. Never write secrets or personal data here.
 */
export function appendJournal(entry: JournalEntry, date = new Date(), dir = 'journal'): string {
  const { day, time } = jstParts(date)
  const path = join(dir, `${day}.md`)
  mkdirSync(dir, { recursive: true })
  if (!existsSync(path)) writeFileSync(path, `# ${day}\n`)

  const section = (title: string, items: string[]) =>
    items.length ? `\n### ${title}\n\n${items.map((i) => `- ${i}`).join('\n')}\n` : ''

  appendFileSync(
    path,
    `\n## ${time} JST — ${entry.actor}\n` +
      section('Done', entry.done) +
      section('Spent', entry.spent) +
      section('Learnings', entry.learnings) +
      section('Next', entry.next),
  )
  return path
}
