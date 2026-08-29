export const config = {
  dbPath: process.env.ADS_LAB_DB ?? 'data/experience.db',
  budget: {
    // Hard limits. Changing these numbers is the single human gate of the project.
    monthlyCreativeUsd: 10,
    monthlyAdsUsd: 30,
    monthlyAiUsd: 10,
    dailyAdsCapUsd: 1.5,
  },
} as const

export type BudgetCategory = 'creative' | 'ads' | 'ai'
