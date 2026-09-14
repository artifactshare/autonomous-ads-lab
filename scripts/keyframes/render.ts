import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { shots } from './shots.ts'

const WIDTH = 1080
const HEIGHT = 1440
const OUTPUT_DIR = process.env.KEYFRAMES_OUTPUT_DIR ?? '/Users/coji/progs/artifactshare/media/h3-keyframes'

type PlaywrightPage = {
  on(event: 'pageerror', listener: (error: Error) => void): PlaywrightPage
  setContent(html: string, options: { waitUntil: 'networkidle' }): Promise<void>
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>
  screenshot(options: { path: string; fullPage: boolean }): Promise<Buffer>
  close(): Promise<void>
}

type PlaywrightContext = {
  newPage(): Promise<PlaywrightPage>
  close(): Promise<void>
}

type PlaywrightBrowser = {
  newContext(options: {
    viewport: { width: number; height: number }
    deviceScaleFactor: number
  }): Promise<PlaywrightContext>
  close(): Promise<void>
}

type PlaywrightModule = {
  chromium: {
    launch(options?: { headless?: boolean }): Promise<PlaywrightBrowser>
  }
}

const fallbackFontData = (path: string) => `data:font/ttf;base64,${readFileSync(path).toString('base64')}`
const fallbackImageData = (path: string) => `data:image/png;base64,${readFileSync(path).toString('base64')}`
const fallbackFont400 = fallbackFontData('/Users/coji/progs/artifactshare/worktrees/standalone/autonomous-ads-lab/data/footage/loop-2026-09-14/Geist-400.ttf')
const fallbackFont500 = fallbackFontData('/Users/coji/progs/artifactshare/worktrees/standalone/autonomous-ads-lab/data/footage/loop-2026-09-14/Geist-500.ttf')
const fallbackFont600 = fallbackFontData('/Users/coji/progs/artifactshare/worktrees/standalone/autonomous-ads-lab/data/footage/loop-2026-09-14/Geist-600.ttf')
const fallbackLogo = fallbackImageData('/Users/coji/progs/artifactshare/public/docs/brand/png/icon-512.png')

const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

const fallbackSvg = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <style><![CDATA[
      @font-face { font-family: Geist; src: url(${fallbackFont400}); font-weight: 400; }
      @font-face { font-family: Geist; src: url(${fallbackFont500}); font-weight: 500; }
      @font-face { font-family: Geist; src: url(${fallbackFont600}); font-weight: 600; }
    ]]></style>
  </defs>
  <rect width="1080" height="1440" fill="#f7f6f3" />
  ${content}
</svg>`

const svgText = (x: number, y: number, text: string, size: number, fill = '#37352f', weight = 400, extra = '') =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="Geist, Arial, sans-serif" font-size="${size}px" font-weight="${weight}" ${extra}>${escapeXml(text)}</text>`

const svgMonoText = (x: number, y: number, text: string, size: number, fill = '#37352f', weight = 400, extra = '') =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="Menlo, monospace" font-size="${size}px" font-weight="${weight}" ${extra}>${escapeXml(text)}</text>`

const svgImage = (x: number, y: number, width: number, height: number) =>
  `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${fallbackLogo}" preserveAspectRatio="none" />`

const svgWordmark = () => `<g>
  <rect x="56" y="56" width="232" height="50" rx="25" fill="#ffffff" fill-opacity="0.74" stroke="#37352f" stroke-opacity="0.12" />
  ${svgImage(64, 67, 28, 28)}
  ${svgText(102, 84, 'Artifact Share', 16, '#37352f', 600)}
  ${svgText(102, 99, 'artifactshare.com', 11, 'rgba(55,53,47,0.86)', 400)}
</g>`

const svgHeadline = (text: string, y: number, _textLength: number, fill = '#37352f', size = 156, scaleX = 0.73) =>
  `<g transform="translate(72 0) scale(${scaleX} 1)">${svgText(0, y, text, size, fill, 600)}</g>`

const svgStatRow = (stats: string[]) => {
  const gap = 14
  const x = 160
  const width = stats.length === 4 ? 176 : 237
  const y = 780
  return stats.map((stat, index) => {
    const tileX = x + index * (width + gap)
    return `<g>
      <rect x="${tileX}" y="${y}" width="${width}" height="97" rx="6" fill="#f7f6f3" fill-opacity="0.56" stroke="#37352f" stroke-opacity="0.12" />
      ${svgText(tileX + 20, y + 60, stat, 27, '#37352f', 600)}
    </g>`
  }).join('')
}

