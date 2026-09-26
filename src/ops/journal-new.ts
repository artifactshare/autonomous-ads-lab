// Start a journal entry for a human or agent session:
//   pnpm journal:new "strategist (automated)"
// Creates journal/YYYY-MM-DD/HHMMSS-<actor>.md (JST) with its heading and
// prints the path; write Done / Spent / Learnings / Next into that file.
import { newJournalFile } from '../reporting/journal.ts'

const actor = process.argv.slice(2).join(' ').trim()
if (!actor) {
  console.error('usage: pnpm journal:new "<actor>"')
  process.exit(1)
}
console.log(newJournalFile(actor))
