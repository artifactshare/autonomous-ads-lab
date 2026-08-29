import { openDb } from './index.ts'
import { config } from '../config.ts'

const db = openDb()
console.log(`initialized ${config.dbPath}`)
db.close()
