// Synthesized ambient bed (our own work, no third-party audio). 34s, 96 BPM, C major: pad + soft pluck arp + sub.
import { writeFileSync } from 'node:fs'
const SR = 44100, LEN = 34, N = SR * LEN, BPM = 96, beat = 60 / BPM
const out = new Float32Array(N)
const f = (m) => 440 * 2 ** ((m - 69) / 12)
const chords = [[60, 64, 67, 71], [67, 71, 74, 78], [57, 60, 64, 67], [65, 69, 72, 76]]
const barLen = beat * 4
let lp = 0
for (let i = 0; i < N; i++) {
  const t = i / SR, bar = Math.floor(t / barLen) % 4, tb = t % barLen
  const env = Math.min(1, tb / 1.2) * Math.min(1, (barLen - tb) / 0.8)
  let v = 0
  for (const m of chords[bar]) {
    const fr = f(m - 12)
    for (const d of [-0.4, 0, 0.4]) { const w = fr * 2 ** (d / 1200); v += Math.sin(2 * Math.PI * w * t) * 0.5 + Math.sin(4 * Math.PI * w * t) * 0.18 + Math.sin(6 * Math.PI * w * t) * 0.07 }
  }
  v = v / 36 * env
  lp += (v - lp) * 0.06
  out[i] += lp * 0.9
}
for (let k = 0; k * beat / 2 < LEN; k++) {
  const t0 = k * beat / 2, bar = Math.floor(t0 / barLen) % 4, ch = chords[bar]
  const m = ch[[0, 2, 1, 3, 2, 0, 3, 1][k % 8]] + 12
  const fr = f(m), start = Math.floor(t0 * SR), dur = Math.floor(0.9 * SR)
  const vel = (k % 4 === 0 ? 0.6 : 0.4) * (0.85 + 0.15 * Math.sin(k))
  for (let i = 0; i < dur && start + i < N; i++) {
    const tt = i / SR, e = Math.exp(-tt * 5) * Math.min(1, tt / 0.004)
    out[start + i] += (Math.sin(2 * Math.PI * fr * tt) + 0.3 * Math.sin(4 * Math.PI * fr * tt) * Math.exp(-tt * 12)) * e * vel * 0.22
  }
}
for (let k = 0; k * beat * 2 < LEN; k++) {
  const t0 = k * beat * 2, bar = Math.floor(t0 / barLen) % 4, fr = f(chords[bar][0] - 24), start = Math.floor(t0 * SR), dur = Math.floor(0.6 * SR)
  for (let i = 0; i < dur && start + i < N; i++) { const tt = i / SR; out[start + i] += Math.sin(2 * Math.PI * fr * tt) * Math.exp(-tt * 4) * Math.min(1, tt / 0.01) * 0.25 }
}
const fadeIn = 0.8 * SR, fadeOut = 2.5 * SR
const pcm = Buffer.alloc(N * 4)
for (let i = 0; i < N; i++) {
  const g = Math.min(1, i / fadeIn, (N - i) / fadeOut)
  const l = Math.tanh(out[i] * 1.6) * g, r = Math.tanh(out[Math.max(0, i - 420)] * 1.6) * g
  pcm.writeInt16LE(Math.round(l * 32767 * 0.7), i * 4); pcm.writeInt16LE(Math.round(r * 32767 * 0.7), i * 4 + 2)
}
const h = Buffer.alloc(44)
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
writeFileSync(process.argv[2] ?? 'bgm-bed.wav', Buffer.concat([h, pcm]))