const svgDocument = (options: {
  tilted: boolean
  stats: string[]
  sentence: string
  highlight?: boolean
  comment?: boolean
}) => {
  const titleGroup = `<g transform="${options.tilted ? 'translate(540 649) rotate(-5) scale(0.85) translate(-540 -649)' : ''}">
    <rect x="110" y="294" width="860" height="710" rx="6" fill="#ffffff" stroke="#37352f" stroke-opacity="0.12" />
    <text x="160" y="365" fill="#1766ad" font-family="Menlo, monospace" font-size="16px" font-weight="500" letter-spacing="1.2">CHECKOUT · PRODUCT DECISION</text>
    ${svgText(160, 430, 'Checkout redesign: one-page checkout', 40, '#37352f', 600, 'letter-spacing="-2.2"')}
    ${svgText(160, 472, 'with saved payment', 40, '#37352f', 600, 'letter-spacing="-2.2"')}
    <rect x="160" y="520" width="760" height="200" rx="6" fill="#ffffff" stroke="#37352f" stroke-opacity="0.12" />
    <text x="188" y="560" fill="#1766ad" font-family="Menlo, monospace" font-size="15px" font-weight="500" letter-spacing="1.2">DECISION NEEDED</text>
    ${options.highlight ? '<rect x="184" y="586" width="700" height="74" rx="3" fill="#cfe3f7" />' : ''}
    ${svgText(188, 618, options.sentence.startsWith('Approve a 3-week') ? 'Approve a 3-week cut: single-page checkout with' : 'Approve a 6-week rebuild of checkout as a single page', 25, 'rgba(55,53,47,0.86)', 400, 'letter-spacing="-0.5"')}
    ${svgText(188, 652, options.sentence.startsWith('Approve a 3-week') ? 'saved payment, using the provider-hosted vault.' : 'with saved payment methods.', 25, 'rgba(55,53,47,0.86)', 400, 'letter-spacing="-0.5"')}
    ${svgStatRow(options.stats)}
    ${options.comment ? `<g>
      <rect x="604" y="684" width="300" height="59" rx="6" fill="#1b1a17" />
      <path d="M 780 743 L 800 743 L 790 755 Z" fill="#1b1a17" />
      ${svgText(625, 721, 'Give me the 3-week cut.', 21, '#ffffff', 500, 'letter-spacing="-0.4"')}
    </g>` : ''}
  </g>`
  return titleGroup
}

const fallbackSvgFor = (shotId: string, frame: 'start' | 'end') => {
  if (shotId === 'hook-a') return fallbackSvg(`${svgWordmark()}${frame === 'end' ? `${svgHeadline('YOUR AGENT', 472, 820, '#37352f', 156, 0.77)}${svgHeadline('WROTE THE SPEC.', 623, 900, '#37352f', 156, 0.70)}` : ''}`)
  if (shotId === 'hook-b') return fallbackSvg(`${svgWordmark()}${svgHeadline('YOUR AGENT', 472, 820, '#37352f', 156, 0.77)}${svgHeadline('WROTE THE SPEC.', 623, 900, '#37352f', 156, 0.70)}${frame === 'end' ? svgHeadline('WHO REVIEWS IT?', 782, 900, '#F76B58', 172, 0.57) : ''}`)
  if (shotId === 'doc') return fallbackSvg(`${svgWordmark()}${svgDocument({ tilted: frame === 'start', stats: ['6 weeks', '2 engineers', 'k', '+11%'], sentence: 'Approve a 6-week rebuild of checkout as a single page with saved payment methods.', highlight: frame === 'end', comment: frame === 'end' })}`)
  if (shotId === 'terminal') return fallbackSvg(`${svgWordmark()}<g>
    <rect x="78" y="340" width="924" height="570" rx="6" fill="#1b1a17" />
    ${frame === 'start' ? `${svgMonoText(136, 460, '~/docs %', 28, '#f7f6f3')}<rect x="264" y="433" width="19" height="31" fill="#f7f6f3" />` : `${svgMonoText(136, 460, '~/docs % claude -p "apply the review comments"', 27, '#f7f6f3')}${svgMonoText(136, 554, 'Changed: 6 wk / k / +11%  →  3 wk / k / +9%', 20, 'rgba(247,246,243,0.70)')}${svgMonoText(136, 604, 'New version: same URL · thread resolved', 20, 'rgba(247,246,243,0.70)')}<circle cx="762" cy="546" r="5.5" fill="#F76B58" />`}
  </g>`)
  if (shotId === 'flip') {
    const document = svgDocument({ tilted: false, stats: frame === 'start' ? ['6 weeks', 'k', '+11%'] : ['3 weeks', 'k', '+9%'], sentence: frame === 'start' ? 'Approve a 6-week rebuild of checkout as a single page with saved payment methods.' : 'Approve a 3-week cut: single-page checkout with saved payment, using the provider-hosted vault.' })
    const headline = frame === 'end' ? `${svgHeadline('NEXT VERSION.', 1175, 840)}${svgHeadline('SAME URL.', 1290, 690)}` : ''
    return fallbackSvg(`${svgWordmark()}${document}${headline}`)
  }
  if (shotId === 'stack') return fallbackSvg(`${svgWordmark()}${frame === 'end' ? `${svgHeadline('SHARE ONCE.', 458, 820, '#37352f', 148, 0.73)}${svgHeadline('REVIEW AT ONE URL.', 631, 920, '#37352f', 148, 0.60)}${svgHeadline('ANY AGENT.', 804, 820, '#F76B58', 148, 0.73)}` : ''}`)
  if (shotId === 'end') return fallbackSvg(`${svgImage(430, 360, 220, 220)}${frame === 'end' ? `${svgText(540, 698, 'Artifact Share', 96, '#37352f', 600, 'text-anchor="middle" letter-spacing="-6"')}${svgText(540, 772, 'artifactshare.com', 25, 'rgba(55,53,47,0.86)', 400, 'text-anchor="middle"') }<rect x="390" y="819" width="300" height="76" rx="38" fill="#1b1a17" />${svgText(540, 867, 'Try it free', 25, '#ffffff', 500, 'text-anchor="middle"')}` : ''}`)
  throw new Error(`Unknown fallback shot: ${shotId}`)
}

