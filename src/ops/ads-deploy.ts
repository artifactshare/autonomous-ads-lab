// CLI: pnpm ads:deploy --creative 8 [--replaces 3] [--parallel] [--apply]
// --parallel keeps the incumbent promoted tweet serving (A/B on the same line item); metrics are per promoted tweet.
import { openDb } from '../db/index.ts'
import { deployCreative } from '../ads/deploy.ts'

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined }
const creative = Number(arg('creative'))
if (!Number.isInteger(creative)) { console.error('usage: ads-deploy.ts --creative <id> [--replaces <id>] [--apply]'); process.exit(1) }
const db = openDb()
const r = await deployCreative(db, creative, { apply: process.argv.includes('--apply'), replaces: arg('replaces') ? Number(arg('replaces')) : undefined, parallel: process.argv.includes('--parallel'), log: console.log })
console.log(r.status); for (const n of r.notes) console.log(' -', n)
db.close()
