// xAI Grok client via the Responses API with agentic server-side tools
// (x_search / web_search). The legacy Live Search API was retired 2025-12.

const BASE = 'https://api.x.ai/v1/responses'
const MODEL = 'grok-4.3' // cheap tier: $1.25/M in, $2.50/M out
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
  raw: unknown
}

/** Conservative pre-authorization estimate for one research query. */
export function estimateQueryCostUsd(): number {
  // ~8k in + 3k out on grok-4.3 (~$0.018) + up to 15 tool calls ($0.075)
  return 0.1
}

export async function grokQuery(prompt: string, opts: GrokSearchOptions = {}): Promise<GrokResult> {
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

  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: [{ role: 'user', content: prompt }], tools }),
  })
  if (!res.ok) throw new Error(`xai responses -> ${res.status}: ${await res.text()}`)
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
    raw: body,
  }
}
