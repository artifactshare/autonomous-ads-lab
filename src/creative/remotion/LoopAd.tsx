// Footage-mode ad: hook card → split loop (page on top, agent terminal below) → end card.
// Everything that varies between creatives is a prop; the footage is fixed.
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion'
import React from 'react'

export const FPS = 30
const W = 1920, TOP_H = 720, BOT_H = 360

type Crop = { x: number; y: number; w: number; h: number }
type Beat = { src: string; from: number; to: number; crop: Crop; srcW: number; srcH: number; hold?: number }
export type AdProps = {
  hook: string            // opening card, <=60 chars
  hookSeconds: number
  captions: { at: number; text: string }[]
  endTitle: string        // end card headline
  endUrl: string          // end card URL text
  endSeconds: number
  top: Beat[]
  bottom: Beat[]
}

const BROWSER = { srcW: 1920, srcH: 1080 }
const TERM = { srcW: 2560, srcH: 700 }
const CA: Crop = { x: 160, y: 150, w: 1600, h: 600 }
const CR: Crop = { x: 480, y: 0, w: 1440, h: 540 }
const CT: Crop = { x: 0, y: 0, w: 2560, h: 480 }

export const defaultAdProps: AdProps = {
  hook: 'Humans point, agents edit.',
  hookSeconds: 2,
  captions: [
    { at: 0, text: 'A teammate clicks the title and leaves a note' },
    { at: 10.5, text: 'The agent reads the note, edits the file, republishes' },
    { at: 17.5, text: 'Same URL. Humans point, agents edit.' },
  ],
  endTitle: 'Share once. Review at one URL. Any agent.',
  endUrl: 'artifactshare.com',
  endSeconds: 2.5,
  top: [
    { src: 'comment.mp4', from: 2.2, to: 4.2, crop: CA, ...BROWSER },
    { src: 'comment.mp4', from: 4.0, to: 6.0, crop: CA, ...BROWSER },
    { src: 'comment.mp4', from: 7.0, to: 11.5, crop: CA, ...BROWSER },
    { src: 'comment.mp4', from: 12.5, to: 14.5, crop: CA, ...BROWSER, hold: 7 },
    { src: 'reveal.mp4', from: 1.0, to: 4.0, crop: CR, ...BROWSER },
    { src: 'reveal.mp4', from: 9.5, to: 13.5, crop: CR, ...BROWSER },
  ],
  bottom: [
    { src: 'terminal.mp4', from: 0.3, to: 0.4, crop: CT, ...TERM, hold: 10.4 },
    { src: 'terminal.mp4', from: 1.0, to: 4.0, crop: CT, ...TERM },
    { src: 'terminal.mp4', from: 30.5, to: 34.5, crop: CT, ...TERM, hold: 7 },
  ],
}

const beatSeconds = (b: Beat) => b.to - b.from + (b.hold ?? 0)
const sum = (bs: Beat[]) => bs.reduce((a, b) => a + beatSeconds(b), 0)
export const loopSeconds = (p: AdProps) => Math.max(sum(p.top), sum(p.bottom))
export const adDuration = (p: AdProps) => Math.round((p.hookSeconds + loopSeconds(p) + p.endSeconds) * FPS)

const FrozenVideo: React.FC<{ src: string; trimBefore: number; clipFrames: number }> = ({ src, trimBefore, clipFrames }) => {
  const frame = useCurrentFrame()
  const hold = frame >= clipFrames
  return (
    <Sequence from={hold ? frame - (clipFrames - 1) : 0} layout="none">
      <OffthreadVideo src={staticFile(src)} trimBefore={trimBefore} trimAfter={trimBefore + clipFrames} muted style={{ width: '100%', height: '100%', display: 'block' }} />
    </Sequence>
  )
}

