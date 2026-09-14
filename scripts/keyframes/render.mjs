// Render every shot's start/end frame to PNG with Playwright and write shots.json for h3-turbo.mjs.
// Usage: node scripts/keyframes/render.mjs <out-dir>
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { shots } from './shots.mjs'

const out = resolve(process.argv[2] ?? '/Users/coji/progs/artifactshare/media/h3-keyframes')
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1 })
const list = []
for (const s of shots) {
  const entry = { id: s.id, durationSec: s.durationSec, holdSec: s.holdSec, prompt: s.prompt }
  for (const k of ['start', 'end']) {
    await page.setContent(s[k], { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const p = join(out, `${s.id}-${k}.png`)
    await page.screenshot({ path: p })
    entry[`${k}Png`] = p
  }
  list.push(entry); console.log('rendered', s.id)
}
await browser.close()
writeFileSync(join(out, 'shots.json'), JSON.stringify(list, null, 2))
