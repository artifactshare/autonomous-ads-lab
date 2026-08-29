import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface LogContext {
  runId: string
  experimentId?: number
  creativeId?: number
  harnessVersion?: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Structured JSONL logger. Every autonomous decision must be logged with a
 * `decision` and `reason` so it can be audited later.
 */
export class Logger {
  private ctx: LogContext
  private filePath?: string
  private out: (line: string) => void

  constructor(
    ctx: LogContext,
    filePath?: string,
    out: (line: string) => void = (line) => console.log(line),
  ) {
    this.ctx = ctx
    this.filePath = filePath
    this.out = out
    if (filePath) mkdirSync(dirname(filePath), { recursive: true })
  }

  static newRun(filePath?: string): Logger {
    return new Logger({ runId: randomUUID() }, filePath)
  }

  child(ctx: Partial<LogContext>): Logger {
    return new Logger({ ...this.ctx, ...ctx }, this.filePath, this.out)
  }

  get runId(): string {
    return this.ctx.runId
  }

  log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
    const entry = { ts: new Date().toISOString(), level, event, ...this.ctx, ...fields }
    const line = JSON.stringify(entry)
    this.out(line)
    if (this.filePath) appendFileSync(this.filePath, line + '\n')
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
