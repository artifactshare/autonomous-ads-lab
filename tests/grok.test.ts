import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { grokQuery, isRetryableStatus, retryDelayMs } from '../src/research/grok.ts'

describe('isRetryableStatus', () => {
  it('retries capacity and server-side failures', () => {
    // 429 is the one observed in #231 (xai "resource-exhausted").
    expect(isRetryableStatus(429)).toBe(true)
    for (const s of [500, 502, 503, 504]) expect(isRetryableStatus(s)).toBe(true)
  })

  it('does not retry a request that is itself wrong', () => {
    // Waiting cannot fix a bad key, a bad model name or a malformed body.
    for (const s of [400, 401, 403, 404, 422]) expect(isRetryableStatus(s)).toBe(false)
  })
})

describe('retryDelayMs', () => {
  it('backs off further on the second retry than the first', () => {
    expect(retryDelayMs(2)).toBeGreaterThan(retryDelayMs(1))
  })

  it('bounds the total added wait to about a minute', () => {
    // Daily has no timeout-minutes (6h default) but should not idle for long.
    expect(retryDelayMs(1) + retryDelayMs(2)).toBeLessThanOrEqual(60_000)
  })

  it('honours a Retry-After in seconds when it asks for longer', () => {
    expect(retryDelayMs(1, '30')).toBe(30_000)
  })

  it('keeps its own backoff when Retry-After asks for less', () => {
    // The server saying "1s" should not make us hammer a at-capacity model.
    expect(retryDelayMs(1, '1')).toBe(retryDelayMs(1))
  })

  it('accepts an HTTP-date Retry-After', () => {
    const now = Date.parse('2026-10-19T00:00:00Z')
    const when = new Date(now + 25_000).toUTCString()
    expect(retryDelayMs(1, when, now)).toBe(25_000)
  })

  it('caps an absurd Retry-After so it cannot stall the run', () => {
    expect(retryDelayMs(1, '86400')).toBe(60_000)
  })

  it('falls back to plain backoff for a malformed or past Retry-After', () => {
    for (const v of ['soon', '', '-5', 'not-a-date']) {
      expect(retryDelayMs(1, v)).toBe(retryDelayMs(1))
    }
  })
})

/** Minimal stand-in for the successful Responses API shape. */
const okBody = {
  output: [
    { type: 'x_search_call' },
    { type: 'message', content: [{ type: 'output_text', text: 'two mentions, neutral' }] },
  ],
  usage: { input_tokens: 1000, output_tokens: 500 },
}

const okResponse = () =>
  new Response(JSON.stringify(okBody), { status: 200, headers: { 'Content-Type': 'application/json' } })

const errResponse = (status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ code: 'resource-exhausted', error: 'at capacity' }), { status, headers })

describe('grokQuery retry', () => {
  // Zero-wait sleep: asserts the retry path without real backoff.
  const noWait = { sleep: async () => {} }

  beforeEach(() => {
    process.env.XAI_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.XAI_API_KEY
  })

  it('succeeds on the first attempt without retrying', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const r = await grokQuery('hi', {}, noWait)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r.attempts).toBe(1)
    expect(r.text).toBe('two mentions, neutral')
    expect(r.toolCalls).toBe(1)
  })

  it('recovers the observation when a 429 is followed by success', async () => {
    // This is exactly the 2026-10-19 failure: before the fix the day's
    // mentions research was lost outright.
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(errResponse(429))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const r = await grokQuery('hi', {}, noWait)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(r.attempts).toBe(2)
    expect(r.text).toBe('two mentions, neutral')
  })

  it('retries a 5xx too', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(errResponse(503))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    expect((await grokQuery('hi', {}, noWait)).attempts).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries a network-level fetch rejection', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    expect((await grokQuery('hi', {}, noWait)).attempts).toBe(2)
  })

  it('gives up after the attempt cap and reports the last error', async () => {
    const fetchMock = vi.fn(async () => errResponse(429))
    vi.stubGlobal('fetch', fetchMock)

    await expect(grokQuery('hi', {}, noWait)).rejects.toThrow(/429/)
    // Bounded: 3 attempts, not an unbounded loop.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry a non-retryable status', async () => {
    const fetchMock = vi.fn(async () => errResponse(401))
    vi.stubGlobal('fetch', fetchMock)

    await expect(grokQuery('hi', {}, noWait)).rejects.toThrow(/401/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces the response body in the error for diagnosis', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errResponse(400)))
    await expect(grokQuery('hi', {}, noWait)).rejects.toThrow(/resource-exhausted/)
  })

  it('waits the delay the Retry-After asked for', async () => {
    const slept: number[] = []
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(errResponse(429, { 'retry-after': '30' }))
      .mockResolvedValueOnce(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await grokQuery('hi', {}, { sleep: async (ms) => void slept.push(ms) })

    expect(slept).toEqual([30_000])
  })

  it('does not sleep at all when the first attempt works', async () => {
    const slept: number[] = []
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()))

    await grokQuery('hi', {}, { sleep: async (ms) => void slept.push(ms) })

    expect(slept).toEqual([])
  })

  it('fails fast without retrying when the API key is missing', async () => {
    delete process.env.XAI_API_KEY
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await expect(grokQuery('hi', {}, noWait)).rejects.toThrow(/XAI_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
