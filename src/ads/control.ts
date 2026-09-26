// Delivery controls over the Ads API: pause/resume the running line item,
// change its daily budget, and verify the funding instrument can still pay.
import type Database from 'better-sqlite3'
import { config } from '../config.ts'
import { accountIdFromEnv, credsFromEnv, fundingInstruments, setLineItemDailyBudget, setLineItemStatus } from './x-ads-api.ts'

const JPY_PER_USD = Number(process.env.JPY_PER_USD ?? 150)

function activeLineItem(db: Database.Database): string {
  const d = db.prepare("select ad_group_id from deployments where status = 'active' order by id desc limit 1").get() as { ad_group_id: string | null } | undefined
  if (!d?.ad_group_id) throw new Error('active deployment has no ad_group_id (line item)')
  return d.ad_group_id
}

export async function pauseDelivery(db: Database.Database, resume = false): Promise<string> {
  if (resume && !config.budget.paidMediaEnabled) throw new Error('paid media disabled by owner (config.budget.paidMediaEnabled = false)')
  const creds = credsFromEnv()
  if (!creds) throw new Error('X_ADS_* secrets not set')
  const li = activeLineItem(db)
  await setLineItemStatus(creds, accountIdFromEnv(), li, resume ? 'ACTIVE' : 'PAUSED')
  return `line item ${li} ${resume ? 'ACTIVE' : 'PAUSED'}`
}

/** The ad account bills in JPY; X takes budgets as local-currency micros. */
export function usdToLocalMicro(usd: number): number {
  return Math.round(usd * JPY_PER_USD) * 1_000_000
}

export async function setDailyBudgetUsd(db: Database.Database, usd: number): Promise<string> {
  const creds = credsFromEnv()
  if (!creds) throw new Error('X_ADS_* secrets not set')
  const li = activeLineItem(db)
  const jpyMicro = usdToLocalMicro(usd)
  await setLineItemDailyBudget(creds, accountIdFromEnv(), li, jpyMicro)
  db.prepare("update deployments set budget_usd = ? where status = 'active' and ad_group_id = ?").run(usd, li)
  return `line item ${li} daily budget ¥${jpyMicro / 1e6} (~$${usd})`
}

// Daily guard: a card that can no longer fund silently halts delivery.
export async function checkFunding(): Promise<string[]> {
  const creds = credsFromEnv()
  if (!creds) return []
  const fi = await fundingInstruments(creds, accountIdFromEnv())
  const bad = fi.filter((f) => !f.able_to_fund || f.entity_status !== 'ACTIVE')
  if (!bad.length) return []
  return bad.map((f) => `⚠️ funding instrument ${f.id} (${f.type}) cannot fund: ${(f.reasons_not_able_to_fund ?? []).join(',') || f.entity_status}`)
}