const Pane: React.FC<{ beat: Beat; paneW: number; paneH: number }> = ({ beat, paneW, paneH }) => {
  const scale = paneW / beat.crop.w
  return (
    <div style={{ width: paneW, height: paneH, overflow: 'hidden', position: 'relative', background: '#0f1115' }}>
      <div style={{ position: 'absolute', left: -beat.crop.x * scale, top: -beat.crop.y * scale, width: beat.srcW * scale, height: beat.srcH * scale }}>
        <FrozenVideo src={beat.src} trimBefore={Math.round(beat.from * FPS)} clipFrames={Math.round((beat.to - beat.from) * FPS)} />
      </div>
    </div>
  )
}

const Track: React.FC<{ beats: Beat[]; paneW: number; paneH: number }> = ({ beats, paneW, paneH }) => {
  let cursor = 0
  return (
    <>
      {beats.map((b, i) => {
        const from = Math.round(cursor * FPS)
        const dur = Math.round(beatSeconds(b) * FPS)
        cursor += beatSeconds(b)
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <Pane beat={b} paneW={paneW} paneH={paneH} />
          </Sequence>
        )
      })}
    </>
  )
}

const fadeIn = (frame: number, fps: number, dur = 0.35) => ({
  opacity: interpolate(frame, [0, fps * dur], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }),
  y: interpolate(frame, [0, fps * dur], [12, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) }),
})

const Caption: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const a = fadeIn(f, fps)
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: TOP_H - 96, display: 'flex', justifyContent: 'center', opacity: a.opacity, transform: `translateY(${a.y}px)` }}>
      <div style={{ fontFamily: 'LINESeedJP', fontSize: 40, color: '#fff', background: 'rgba(15,17,21,0.85)', padding: '10px 18px', borderRadius: 8 }}>{text}</div>
    </div>
  )
}

const Card: React.FC<{ title: string; sub?: string; big?: boolean }> = ({ title, sub, big }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const a = fadeIn(f, fps, 0.5)
  return (
    <AbsoluteFill style={{ background: '#0f1115', alignItems: 'center', justifyContent: 'center', opacity: a.opacity }}>
      <div style={{ fontFamily: 'LINESeedJP', color: '#fff', fontSize: big ? 84 : 64, lineHeight: 1.15, textAlign: 'center', maxWidth: 1500, transform: `translateY(${a.y}px)` }}>{title}</div>
      {sub ? <div style={{ fontFamily: 'LINESeedJP', color: '#7aa2ff', fontSize: 44, marginTop: 28 }}>{sub}</div> : null}
    </AbsoluteFill>
  )
}

export const LoopAd: React.FC<AdProps> = (p) => {
  const hookF = Math.round(p.hookSeconds * FPS)
  const loopF = Math.round(loopSeconds(p) * FPS)
  const endF = Math.round(p.endSeconds * FPS)
  return (
    <AbsoluteFill style={{ background: '#0f1115' }}>
      <style>{`@font-face{font-family:LINESeedJP;src:url(${staticFile('LINESeedJP-Bold.ttf')})}`}</style>
      <Sequence from={0} durationInFrames={hookF} layout="none"><Card title={p.hook} big /></Sequence>
      <Sequence from={hookF} durationInFrames={loopF} layout="none">
        <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: TOP_H, overflow: 'hidden' }}><Track beats={p.top} paneW={W} paneH={TOP_H} /></div>
        <div style={{ position: 'absolute', top: TOP_H, left: 0, width: W, height: 4, background: '#262b36' }} />
        <div style={{ position: 'absolute', top: TOP_H, left: 0, width: W, height: BOT_H, overflow: 'hidden' }}><Track beats={p.bottom} paneW={W} paneH={BOT_H} /></div>
        {p.captions.map((c, i) => {
          const from = Math.round(c.at * FPS)
          const next = p.captions[i + 1] ? Math.round(p.captions[i + 1]!.at * FPS) : loopF
          return <Sequence key={i} from={from} durationInFrames={next - from} layout="none"><Caption text={c.text} /></Sequence>
        })}
      </Sequence>
      <Sequence from={hookF + loopF} durationInFrames={endF} layout="none"><Card title={p.endTitle} sub={p.endUrl} /></Sequence>
    </AbsoluteFill>
  )
}
