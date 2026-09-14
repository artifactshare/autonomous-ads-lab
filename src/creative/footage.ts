// Footage mode: creatives are the real review-loop recording plus a hook card,
// captions and an end card rendered with Remotion. No generated video, $0 media cost.
// The hypothesis LLM proposes hooks; this renders them into data/creatives/{id}/final.mp4
// and runs the normal evaluation.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type Database from 'better-sqlite3'
import type { Logger } from '../logging/logger.ts'
import { CreativeRepo, type NewCreative } from './repo.ts'
import { evaluateLocalVideo } from './pipeline.ts'
import { defaultAdProps, type AdProps } from './remotion/LoopAd.tsx'

export const FOOTAGE_DIR = 'data/footage/loop-2026-09-14'
export const FOOTAGE_MODEL = 'remotion-footage/loop-2026-09-14'

export interface HookVariant {
  hook: string        // opening card
  endTitle?: string   // end card headline (default keeps the loop message)
  captions?: AdProps['captions']
}

export function adPropsFor(v: HookVariant): AdProps {
  return { ...defaultAdProps, hook: v.hook, endTitle: v.endTitle ?? defaultAdProps.endTitle, captions: v.captions ?? defaultAdProps.captions }
}

export function renderAd(props: AdProps, outPath: string): void {
  mkdirSync(resolve(outPath, '..'), { recursive: true })
  const propsFile = outPath.replace(/\.mp4$/, '.props.json')
  writeFileSync(propsFile, JSON.stringify(props))
  execFileSync(
    'npx',
    ['remotion', 'render', 'src/creative/remotion/index.ts', 'LoopAd', outPath, '--props', propsFile, '--public-dir', FOOTAGE_DIR, '--codec', 'h264', '--crf', '18', '--log', 'error'],
    { stdio: 'inherit' },
  )
  if (!existsSync(outPath)) throw new Error(`remotion produced no file at ${outPath}`)
}

export async function produceFootageCreative(
  db: Database.Database,
  log: Logger,
  creative: NewCreative,
  variant: HookVariant,
): Promise<{ creativeId: number; disqualified: boolean; overall: number; videoPath: string }> {
  const repo = new CreativeRepo(db)
  const creativeId = repo.createCreative(creative)
  const clog = log.child({ creativeId, experimentId: creative.experimentId })
  const props = adPropsFor(variant)
  const videoPath = `data/creatives/${creativeId}/final.mp4`
  const t0 = Date.now()
  clog.decision('render_footage_creative', `hook="${variant.hook}"`)
  renderAd(props, videoPath)
  repo.recordSubmission(creativeId, FOOTAGE_MODEL, `local-${creativeId}`)
  repo.recordGeneration(creativeId, {
    assetUrl: videoPath,
    model: FOOTAGE_MODEL,
    seed: null,
    settings: { footage: FOOTAGE_DIR, props },
    costUsd: 0,
    latencyMs: Date.now() - t0,
    raw: null,
  })
  const durationSec = Math.round(props.hookSeconds + props.endSeconds + 24.5)
  return evaluateLocalVideo(db, clog, creativeId, { ...creative, assetUrl: videoPath }, videoPath, durationSec)
}
