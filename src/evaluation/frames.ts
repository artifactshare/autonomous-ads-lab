import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Extract N evenly spaced frames from a video into outDir as PNG. */
export function extractFrames(videoPath: string, outDir: string, count = 5): string[] {
  mkdirSync(outDir, { recursive: true })
  const durationSec = Number(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath],
      { encoding: 'utf8' },
    ).trim(),
  )
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error(`could not read duration of ${videoPath}`)
  }
  for (let i = 0; i < count; i++) {
    // Sample at (i + 0.5) / count so first/last frames avoid fade-in/out edges.
    const t = ((i + 0.5) / count) * durationSec
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', t.toFixed(2), '-i', videoPath,
      '-frames:v', '1', join(outDir, `frame-${i}.png`),
    ])
  }
  return readdirSync(outDir)
    .filter((f) => f.startsWith('frame-'))
    .sort()
    .map((f) => join(outDir, f))
}
