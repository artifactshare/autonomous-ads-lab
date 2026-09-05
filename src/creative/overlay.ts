import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface OverlayText {
  /** Shown during the opening (hook line). */
  hook: string
  /** End card: product name / URL. */
  brand: string
  /** End card: call to action. */
  cta: string
}

// Generated video text is unreliable (H3 Max garbles UI text), so all copy that
// must be readable is burned in deterministically with drawtext.
const FONT_CANDIDATES = [
  '/System/Library/Fonts/Helvetica.ttc', // macOS
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', // ubuntu (GH Actions)
]

export function assertOverlayToolchain(
  run: (command: string, args: string[]) => unknown = (command, args) =>
    execFileSync(command, args, { stdio: 'ignore' }),
  exists: (path: string) => boolean = existsSync,
): string {
  const f = FONT_CANDIDATES.find((p) => exists(p))
  if (!f) throw new Error('no usable font found for drawtext')
  try {
    run('ffmpeg', ['-version'])
  } catch (err) {
    throw new Error(`ffmpeg is required before paid creative generation: ${String(err)}`)
  }
  return f
}

const escPath = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:')

export function overlayFilters(
  font: string,
  files: { hook: string; brand: string; cta: string },
  durationSec: number,
): string {
  const common = `fontfile='${escPath(font)}':fontcolor=white:borderw=3:bordercolor=black@0.85`
  const hookEnd = durationSec * 0.4
  const endStart = Math.max(hookEnd, durationSec - 1.6)
  return [
    `drawtext=${common}:fontsize=h/14:textfile='${escPath(files.hook)}':x=(w-text_w)/2:y=h/8:enable='lt(t,${hookEnd})'`,
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill:enable='gte(t,${endStart})'`,
    `drawtext=${common}:fontsize=h/10:textfile='${escPath(files.brand)}':x=(w-text_w)/2:y=(h-text_h)/2-h/12:enable='gte(t,${endStart})'`,
    `drawtext=${common}:fontsize=h/16:textfile='${escPath(files.cta)}':x=(w-text_w)/2:y=(h-text_h)/2+h/16:enable='gte(t,${endStart})'`,
  ].join(',')
}

/** Burn hook text + end card onto a video. Returns the output path. */
export function applyOverlay(inputPath: string, outputPath: string, text: OverlayText, durationSec = 5): string {
  const font = assertOverlayToolchain()
  const dir = mkdtempSync(join(tmpdir(), 'ads-overlay-'))
  const files = {
    hook: join(dir, 'hook.txt'),
    brand: join(dir, 'brand.txt'),
    cta: join(dir, 'cta.txt'),
  }
  try {
    writeFileSync(files.hook, text.hook, 'utf8')
    writeFileSync(files.brand, text.brand, 'utf8')
    writeFileSync(files.cta, text.cta, 'utf8')
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-vf', overlayFilters(font, files, durationSec),
      '-c:a', 'copy',
      outputPath,
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return outputPath
}
