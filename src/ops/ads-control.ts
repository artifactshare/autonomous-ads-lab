// CLI: pnpm ads:control pause | resume | budget <usd> | funding
import { openDb } from '../db/index.ts'
import { checkFunding, pauseDelivery, setDailyBudgetUsd } from '../ads/control.ts'

const [cmd, arg] = process.argv.slice(2)
const db = openDb()
try {
  if (cmd === 'pause') console.log(await pauseDelivery(db))
  else if (cmd === 'resume') console.log(await pauseDelivery(db, true))
  else if (cmd === 'budget' && arg) console.log(await setDailyBudgetUsd(db, Number(arg)))
  else if (cmd === 'funding') console.log((await checkFunding()).join('\n') || 'funding ok')
  else { console.error('usage: ads-control.ts pause|resume|budget <usd>|funding'); process.exit(1) }
} finally {
  db.close()
}
