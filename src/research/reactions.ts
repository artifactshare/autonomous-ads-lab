import type Database from 'better-sqlite3'
import type { Logger } from '../logging/logger.ts'
import { ResearchRepo, type AdReaction } from './repo.ts'

export interface ParsedReaction {
  url: string
  type: 'reply' | 'quote'
  text: string
  sentiment: AdReaction['sentiment']
  signals: AdReaction['signals']
  analysis: string
  observed_at?: string
}

export interface ParsedReactionResponse {
  status: 'verified' | 'unverified'
  reactions: ParsedReaction[]
  note?: string
}

const signalKeys: (keyof AdReaction['signals'])[] = [
  'message_confusion',
  'ai_trust_concern',
  'value_objection',
  'question_or_interest',
  'positive',
  'spam_or_irrelevant',
]

export function parseReactionResponse(text: string): ParsedReactionResponse {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('reaction response contained no JSON object')
  const raw = JSON.parse(match[0]) as Record<string, unknown>
  if (raw.status !== 'verified' && raw.status !== 'unverified') throw new Error('invalid reaction collection status')
  const reactions = Array.isArray(raw.reactions) ? raw.reactions : []
  const parsed = reactions.map((value): ParsedReaction => {
    const item = value as Record<string, unknown>
    if (typeof item.url !== 'string' || !/^https:\/\/x\.com\/[^/]+\/status\/\d+$/.test(item.url)) {
      throw new Error('invalid reaction URL')
    }
    if (item.type !== 'reply' && item.type !== 'quote') throw new Error('invalid reaction type')
    if (typeof item.text !== 'string' || typeof item.analysis !== 'string') throw new Error('reaction text/analysis missing')
    if (!['positive', 'negative', 'neutral', 'mixed'].includes(String(item.sentiment))) throw new Error('invalid reaction sentiment')
    const rawSignals = (item.signals ?? {}) as Record<string, unknown>
    const signals = Object.fromEntries(signalKeys.map((key) => [key, rawSignals[key] === true])) as AdReaction['signals']
    return {
      url: item.url,
      type: item.type,
      text: item.text,
      sentiment: item.sentiment as AdReaction['sentiment'],
      signals,
      analysis: item.analysis,
      observed_at: typeof item.observed_at === 'string' ? item.observed_at : undefined,
    }
  })
  return { status: raw.status, reactions: parsed, note: typeof raw.note === 'string' ? raw.note : undefined }
}

export function authorFromPostUrl(url: string): string | undefined {
  return url.match(/^https:\/\/x\.com\/([^/]+)\/status\/\d+$/)?.[1]
}

export function recordParsedReactions(
  db: Database.Database,
  log: Logger,
  target: { deploymentId: number; creativeId: number; postUrl: string },
  response: ParsedReactionResponse,
  checkedDate: string,
): { observed: number; inserted: number } {
  const repo = new ResearchRepo(db)
  let inserted = 0
  // An unverified response may contain guesses; never persist them as posts.
  for (const reaction of response.status === 'verified' ? response.reactions : []) {
    if (repo.recordAdReaction({
      deploymentId: target.deploymentId,
      creativeId: target.creativeId,
      parentPostUrl: target.postUrl,
      reactionUrl: reaction.url,
      reactionType: reaction.type,
      authorHandle: authorFromPostUrl(reaction.url),
      text: reaction.text,
      sentiment: reaction.sentiment,
      signals: reaction.signals,
      analysis: reaction.analysis,
      observedAt: reaction.observed_at ?? new Date().toISOString(),
      source: 'grok',
    })) inserted += 1
  }
  repo.recordReactionCollection({
    checkedDate,
    deploymentId: target.deploymentId,
    runId: log.runId,
    status: response.status === 'verified' ? 'success' : 'unverified',
    observedCount: response.status === 'verified' ? response.reactions.length : undefined,
    newCount: response.status === 'verified' ? inserted : undefined,
    error: response.status === 'unverified' ? response.note ?? 'X results could not be verified' : undefined,
  })
  return { observed: response.status === 'verified' ? response.reactions.length : 0, inserted }
}
