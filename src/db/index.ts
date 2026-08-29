import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.ts'

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql')

// Additive migrations for columns added after a table shipped (SQLite has no
// ALTER ... IF NOT EXISTS; create-table-if-not-exists won't touch existing DBs).
function migrate(db: Database.Database): void {
  const addColumn = (table: string, column: string, ddl: string) => {
    const cols = db.pragma(`table_info(${table})`) as { name: string }[]
    if (!cols.some((c) => c.name === column)) db.exec(`alter table ${table} add column ${ddl}`)
  }
  addColumn('creatives', 'generation_request_id', 'generation_request_id text')
  // Public URL of the promoted post; discovered automatically by daily ops.
  addColumn('deployments', 'post_url', 'post_url text')
}

export function openDb(path: string = config.dbPath): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(schemaPath, 'utf8'))
  migrate(db)
  return db
}
