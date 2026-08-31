import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export interface LogContext {
  runId: string
  experimentId?: number
  creativeId?: number
  harnessVersion?: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** How long persisted run logs are kept before `pruneRunLogs` drops them. */
export const RUN_LOG_RETENTION_DAYS = 90

/**
 * Structured JSONL logger. Every autonomous decision must be logged with a
 * `decision` and `reason` so it can be audited later.
 *
 * When a `db` is supplied, each line is also written to the `run_logs` table.
 * The JSONL file lives on a throwaway Actions runner and is gitignored, so the
 * DB copy is the only trace an automated run leaves behind.
 */
export class Logger {
  private ctx: LogContext
  private filePath?: string
  private out: (line: string) => void
  private db?: Database.Database

  constructor(
    ctx: LogContext,
    filePath?: string,
    out: (line: string) => void = (line) => console.log(line),
    db?: Database.Database,
  ) {
    this.ctx = ctx
    this.filePath = filePath
    this.out = out
    this.db = db
    if (filePath) mkdirSync(dirname(filePath), { recursive: true })
  }

  static newRun(filePath?: string, db?: Database.Database): Logger {
    return new Logger({ runId: randomUUID() }, filePath, undefined, db)
  }

  child(ctx: Partial<LogContext>): Logger {
    return new Logger({ ...this.ctx, ...ctx }, this.filePath, this.out, this.db)
  }

  get runId(): string {
    return this.ctx.runId
  }

  log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
    const ts = new Date().toISOString()
    const entry = { ts, level, event, ...this.ctx, ...fields }
    const line = JSON.stringify(entry)
    this.out(line)
    if (this.filePath) appendFileSync(this.filePath, line + '\n')
    this.persist(ts, level, event, fields)
  }

  /**
   * Logging is auxiliary: a failed insert (locked DB, schema drift on an older
   * file) must never take down the run whose work it is describing.
   */
  private persist(
    ts: string,
    level: LogLevel,
    event: string,
    fields: Record<string, unknown>,
  ): void {
    if (!this.db) return
    try {
      this.db
        .prepare(
          `insert into run_logs (ts, run_id, level, event, experiment_id, creative_id, fields)
           values (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ts,
          this.ctx.runId,
          level,
          event,
          this.ctx.experimentId ?? null,
          this.ctx.creativeId ?? null,
          Object.keys(fields).length ? JSON.stringify(fields) : null,
        )
    } catch (err) {
      this.out(JSON.stringify({ ts, level: 'warn', event: 'run_log_persist_failed', error: String(err).slice(0, 200) }))
    }
  }

  info(event: string, fields?: Record<string, unknown>): void {
    this.log('info', event, fields)
  }
  warn(event: string, fields?: Record<string, unknown>): void {
    this.log('warn', event, fields)
  }
  error(event: string, fields?: Record<string, unknown>): void {
    this.log('error', event, fields)
  }

  /** Audit trail for autonomous decisions: what was decided and why. */
  decision(decision: string, reason: string, fields?: Record<string, unknown>): void {
    this.log('info', 'decision', { decision, reason, ...fields })
  }
}

/**
 * Drop run logs older than the retention window. The Experience DB is committed
 * to git on every automated run, so unbounded log growth would bloat the repo.
 * Returns the number of rows deleted.
 */
export function pruneRunLogs(
  db: Database.Database,
  days = RUN_LOG_RETENTION_DAYS,
  now = new Date(),
): number {
  const cutoff = new Date(now.getTime() - days * 86400_000).toISOString()
  return db.prepare('delete from run_logs where ts < ?').run(cutoff).changes
}