const packagePathFromCandidate = (candidate: string) => {
  if (candidate.endsWith('.mjs') || candidate.endsWith('.js')) return candidate
  return join(candidate, 'index.mjs')
}

const readPackageVersion = (packageDir: string) => {
  try {
    const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { version?: string }
    return packageJson.version
  } catch {
    return undefined
  }
}

const loadPlaywright = async (): Promise<PlaywrightModule> => {
  let normalImportError: unknown
  try {
    return await import('playwright') as unknown as PlaywrightModule
  } catch (error) {
    normalImportError = error
  }

  const candidates: string[] = []
  if (process.env.PLAYWRIGHT_MODULE_PATH) {
    candidates.push(packagePathFromCandidate(process.env.PLAYWRIGHT_MODULE_PATH))
  }

  const npxRoot = join(process.env.NPM_CONFIG_CACHE ?? '/Users/coji/.npm', '_npx')
  if (existsSync(npxRoot)) {
    for (const entry of readdirSync(npxRoot)) {
      const packageDir = join(npxRoot, entry, 'node_modules', 'playwright')
      if (readPackageVersion(packageDir) === '1.63.0') {
        candidates.push(join(packageDir, 'index.mjs'))
      }
    }
  }

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      return await import(pathToFileURL(candidate).href) as unknown as PlaywrightModule
    } catch {
      // Try the next candidate, if one is available.
    }
  }

  throw new Error(
    `Could not load Playwright. Install or expose Playwright 1.63.0 with npx playwright. ` +
    `The regular module import failed with: ${String(normalImportError)}`,
  )
}

const waitForAssets = async (page: PlaywrightPage) => {
  await page.evaluate(async () => {
    await document.fonts.ready
    const images = Array.from(document.images)
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve()
      return new Promise<void>((resolveImage) => {
        image.addEventListener('load', () => resolveImage(), { once: true })
        image.addEventListener('error', () => resolveImage(), { once: true })
      })
    }))
  })
}

const pngSize = (pngPath: string) => {
  const png = readFileSync(pngPath)
  if (png.length < 24) throw new Error(`PNG is too small to inspect: ${pngPath}`)
  return {
    bytes: png.length,
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  }
}

const writeFallbackPng = (shotId: string, frame: 'start' | 'end', pngPath: string) => {
  const svg = fallbackSvgFor(shotId, frame)
  const png = execFileSync('rsvg-convert', ['-f', 'png', '-'], { input: svg })
  writeFileSync(pngPath, png)
  return pngSize(pngPath)
}

