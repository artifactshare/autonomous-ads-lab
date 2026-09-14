// CLI: pnpm ads:targeting list | add-similar @handle | add-followers @handle | remove <id>
import { openDb } from '../db/index.ts'
import { addFollowerTargeting, listTargeting, removeTargeting } from '../ads/targeting.ts'

const [cmd, arg] = process.argv.slice(2)
const db = openDb()
try {
  if (cmd === 'list') for (const t of await listTargeting(db)) console.log(`${t.id}\t${t.targeting_type}\t${t.targeting_value}\t${t.name ?? ''}`)
  else if (cmd === 'add-similar' && arg) console.log(JSON.stringify(await addFollowerTargeting(db, arg, true)))
  else if (cmd === 'add-followers' && arg) console.log(JSON.stringify(await addFollowerTargeting(db, arg, false)))
  else if (cmd === 'remove' && arg) { await removeTargeting(db, arg); console.log(`removed ${arg}`) }
  else { console.error('usage: ads-targeting.ts list | add-similar @handle | add-followers @handle | remove <id>'); process.exit(1) }
} finally {
  db.close()
}
