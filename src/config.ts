export const config = {
  dbPath: process.env.ADS_LAB_DB ?? 'data/experience.db',
  budget: {
    // Hard limits. Changing these numbers is the single human gate of the project.
    monthlyCreativeUsd: 10,
    monthlyAdsUsd: 30,
    monthlyAiUsd: 10,
    dailyAdsCapUsd: 1,
    // Owner decision 2026-09-26: paid media is off. At $30/month about 34
    // people land per month, so even at the site-wide ~1% sign-up rate the
    // experiment cannot observe a sign-up. Nothing may start or resume X
    // delivery while this is false.
    paidMediaEnabled: false,
  },
} as const

export type BudgetCategory = 'creative' | 'ads' | 'ai'
