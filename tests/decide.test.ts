import { describe, expect, it } from 'vitest'
import { formatGa4Outcomes } from '../src/ops/decide.ts'

describe('formatGa4Outcomes', () => {
  it('reports an unmeasured landing rate when no conversions rows are synced', () => {
    const s = formatGa4Outcomes({ syncedDays: 0, sessions: 0, signUps: 0 }, 49, 5.83)
    expect(s).toContain('not synced yet')
    expect(s).not.toContain('of clicks landed')
  })

  it('reports a measured 0% when synced rows exist with zero sessions', () => {
    const s = formatGa4Outcomes({ syncedDays: 2, sessions: 0, signUps: 0 }, 49, 5.83)
    expect(s).toContain('GA4 0 sessions (0% of clicks landed)')
  })

  it('reports landing rate and cost per session when sessions exist', () => {
    const s = formatGa4Outcomes({ syncedDays: 4, sessions: 20, signUps: 1 }, 49, 5.83)
    expect(s).toContain('41% of clicks landed')
    expect(s).toContain('$0.29/session')
    expect(s).toContain('1 sign_ups')
  })
})
