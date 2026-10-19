// xAI Grok client via the Responses API with agentic server-side tools
// (x_search / web_search). The legacy Live Search API was retired 2025-12.
import { modelFor } from '../llm/policy.ts'

const BASE = 'https://api.x.ai/v1/responses'
const PRICE_IN = 1.25 / 1e6
const PRICE_OUT = 2.5 / 1e6
const PRICE_TOOL_CALL = 0.005 // $5 / 1k web_search or x_search calls

export interface GrokSearchOptions {
  xSearch?: { fromDate?: string; toDate?: string; allowedHandles?: string[] }
  webSearch?: boolean
}

export interface GrokResult {
  text: string
  costUsd: number
  toolCalls: number
  usage: { input: number; output: number }
  /** How many HTTP attempts it took (1 = succeeded first try). */
  attempts: number
  raw: unknown
}

/** Conservative pre-authorization estimate for one research query. */
export function estimateQueryCostUsd(): number {
  // ~8k in + 3k out on grok-4.3 (~$0.018) + up to 15 tool calls ($0.075)
  return 0.1
}

/** Total HTTP attempts per query: the first try plus two retries. */
const MAX_ATTEMPTS = 3
/**
 * Backoff before the 2nd and 3rd attempt. Bounded (15s + 45s) so a daily run
 * cannot hang on it; xAI asks for "a few minutes" but we would rather lose the
 * query than hold the ops job open.
 */
const FIRST_BACKOFF_MS = 15_000
const LATER_BACKOFF_MS = 45_000
/** Cap on a server-supplied Retry-After, so a hostile/odd value cannot stall us. */
const MAX_RETRY_AFTER_MS = 60_000

/**
 * Whether re-sending the identical request could plausibly succeed.
 *
 * 429 is the one that actually bit us (#231): xAI returns
 * `resource-exhausted` with "try again in a few minutes" when the model is at
 * capacity. 5xx is the same shape of transient. 4xx otherwise means the
 * request itself is wrong (bad key, bad model, malformed body) and waiting
 * changes nothing -- retrying those just burns the clock and hides the error.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * How long to wait before the next attempt. `attempt` is 1-based and counts
 * the try that just failed. Honours a 429's `Retry-After` (seconds, or an
 * HTTP-date) when it asks for longer than our own backoff, since the server
 * knows its own capacity window better than we do -- but never longer than
 * MAX_RETRY_AFTER_MS.
 */
export function retryDelayMs(attempt: number, retryAfter?: string | null, now: number = Date.now()): number {
  const base = attempt <= 1 ? FIRST_BACKOFF_MS : LATER_BACKOFF_MS
  if (!retryAfter) return base
  const trimmed = retryAfter.trim()
  // Retry-After is either delta-seconds or an HTTP-date (RFC 9110).
  const seconds = /^\d+$/.test(trimmed) ? Number(trimmed) : (Date.parse(trimmed) - now) / 1000
  if (!Number.isFinite(seconds) || seconds <= 0) return base
  return Math.min(Math.max(base, seconds * 1000), MAX_RETRY_AFTER_MS)
}

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Test seam: lets the retry path be exercised without real waiting. */
export interface GrokRetryOptions {
  maxAttempts?: number
  sleep?: (ms: number) => Promise<void>
}

type AttemptResult =
  | { ok: true; res: Response }
  | { ok: false; error: Error; retryable: boolean; retryAfter?: string | null }

export async function grokQuery(
  prompt: string,
  opts: GrokSearchOptions = {},
  retry: GrokRetryOptions = {},
): Promise<GrokResult> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) throw new Error('XAI_API_KEY is not set')

  const tools: Record<string, unknown>[] = []
  if (opts.xSearch) {
    tools.push({
      type: 'x_search',
      ...(opts.xSearch.fromDate ? { from_date: opts.xSearch.fromDate } : {}),
      ...(opts.xSearch.toDate ? { to_date: opts.xSearch.toDate } : {}),
      ...(opts.xSearch.allowedHandles ? { allowed_x_handles: opts.xSearch.allowedHandles } : {}),
    })
  }
  if (opts.webSearch) tools.push({ type: 'web_search' })

  const model = modelFor('research').model
  const maxAttempts = retry.maxAttempts ?? MAX_ATTEMPTS
  const sleep = retry.sleep ?? sleepMs

  // Retry lives inside the caller's single budget authorization, so a retried
  // query is never charged twice. A 429 is rejected before any work is done
  // upstream, so re-sending costs nothing either.
  const attemptOnce = async (): Promise<AttemptResult> => {
    let res: Response
    try {
      res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: [{ role: 'user', content: prompt }], tools }),
      })
    } catch (err) {
      // fetch itself failed: DNS, ECONNRESET, socket timeout. Transient in the
      // same way a 5xx is -- nothing reached the model, so re-sending is safe.
      return { ok: false, error: err instanceof Error ? err : new Error(String(err)), retryable: true }
    }
    if (res.ok) return { ok: true, res }
    // Read the body now: it is the only diagnostic we get, and a Response body
    // can only be consumed once.
    return {
      ok: false,
      error: new Error(`xai responses -> ${res.status}: ${await res.text()}`),
      retryable: isRetryableStatus(res.status),
      retryAfter: res.headers.get('retry-after'),
    }
  }

  let res: Response
  let attempts = 0
  for (let attempt = 1; ; attempt += 1) {
    attempts = attempt
    const result = await attemptOnce()
    if (result.ok) {
      res = result.res
      break
    }
    if (!result.retryable || attempt >= maxAttempts) throw result.error
    await sleep(retryDelayMs(attempt, result.retryAfter))
  }

  const body = (await res.json()) as {
    output?: { type: string; content?: { type: string; text?: string }[] }[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  const text = (body.output ?? [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text' && c.text)
    .map((c) => c.text)
    .join('\n')
  const toolCalls = (body.output ?? []).filter((o) => o.type.endsWith('_call')).length
  const input = body.usage?.input_tokens ?? 0
  const output = body.usage?.output_tokens ?? 0
  return {
    text,
    toolCalls,
    usage: { input, output },
    costUsd: input * PRICE_IN + output * PRICE_OUT + toolCalls * PRICE_TOOL_CALL,
    attempts,
    raw: body,
  }
}
