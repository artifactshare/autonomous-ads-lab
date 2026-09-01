import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installStrftime, replayEvents, withEventCapture } from '../src/db/events.ts'

const SCHEMA = `
create table if not exists notes (
  id integer primary key,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  body text not null
);`

function fresh(): Database.Database {
  const db = new Database(':memory:')
  installStrftime(db)
  db.exec(SCHEMA)
  return db
}

describe('event-sourced db', () => {
  it('captures mutations and replays them into an identical database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'events-'))
    const writer = withEventCapture(fresh(), dir)
    writer.prepare('insert into notes (body) values (?)').run('first')
    writer.prepare('insert into notes (body) values (?)').run('second')
    writer.prepare('update notes set body = ? where id = ?').run('second-edited', 2)
    const before = writer.prepare('select id, created_at, body from notes order by id').all()
    writer.close() // flushes the event file

    expect(readdirSync(dir).filter((f) => f.endsWith('.jsonl'))).toHaveLength(1)

    const rebuilt = fresh()
    const replayed = replayEvents(rebuilt, dir)
    expect(replayed).toBe(3)
    const after = rebuilt.prepare('select id, created_at, body from notes order by id').all()
    // created_at must survive replay exactly (strftime('now') is pinned to the
    // event timestamp during replay).
    expect(after).toEqual(before)
  })

  it('does not capture reads and does not write a file when nothing changed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'events-'))
    const db = withEventCapture(fresh(), dir)
    db.prepare('select count(*) as n from notes').get()
    db.close()
    expect(readdirSync(dir)).toHaveLength(0)
  })

  it('supports transactions through the wrapper', () => {
    const dir = mkdtempSync(join(tmpdir(), 'events-'))
    const db = withEventCapture(fresh(), dir)
    const insert = db.prepare('insert into notes (body) values (?)')
    const tx = db.transaction((bodies: string[]) => {
      for (const b of bodies) insert.run(b)
    })
    tx(['a', 'b', 'c'])
    db.close()
    const rebuilt = fresh()
    expect(replayEvents(rebuilt, dir)).toBe(3)
    expect((rebuilt.prepare('select count(*) as n from notes').get() as { n: number }).n).toBe(3)
  })
})
