import type Database from 'better-sqlite3'
import { config, type BudgetCategory } from '../config.ts'

export interface SpendRequest {
  category: BudgetCategory
  amountUsd: number
  description: string
  runId: string
  experimentId?: number
  creativeId?: number
  /** Same key twice = second call is a no-op success (already paid). */
  idempotencyKey?: string
}

export type AuthorizeResult =
  | { ok: true; ledgerId: number; duplicate: boolean }
  | { ok: false; reason: string }

const MONTHLY_LIMITS: Record<BudgetCategory, number> = {
  creative: config.budget.monthlyCreativeUsd,
  ads: config.budget.monthlyAdsUsd,
  ai: config.budget.monthlyAiUsd,
}

/**
 * Code-level hard budget constraint. Every paid action must call authorize()
 * BEFORE execution and abort when it returns ok: false.
 */
export class BudgetController {
  private db: Database.Database
  private now: () => Date

  constructor(db: Database.Database, now: () => Date = () => new Date()) {
    this.db = db
    this.now = now
  }

  authorize(req: SpendRequest): AuthorizeResult {
    if (!(req.amountUsd > 0)) return { ok: false, reason: 'amount must be positive' }

    const tx = this.db.transaction((): AuthorizeResult => {
      if (req.idempotencyKey) {
        const existing = this.db
          .prepare('select id from budget_ledger where idempotency_key = ?')
          .get(req.idempotencyKey) as { id: number } | undefined
        if (existing) return { ok: true, ledgerId: existing.id, duplicate: true }
      }

      const monthLimit = MONTHLY_LIMITS[req.category]
      const monthSpent = this.spentSince(this.monthStart(), req.category)
      if (monthSpent + req.amountUsd > monthLimit) {
        return {
          ok: false,
          reason: `monthly ${req.category} budget exceeded: spent $${monthSpent.toFixed(2)} + $${req.amountUsd.toFixed(2)} > $${monthLimit}`,
        }
      }

      if (req.category === 'ads') {
        const daySpent = this.spentSince(this.dayStart(), 'ads')
        if (daySpent + req.amountUsd > config.budget.dailyAdsCapUsd) {
          return {
            ok: false,
            reason: `daily ads cap exceeded: spent $${daySpent.toFixed(2)} + $${req.amountUsd.toFixed(2)} > $${config.budget.dailyAdsCapUsd}`,
          }
        }
      }

      const info = this.db
        .prepare(
          `insert into budget_ledger
             (category, amount_usd, description, run_id, experiment_id, creative_id, idempotency_key, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          req.category,
          req.amountUsd,
          req.description,
          req.runId,
          req.experimentId ?? null,
          req.creativeId ?? null,
          req.idempotencyKey ?? null,
          this.now().toISOString(),
        )
      return { ok: true, ledgerId: Number(info.lastInsertRowid), duplicate: false }
    })
    return tx.immediate()
  }

  /**
   * Replace an authorize-time estimate with the actual cost, once known.
   *
   * The ledger gates future spend, so an estimate that never gets corrected
   * makes the cap fire early (over-estimate) or late (under-estimate). This
   * only rewrites an existing row; it is never a way to spend past a limit,
   * because authorize() has already run for this action. If the actual came
   * in HIGHER than the estimate the row goes up, which correctly makes the
   * next authorize() stricter.
   *
   * Do not call this for a duplicate (idempotent) authorization: that row
   * belongs to an earlier, already-paid action.
   */
  reconcile(ledgerId: number, actualUsd: number): { ok: true; deltaUsd: number } | { ok: false; reason: string } {
    if (!Number.isFinite(actualUsd) || actualUsd < 0) {
      return { ok: false, reason: 'actual amount must be a finite, non-negative number' }
    }
    const tx = this.db.transaction((): { ok: true; deltaUsd: number } | { ok: false; reason: string } => {
      const row = this.db
        .prepare('select amount_usd from budget_ledger where id = ?')
        .get(ledgerId) as { amount_usd: number } | undefined
      if (!row) return { ok: false, reason: `ledger entry ${ledgerId} not found` }
      this.db.prepare('update budget_ledger set amount_usd = ? where id = ?').run(actualUsd, ledgerId)
      return { ok: true, deltaUsd: actualUsd - row.amount_usd }
    })
    return tx.immediate()
  }

  status() {
    const month = this.monthStart()
    const day = this.dayStart()
    return {
      month: {
        creative: { spent: this.spentSince(month, 'creative'), limit: MONTHLY_LIMITS.creative },
        ads: { spent: this.spentSince(month, 'ads'), limit: MONTHLY_LIMITS.ads },
        ai: { spent: this.spentSince(month, 'ai'), limit: MONTHLY_LIMITS.ai },
      },
      today: { ads: { spent: this.spentSince(day, 'ads'), limit: config.budget.dailyAdsCapUsd } },
    }
  }

  private spentSince(sinceIso: string, category: BudgetCategory): number {
    const row = this.db
      .prepare(
        'select coalesce(sum(amount_usd), 0) as total from budget_ledger where category = ? and created_at >= ?',
      )
      .get(category, sinceIso) as { total: number }
    return row.total
  }

  private monthStart(): string {
    const d = this.now()
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
  }

  private dayStart(): string {
    const d = this.now()
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
  }
}
