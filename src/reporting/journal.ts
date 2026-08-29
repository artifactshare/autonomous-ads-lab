import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'

export interface JournalEntry {
  actor: string // e.g. 'daily-ops (automated)'
  done: string[]
  spent: string[]
  learnings: string[]
  next: string[]
}

/**
 * Append a public journal entry to journal/YYYY-MM-DD.md.
 * Automated runs use this so the journal covers ALL work, not just
 * human-driven sessions. Never write secrets or personal data here.
 */
export function appendJournal(entry: JournalEntry, date = new Date()): string {
  const day = date.toISOString().slice(0, 10)
  const path = `journal/${day}.md`
  mkdirSync('journal', { recursive: true })
  if (!existsSync(path)) writeFileSync(path, `# ${day}\n`)

  const section = (title: string, items: string[]) =>
    items.length ? `\n### ${title}\n\n${items.map((i) => `- ${i}`).join('\n')}\n` : ''

  const time = date.toISOString().slice(11, 16)
  appendFileSync(
    path,
    `\n## ${time} UTC — ${entry.actor}\n` +
      section('Done', entry.done) +
      section('Spent', entry.spent) +
      section('Learnings', entry.learnings) +
      section('Next', entry.next),
  )
  return path
}
