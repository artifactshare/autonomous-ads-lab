// Print one day's journal as a single document (legacy day file + entries):
//   pnpm journal:show 2026-09-26     (default: every day, oldest first)
import { journalDays, readJournalDay } from '../reporting/journal.ts'

const days = process.argv.slice(2)
for (const day of days.length ? days : journalDays()) console.log(readJournalDay(day))
