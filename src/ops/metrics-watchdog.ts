// The daily metrics watchdog only carries information when zero rows is
// surprising. Since the owner turned paid media off (2026-09-26, #187) nothing
// delivers, so "no metrics for yesterday" fired every single day and both the
// journal and Slack learned to ignore it — exactly the signal we would need on
// the day a real Ads API sync failure happens (#194). Condition the alert on
// whether delivery was expected at all.
import { config } from '../config.ts'

export interface MetricsObservation {
  /** Rows in `performance` for the watched date. */
  rows: number
  /**
   * Deployments still marked delivering. Read before the budget guard runs, so
   * it reflects the state the watched day was served under rather than a pause
   * the guard applies moments later.
   */
  activeDeployments: number
  paidMediaEnabled?: boolean
}

export type MetricsVerdict =
  /** Data arrived. Nothing to say. */
  | { kind: 'fresh' }
  /** Nothing was delivering, so zero rows is the expected outcome. */
  | { kind: 'idle'; reason: string }
  /** Delivery was expected and produced nothing: the loop is flying blind. */
  | { kind: 'stale' }

export function classifyMetrics({
  rows,
  activeDeployments,
  paidMediaEnabled = config.budget.paidMediaEnabled,
}: MetricsObservation): MetricsVerdict {
  if (rows > 0) return { kind: 'fresh' }
  // The owner kill switch outranks the deployment table: while it is off no
  // line item may serve, whatever a stale `deployments` row claims.
  if (!paidMediaEnabled) return { kind: 'idle', reason: 'paid media is off (config.budget.paidMediaEnabled)' }
  if (activeDeployments === 0) return { kind: 'idle', reason: 'no active deployment' }
  return { kind: 'stale' }
}

/** Journal line for a verdict, or null when there is nothing worth a line. */
export function describeVerdict(verdict: MetricsVerdict, date: string): string | null {
  switch (verdict.kind) {
    case 'fresh':
      return null
    case 'idle':
      return `watchdog: no metrics for ${date} — expected, ${verdict.reason}`
    case 'stale':
      return `watchdog: no metrics for ${date} — Ads API sync failed or nothing served (Slack alerted)`
  }
}
