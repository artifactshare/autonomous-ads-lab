import Database from 'better-sqlite3'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.ts'
import { eventFiles, installStrftime, replayEvents, withEventCapture } from './events.ts'

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

function initSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(schemaPath, 'utf8'))
  migrate(db)
}

/**
 * Open the Experience DB.
 *
 * The git-tracked source of truth is the append-only event log under
 * data/events/ (see events.ts). The .db file is a build artifact: when the
 * event log exists, the file is rebuilt from scratch by replaying it, and all
 * new writes through the returned handle are captured as a new event file
 * (flushed on close()). `:memory:` databases (tests) skip event sourcing.
 */
export function openDb(path: string = config.dbPath): Database.Database {
  if (path === ':memory:') {
    const db = new Database(path)
    initSchema(db)
    return db
  }
  mkdirSync(dirname(path), { recursive: true })
  const hasEvents = eventFiles().length > 0
  if (hasEvents) {
    // Derived artifact: always rebuild from the log so the file can never drift.
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(path + suffix)) rmSync(path + suffix)
    }
  }
  const db = new Database(path)
  installStrftime(db)
  initSchema(db)
  if (hasEvents) replayEvents(db)
  return withEventCapture(db)
}
