// Event-sourced Experience DB.
//
// Problem: a binary SQLite file in git cannot merge, so any two in-flight PRs
// that both touch data/experience.db conflict (observed repeatedly). Fix: the
// source of truth in git is an append-only event log — one JSONL file per run
// under data/events/ (unique filename per run, so git conflicts are
// structurally impossible). The .db file is a gitignored build artifact,
// rebuilt from the log every time openDb() runs.
//
// Capture is generic: every mutating statement (insert/update/delete/replace)
// that goes through the wrapped db is recorded as {t, s, p} = timestamp, SQL,
// params, and replay simply re-executes them in order. Two things make replay
// deterministic:
// - Ordering: event files sort by filename (start-time prefix); statements
//   within a file are in execution order. Jobs that create rowids run
//   serialized (ads-lab-ops concurrency group), so replayed AUTOINCREMENT ids
//   match the ids the writer observed. The bridge writes only `performance`
//   rows keyed by (creative_id, date), which is id-independent.
// - Time: schema defaults use strftime('%Y-...','now'). We override strftime
//   via sqlite3_create_function so that during replay 'now' resolves to the
//   event's original timestamp.
import type Database from 'better-sqlite3'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const EVENTS_DIR = 'data/events'

export interface DbEvent {
  t: string // ISO timestamp at capture
  s: string // SQL text
  p: unknown[] // bound parameters
}

const MUTATING = /^\s*(insert|update|delete|replace)\b/i

// While replaying, strftime('now') resolves to the event being replayed.
let replayNow: string | null = null

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

/** Minimal strftime covering the formats this codebase uses. */
function strftimeJs(fmt: string, when: string): string {
  const d = when === 'now' ? (replayNow ? new Date(replayNow) : new Date()) : new Date(when)
  if (Number.isNaN(d.getTime())) throw new Error(`strftime: unsupported time value "${when}"`)
  return fmt
    .replace(/%Y/g, String(d.getUTCFullYear()))
    .replace(/%m/g, pad(d.getUTCMonth() + 1))
    .replace(/%d/g, pad(d.getUTCDate()))
    .replace(/%H/g, pad(d.getUTCHours()))
    .replace(/%M/g, pad(d.getUTCMinutes()))
    .replace(/%f/g, `${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`)
    .replace(/%S/g, pad(d.getUTCSeconds()))
}

export function installStrftime(db: Database.Database): void {
  // sqlite3_create_function overrides the built-in of the same name/arity.
  db.function('strftime', { deterministic: false }, (fmt: unknown, when: unknown) =>
    strftimeJs(String(fmt), String(when)),
  )
}

export function eventFiles(dir: string = EVENTS_DIR): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
}

/** Re-execute the whole event log against a fresh schema-applied database. */
export function replayEvents(db: Database.Database, dir: string = EVENTS_DIR): number {
  let count = 0
  const files = eventFiles(dir)
  const all = db.transaction(() => {
    for (const f of files) {
      const lines = readFileSync(join(dir, f), 'utf8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        const ev = JSON.parse(line) as DbEvent
        replayNow = ev.t
        db.prepare(ev.s).run(...(ev.p as never[]))
        count++
      }
    }
  })
  try {
    all()
  } finally {
    replayNow = null
  }
  return count
}

/**
 * Wrap a database so every mutating statement is captured. Call
 * `flush()` (done automatically on close()) to persist the run's events.
 */
export function withEventCapture(db: Database.Database, dir: string = EVENTS_DIR): Database.Database {
  const events: DbEvent[] = []
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}-${randomUUID().slice(0, 8)}.jsonl`

  const flush = () => {
    if (!events.length) return
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, fileName), events.map((e) => JSON.stringify(e)).join('\n') + '\n')
    events.length = 0
  }

  const wrapStatement = (stmt: Database.Statement, sql: string): Database.Statement =>
    new Proxy(stmt, {
      get(target, prop, receiver) {
        if (prop === 'run') {
          return (...args: unknown[]) => {
            const result = (target.run as (...a: unknown[]) => unknown)(...(args as never[]))
            events.push({ t: new Date().toISOString(), s: sql, p: args.map((a) => (a === undefined ? null : a)) })
            return result
          }
        }
        const v = Reflect.get(target, prop, receiver)
        return typeof v === 'function' ? v.bind(target) : v
      },
    })

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => {
          const stmt = target.prepare(sql)
          return MUTATING.test(sql) ? wrapStatement(stmt, sql) : stmt
        }
      }
      if (prop === 'close') {
        return () => {
          flush()
          return target.close()
        }
      }
      if (prop === 'exec') {
        return (sql: string) => {
          if (MUTATING.test(sql)) {
            const result = target.exec(sql)
            events.push({ t: new Date().toISOString(), s: sql, p: [] })
            return result
          }
          return target.exec(sql)
        }
      }
      const v = Reflect.get(target, prop, receiver)
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}
