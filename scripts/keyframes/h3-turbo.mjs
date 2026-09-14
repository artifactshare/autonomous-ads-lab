// Keyframe-driven H3 Max Turbo pipeline: for each shot, image-to-video from start→end keyframe (5s @768P),
// time-remap to the shot's duration, concat, then lay the music bed + a hit on every cut.
// Usage: node scripts/keyframes/h3-turbo.mjs <keyframes-dir> <out.mp4> [--only id,id] [--skip-gen]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [dir, out] = process.argv.slice(2)
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null
const skipGen = process.argv.includes('--skip-gen')
const KEY = process.env.FAL_KEY
const EP = 'minimax/h3-max-turbo/image-to-video'
const RES = process.env.H3_RES ?? '768P'
const shots = JSON.parse(readFileSync(join(dir, 'shots.json'), 'utf8')).filter((s) => !only || only.includes(s.id))
const clips = join(dir, 'clips'); mkdirSync(clips, { recursive: true })
const b64 = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64')
const H = { Authorization: 'Key ' + KEY, 'Content-Type': 'application/json' }

async function submit(s) {
  const body = { prompt: s.prompt, image_url: b64(s.startPng), end_image_url: b64(s.endPng), duration: 5, resolution: RES, prompt_expansion_mode: 'balanced' }
  const r = await fetch('https://queue.fal.run/' + EP, { method: 'POST', headers: H, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${s.id}: ${r.status} ${await r.text()}`)
  return r.json()
}
async function wait(j) {
  for (;;) {
    const st = await (await fetch(j.status_url, { headers: H })).json()
    if (st.status === 'COMPLETED') return (await (await fetch(j.response_url, { headers: H })).json()).video.url
    if (st.status === 'FAILED') throw new Error(JSON.stringify(st))
    await new Promise((r) => setTimeout(r, 5000))
  }
}

const raw = (s) => join(clips, `${s.id}.raw.mp4`)
if (!skipGen) {
  const jobs = await Promise.all(shots.map(async (s) => ({ s, j: await submit(s) })))
  console.log('submitted', jobs.map((x) => x.s.id).join(' '))
  for (const { s, j } of jobs) {
    const url = await wait(j)
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    writeFileSync(raw(s), buf); console.log('got', s.id, buf.length)
  }
}

// time-remap each 5s clip to durationSec (motion becomes snappier), strip audio, normalize fps
const parts = []
for (const s of shots) {
  const p = join(clips, `${s.id}.mp4`)
  const factor = s.durationSec / 5
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw(s), '-an', '-vf', `setpts=${factor}*PTS,fps=30,scale=1080:1440:flags=lanczos${s.holdSec ? `,tpad=stop_mode=clone:stop_duration=${s.holdSec}` : ''}`, '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', p])
  parts.push(p)
}
const list = join(clips, 'list.txt'); writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'))
const silent = join(clips, 'video.mp4')
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent])

// audio: bed + a hit at every cut (sfx-click for soft cuts, sfx-whoosh for slams)
const foot = 'data/footage/loop-2026-09-14'
let t = 0; const inputs = ['-i', silent, '-i', join(foot, 'bgm-bed.wav')]; const chains = []; let n = 2
for (const s of shots) {
  const sfx = /slam|hit|thud|drop/i.test(s.prompt) ? 'sfx-whoosh.wav' : 'sfx-click.wav'
  inputs.push('-i', join(foot, sfx)); chains.push(`[${n}]adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)},volume=0.9[h${n}]`); n++
  t += s.durationSec + (s.holdSec ?? 0)
}
const total = t
const mix = `[1]volume=0.45,atrim=0:${total},afade=t=out:st=${total - 1.5}:d=1.5[bed];${chains.join(';')};[bed]${chains.map((_, i) => `[h${i + 2}]`).join('')}amix=inputs=${chains.length + 1}:normalize=0[a]`
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out])
console.log('wrote', out, `${total}s`)
