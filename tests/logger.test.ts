import { describe, expect, it } from 'vitest'
import { openDb } from '../src/db/index.ts'
import { Logger, pruneRunLogs } from '../src/logging/logger.ts'

type Row = {
  ts: string
  run_id: string
  level: string
  event: string
  experiment_id: number | null
  creative_id: number | null
  fields: string | null
}

function setup() {
  const db = openDb(':memory:')
  const lines: string[] = []
  const log = new Logger({ runId: 'run-1' }, undefined, (l) => lines.push(l), db)
  const rows = () => db.prepare('select * from run_logs order by id').all() as Row[]
  return { db, log, lines, rows }
}

describe('Logger DB sink', () => {
  it('persists every level with its structured fields', () => {
    const { log, rows } = setup()
    log.info('budget_status', { spent: 2.8 })
    log.warn('research_skipped', { reason: 'no key' })
    log.error('decide_failed', { error: 'boom' })

    expect(rows().map((r) => [r.level, r.event])).toEqual([
      ['info', 'budget_status'],
      ['warn', 'research_skipped'],
      ['error', 'decide_failed'],
    ])
    expect(JSON.parse(rows()[0]!.fields!)).toEqual({ spent: 2.8 })
    expect(rows().every((r) => r.run_id === 'run-1')).toBe(true)
  })

  it('records decisions with decision and reason', () => {
    const { log, rows } = setup()
    log.decision('new_generation', 'champion CTR below threshold', { creativeId: 7 })
    const row = rows()[0]!
    expect(row.event).toBe('decision')
    expect(JSON.parse(row.fields!)).toMatchObject({
      decision: 'new_generation',
      reason: 'champion CTR below threshold',
    })
  })

  it('carries child context into its own columns', () => {
    const { log, rows } = setup()
    log.child({ experimentId: 3, creativeId: 9 }).info('generated')
    expect(rows()[0]!).toMatchObject({ experiment_id: 3, creative_id: 9, run_id: 'run-1' })
  })

  it('leaves fields null when there are none', () => {
    const { log, rows } = setup()
    log.info('living_report_published')
    expect(rows()[0]!.fields).toBeNull()
  })

  it('still logs to stdout when no db is given', () => {
    const lines: string[] = []
    new Logger({ runId: 'r' }, undefined, (l) => lines.push(l)).info('hello', { a: 1 })
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: 'hello', a: 1, runId: 'r' })
  })

  it('never throws when the insert fails, and keeps the run going', () => {
    const { db, log, lines, rows } = setup()
    db.exec('drop table run_logs')
    expect(() => log.info('budget_status')).not.toThrow()
    expect(lines.some((l) => l.includes('run_log_persist_failed'))).toBe(true)
    db.exec(
      'create table run_logs (id integer primary key, ts text, run_id text, level text, event text, experiment_id integer, creative_id integer, fields text)',
    )
    log.info('recovered')
    expect(rows().map((r) => r.event)).toEqual(['recovered'])
  })
})

describe('pruneRunLogs', () => {
  it('drops rows past the retention window and keeps the rest', () => {
    const db = openDb(':memory:')
    const insert = db.prepare(
      "insert into run_logs (ts, run_id, level, event) values (?, 'r', 'info', 'e')",
    )
    insert.run('2026-01-01T00:00:00.000Z') // old
    insert.run('2026-08-01T00:00:00.000Z') // within 90 days of 2026-08-31
    const now = new Date('2026-08-31T00:00:00Z')

    expect(pruneRunLogs(db, 90, now)).toBe(1)
    const left = db.prepare('select ts from run_logs').all() as { ts: string }[]
    expect(left.map((r) => r.ts)).toEqual(['2026-08-01T00:00:00.000Z'])
  })

  it('is a no-op on an empty table', () => {
    expect(pruneRunLogs(openDb(':memory:'))).toBe(0)
  })
})
