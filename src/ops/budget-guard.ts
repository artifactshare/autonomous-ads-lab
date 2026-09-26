// Monthly-cap kill switch for live delivery. BudgetController only gates
// spend the agent initiates (creative generation etc.); media spend accrues on
// X's side and nothing paused delivery once the month's ads budget was gone
// (found 2026-09-21: the September ledger crossed the $30 cap with the line
// item still delivering ~$1.5/day). This guard runs every daily: once the
// month's ads spend can no longer fit another capped day, it pauses every live
// line item. In a month with room again (normally the 1st) it resumes only the
// rows it paused itself (status 'paused'); human-stopped rows stay stopped.
import type Database from 'better-sqlite3'
import { config } from '../config.ts'

export function adsCapReached(monthSpentUsd: number): boolean {
  return monthSpentUsd + config.budget.dailyAdsCapUsd > config.budget.monthlyAdsUsd
}

type SetStatus = (lineItemId: string, status: 'ACTIVE' | 'PAUSED') => Promise<void>

async function defaultSetStatus(lineItemId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
  const { accountIdFromEnv, credsFromEnv, setLineItemStatus } = await import('../ads/x-ads-api.ts')
  const creds = credsFromEnv()
  if (!creds) throw new Error('X_ADS_* secrets not set')
  await setLineItemStatus(creds, accountIdFromEnv(), lineItemId, status)
}

export async function enforceMonthlyAdsCap(
  db: Database.Database,
  monthSpentUsd: number,
  setStatus: SetStatus = defaultSetStatus,
): Promise<string[]> {
  const lineItems = (status: string) =>
    (
      db
        .prepare('select distinct ad_group_id as li from deployments where status = ? and ad_group_id is not null')
        .all(status) as Array<{ li: string }>
    ).map((r) => r.li)
  if (adsCapReached(monthSpentUsd)) {
    const active = lineItems('active')
    if (!active.length) return []
    for (const li of active) await setStatus(li, 'PAUSED')
    db.prepare("update deployments set status = 'paused' where status = 'active' and ad_group_id is not null").run()
    return [
      `budget guard: paused line item(s) ${active.join(', ')} — monthly ads $${monthSpentUsd.toFixed(2)} spent leaves no room for another $${config.budget.dailyAdsCapUsd} day under the $${config.budget.monthlyAdsUsd} cap; auto-resumes when a month has room`,
    ]
  }
  const paused = lineItems('paused')
  if (!paused.length) return []
  for (const li of paused) await setStatus(li, 'ACTIVE')
  db.prepare("update deployments set status = 'active' where status = 'paused' and ad_group_id is not null").run()
  return [
    `budget guard: resumed line item(s) ${paused.join(', ')} — monthly ads $${monthSpentUsd.toFixed(2)} fits under the $${config.budget.monthlyAdsUsd} cap`,
  ]
}
