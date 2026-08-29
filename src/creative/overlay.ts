import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

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

function fontFile(): string {
  const f = FONT_CANDIDATES.find((p) => existsSync(p))
  if (!f) throw new Error('no usable font found for drawtext')
  return f
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\\\'").replace(/:/g, '\\:')

/** Burn hook text + end card onto a video. Returns the output path. */
export function applyOverlay(inputPath: string, outputPath: string, text: OverlayText): string {
  const font = fontFile()
  const common = `fontfile=${font}:fontcolor=white:borderw=3:bordercolor=black@0.85`
  const filters = [
    // Hook: top area, first 40% of the video.
    `drawtext=${common}:fontsize=h/14:text='${esc(text.hook)}':x=(w-text_w)/2:y=h/8:enable='lt(t,2)'`,
    // End card: darken + brand + CTA for the final 1.6s.
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill:enable='gte(t,3.4)'`,
    `drawtext=${common}:fontsize=h/10:text='${esc(text.brand)}':x=(w-text_w)/2:y=(h-text_h)/2-h/12:enable='gte(t,3.4)'`,
    `drawtext=${common}:fontsize=h/16:text='${esc(text.cta)}':x=(w-text_w)/2:y=(h-text_h)/2+h/16:enable='gte(t,3.4)'`,
  ].join(',')
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', inputPath,
    '-vf', filters,
    '-c:a', 'copy',
    outputPath,
  ])
  return outputPath
}
