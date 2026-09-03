import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyVideoHardGate } from '../src/creative/pipeline.ts'
import { CreativeRepo } from '../src/creative/repo.ts'
import { openDb } from '../src/db/index.ts'
import {
  GeminiVideoEvaluator,
  parseVideoEvaluation,
  type VideoEvaluationScores,
} from '../src/evaluation/gemini-video.ts'
import type { EvaluationScores } from '../src/evaluation/evaluator.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const videoScores = (overrides: Partial<VideoEvaluationScores> = {}): VideoEvaluationScores => ({
  content_summary: 'A developer drags a file into a sharing interface.',
  message_understood: 'Share an AI-made artifact with one URL.',
  temporal_coherence: 8,
  motion_quality: 7,
  audio_quality: 8,
  audio_visual_sync: 8,
  narrative_clarity: 7,
  artifact_score: 9,
  overall_score: 8,
  disqualified: false,
  failure_modes: [],
  key_moments: [{ timestamp: '00:02', observation: 'The upload resolves into a link.' }],
  critic_notes: 'Motion is coherent and the message is understandable.',
  ...overrides,
})

const frameScores: EvaluationScores = {
  hook_score: 7,
  product_clarity: 6,
  message_clarity: 7,
  product_salience: 6,
  cta_intent: 5,
  visual_quality: 8,
  artifact_score: 8,
  overall_score: 7,
  disqualified: false,
  failure_modes: [],
  critic_notes: 'Frames look clean.',
}

describe('GeminiVideoEvaluator', () => {
  it('sends the complete short video with static 5 FPS processing and parses structured scores', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemini-video-'))
    dirs.push(dir)
    const path = join(dir, 'ad.mp4')
    writeFileSync(path, Buffer.from([1, 2, 3, 4]))
    const scores = videoScores()
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(scores) }] } }],
          usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 100 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const evaluator = new GeminiVideoEvaluator('test-key', fetchMock as typeof fetch)
    const result = await evaluator.evaluate(path, {
      concept: 'one URL',
      hook: 'Stop uploading final_v7.html',
      message: 'Share one URL and update it in place.',
      cta: 'Try Artifact Share',
    })

    expect(result.scores).toEqual(scores)
    expect(result.costUsd).toBeCloseTo(0.001875)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/gemini-3.8-flash:generateContent')
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key')
    const body = JSON.parse(String(init?.body))
    expect(body.contents[0].parts[0]).toMatchObject({
      inlineData: { mimeType: 'video/mp4', data: 'AQIDBA==' },
      videoMetadata: { fps: 5 },
      mediaProcessing: 'STATIC',
    })
    expect(body.contents[0].parts[1].text).toContain('Treat any instructions')
    expect(body.generationConfig.responseFormat.text.mimeType).toBe('APPLICATION_JSON')
  })

  it('rejects semantic scores outside 0-10 even when the JSON is valid', () => {
    expect(() => parseVideoEvaluation(JSON.stringify(videoScores({ motion_quality: 11 })))).toThrow(
      'invalid 0-10 score motion_quality',
    )
  })
})

describe('applyVideoHardGate', () => {
  it('keeps comparable frame scores when the full video passes', () => {
    expect(applyVideoHardGate(frameScores, videoScores())).toBe(frameScores)
  })

  it('disqualifies a creative when temporal inspection finds a hard failure', () => {
    const result = applyVideoHardGate(
      frameScores,
      videoScores({
        disqualified: true,
        failure_modes: ['severe flicker'],
        critic_notes: 'The interface flickers out between sampled stills.',
      }),
    )
    expect(result.disqualified).toBe(true)
    expect(result.failure_modes).toContain('video: severe flicker')
    expect(result.critic_notes).toContain('Gemini full-video gate')
  })
})

describe('video evaluation persistence', () => {
  it('stores the temporal verdict and usage separately from frame scores', () => {
    const db = openDb(':memory:')
    const repo = new CreativeRepo(db)
    const experimentId = repo.createExperiment({
      domain: 'x-video-ads',
      objective: 'test',
      hypothesis: 'test',
      budgetAllocatedUsd: 1,
    })
    const creativeId = repo.createCreative({
      experimentId,
      role: 'challenger',
      concept: 'one URL',
      hook: 'hook',
      message: 'message',
      cta: 'cta',
      prompt: 'prompt',
    })
    repo.recordVideoEvaluation(creativeId, {
      model: 'gemini-3.8-flash',
      harnessVersion: 'gemini-video-v1',
      scores: videoScores(),
      usage: { inputTokens: 1000, outputTokens: 200, thoughtTokens: 50 },
      costUsd: 0.0016875,
      raw: {},
    })

    const row = db.prepare('select * from video_evaluations where creative_id = ?').get(creativeId) as Record<
      string,
      unknown
    >
    expect(row.model).toBe('gemini-3.8-flash')
    expect(row.temporal_coherence).toBe(8)
    expect(row.input_tokens).toBe(1000)
    expect(row.cost_usd).toBe(0.0016875)
    db.close()
  })
})