const writeManifest = () => {
  const manifest = shots.map((shot) => ({
    id: shot.id,
    durationSec: shot.durationSec,
    startPng: join(OUTPUT_DIR, `${shot.id}-start.png`),
    endPng: join(OUTPUT_DIR, `${shot.id}-end.png`),
    prompt: shot.prompt,
  }))
  const manifestPath = join(OUTPUT_DIR, 'shots.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`wrote ${manifestPath} (${statSync(manifestPath).size} bytes)`)
}

const renderFallback = () => {
  console.warn('Playwright Chromium could not launch in this restricted shell; rendering deterministic SVG fallbacks with rsvg-convert.')
  removeStalePngs()
  for (const shot of shots) {
    const startPng = join(OUTPUT_DIR, `${shot.id}-start.png`)
    const endPng = join(OUTPUT_DIR, `${shot.id}-end.png`)
    const start = writeFallbackPng(shot.id, 'start', startPng)
    const end = writeFallbackPng(shot.id, 'end', endPng)
    if (start.width !== WIDTH || start.height !== HEIGHT || end.width !== WIDTH || end.height !== HEIGHT) {
      throw new Error(`Fallback PNG dimensions are not ${WIDTH}x${HEIGHT} for ${shot.id}`)
    }
    if (start.bytes < 10_000 || end.bytes < 10_000) {
      throw new Error(`Fallback PNG is unexpectedly small for ${shot.id}`)
    }
    console.log(`${shot.id}: fallback start ${start.width}x${start.height} ${start.bytes} bytes; end ${end.width}x${end.height} ${end.bytes} bytes`)
  }
  writeManifest()
}

const removeStalePngs = () => {
  const expected = new Set(shots.flatMap((shot) => [`${shot.id}-start.png`, `${shot.id}-end.png`]))
  for (const entry of readdirSync(OUTPUT_DIR)) {
    if (entry.endsWith('.png') && !expected.has(entry)) unlinkSync(join(OUTPUT_DIR, entry))
  }
}

const renderFrame = async (page: PlaywrightPage, html: string, pngPath: string) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await page.setContent(html, { waitUntil: 'networkidle' })
  await waitForAssets(page)
  if (pageErrors.length > 0) {
    throw new Error(`Page error while rendering ${pngPath}: ${pageErrors.map((error) => error.message).join('; ')}`)
  }
  await page.screenshot({ path: pngPath, fullPage: true })
  const dimensions = pngSize(pngPath)
  if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
    throw new Error(`Unexpected PNG dimensions for ${pngPath}: ${dimensions.width}x${dimensions.height}`)
  }
  if (dimensions.bytes < 10_000) {
    throw new Error(`PNG is unexpectedly small for ${pngPath}: ${dimensions.bytes} bytes`)
  }
  return dimensions
}

const main = async () => {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const { chromium } = await loadPlaywright()
  let browser: PlaywrightBrowser | undefined
  let context: PlaywrightContext | undefined
  let page: PlaywrightPage | undefined
  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    })
    page = await context.newPage()
  } catch (error) {
    if (browser) await browser.close().catch(() => undefined)
    console.warn(`Playwright launch failed: ${String(error).split('\n')[0]}`)
    renderFallback()
    return
  }
  const manifest: Array<{
    id: string
    durationSec: number
    startPng: string
    endPng: string
    prompt: string
  }> = []

  try {
    if (!page || !context || !browser) throw new Error('Playwright did not create a browser context')
    removeStalePngs()
    for (const shot of shots) {
      const startPng = join(OUTPUT_DIR, `${shot.id}-start.png`)
      const endPng = join(OUTPUT_DIR, `${shot.id}-end.png`)
      const start = await renderFrame(page, shot.startFrame(), startPng)
      const end = await renderFrame(page, shot.endFrame(), endPng)
      manifest.push({
        id: shot.id,
        durationSec: shot.durationSec,
        startPng,
        endPng,
        prompt: shot.prompt,
      })
      console.log(`${shot.id}: start ${start.width}x${start.height} ${start.bytes} bytes; end ${end.width}x${end.height} ${end.bytes} bytes`)
    }
  } finally {
    await page?.close()
    await context?.close()
    await browser?.close()
  }

  const manifestPath = join(OUTPUT_DIR, 'shots.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`wrote ${manifestPath} (${statSync(manifestPath).size} bytes)`)
}

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
if (resolve(process.cwd()) !== repoRoot) {
  process.chdir(repoRoot)
}

await main()
