// v2: 4:5 feed format, one element per beat, camera that moves to the action,
// kinetic text between scenes, click rings, SFX + ambient bed, tagline end card.
// Follows prompts/knowledge/video-ads.md §6. Footage is the same three real clips.
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion'
import React from 'react'

export const FPS = 30
export const W = 1080, H = 1350

type Focus = { x: number; y: number; scale: number }            // source-pixel point to center, and zoom
type Click = { at: number; x: number; y: number }               // seconds into the beat, source pixels
type Beat = {
  src: string; srcW: number; srcH: number
  from: number; to: number                                       // source seconds
  focus: Focus; focusEnd?: Focus                                 // camera at start / end of the beat (eased)
  clicks?: Click[]
  caption?: string                                               // small caption, bottom third
  hold?: number
}
type Reset = { text: string; seconds: number; sfx?: string }
type Terminal = { command: string; lines: string[]; seconds: number }
type Scene = { kind: 'beat'; beat: Beat } | { kind: 'reset'; reset: Reset } | { kind: 'terminal'; terminal: Terminal }

export type AdV2Props = {
  hook: string
  hookSeconds: number
  scenes: Scene[]
  endTagline: string
  endUrl: string
  endSeconds: number
  bed?: string
}

// Tokens from artifactshare.com (root-*.css): Geist, warm ink, muted paper, link blue, agent purple, 6px radius.
const UI = { bg: '#ffffff', soft: '#f7f6f3', ink: '#37352f', muted: '#37352fdb', accent: '#1766ad', agent: '#6b5ce7', pill: 'rgba(55,53,47,0.92)', radius: 6 }
const BROWSER = { srcW: 1920, srcH: 1080 }
const TERM = { srcW: 2560, srcH: 700 }

export const defaultAdV2Props: AdV2Props = {
  hook: 'Your agent wrote the spec.\nWho reviews it?',
  hookSeconds: 2.4,
  scenes: [
    // 1. reviewer selects the decision line and opens the composer
    { kind: 'beat', beat: { src: 'comment.mp4', ...BROWSER, from: 2.4, to: 6.2, focus: { x: 960, y: 560, scale: 1.4 }, focusEnd: { x: 960, y: 520, scale: 2.3 }, clicks: [{ at: 0.9, x: 845, y: 481 }, { at: 2.7, x: 934, y: 537 }], caption: 'You comment. Right on the doc.' } },
    // 2. one line, post
    { kind: 'beat', beat: { src: 'comment.mp4', ...BROWSER, from: 6.4, to: 11.0, focus: { x: 1030, y: 650, scale: 3.3 }, clicks: [{ at: 2.5, x: 1127, y: 721 }], caption: 'One line is enough.' } },
    { kind: 'reset', reset: { text: 'AI fixes.', seconds: 0.9, sfx: 'sfx-whoosh.wav' } },
    // 3. the agent's real output, typed
    { kind: 'terminal', terminal: { command: 'claude -p "apply the review comments"', lines: ['Comment: "We don\'t have 6 weeks. Give me the 3-week cut."', 'Changed: 6 wk / $38k / +11%  →  3 wk / $19k / +9%, provider-hosted vault', 'New version: Rhgl9f4Xwh9hPLoY  ·  same URL, thread resolved'], seconds: 4.4 } },
    { kind: 'reset', reset: { text: 'Next version.\nSame URL.', seconds: 1.0, sfx: 'sfx-whoosh.wav' } },
    // 4. reveal: the decision card changed, then the resolved thread
    { kind: 'beat', beat: { src: 'reveal.mp4', ...BROWSER, from: 2.0, to: 5.0, focus: { x: 960, y: 590, scale: 2.1 }, caption: '3 weeks. Decided.' } },
    { kind: 'beat', beat: { src: 'reveal.mp4', ...BROWSER, from: 7.0, to: 10.0, focus: { x: 1720, y: 330, scale: 2.4 }, clicks: [{ at: 0.0, x: 1701, y: 123 }], caption: 'Thread resolved.' } },
  ],
  endTagline: 'Share once. Review at one URL.\nAny agent.',
  endUrl: 'artifactshare.com',
  endSeconds: 2.8,
  bed: 'bgm-bed.wav',
}

const beatSeconds = (b: Beat) => b.to - b.from + (b.hold ?? 0)
const sceneSeconds = (s: Scene) => (s.kind === 'beat' ? beatSeconds(s.beat) : s.kind === 'reset' ? s.reset.seconds : s.terminal.seconds)
export const adV2Duration = (p: AdV2Props) => Math.round((p.hookSeconds + p.scenes.reduce((a, s) => a + sceneSeconds(s), 0) + p.endSeconds) * FPS)

// Camera: place the source so that `focus` sits at frame center, scaled so that
// `scale` source pixels map to W/1920 * scale frame pixels (1.0 = fit width).
function camStyle(b: Beat, t: number): React.CSSProperties {
  const dur = b.to - b.from
  const k = b.focusEnd ? interpolate(t, [0, dur], [0, 1], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) }) : 0
  const f = b.focusEnd ? { x: b.focus.x + (b.focusEnd.x - b.focus.x) * k, y: b.focus.y + (b.focusEnd.y - b.focus.y) * k, scale: b.focus.scale + (b.focusEnd.scale - b.focus.scale) * k } : b.focus
  const s = (W / b.srcW) * f.scale
  return { position: 'absolute', width: b.srcW * s, height: b.srcH * s, left: W / 2 - f.x * s, top: H / 2 - f.y * s }
}

const Ring: React.FC<{ c: Click; b: Beat; t: number }> = ({ c, b, t }) => {
  const { fps } = useVideoConfig()
  const age = t - c.at
  if (age < 0 || age > 0.7) return null
  const st = camStyle(b, t)
  const s = (W / b.srcW) * (b.focusEnd ? 1 : 1) // ring drawn in frame space using the same transform
  const left = (st.left as number) + c.x * ((st.width as number) / b.srcW)
  const top = (st.top as number) + c.y * ((st.height as number) / b.srcH)
  const r = interpolate(age, [0, 0.7], [18, 70]); const o = interpolate(age, [0, 0.7], [0.9, 0])
  void s; void fps
  return <div style={{ position: 'absolute', left: left - r, top: top - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `4px solid ${UI.accent}`, opacity: o, pointerEvents: 'none' }} />
}

const BeatView: React.FC<{ b: Beat }> = ({ b }) => {
  const frame = useCurrentFrame()
  const t = Math.min(frame / FPS, b.to - b.from)
  const clipFrames = Math.round((b.to - b.from) * FPS)
  const hold = frame >= clipFrames
  return (
    <AbsoluteFill style={{ background: UI.bg, overflow: 'hidden' }}>
      <div style={camStyle(b, t)}>
        <Sequence from={hold ? frame - (clipFrames - 1) : 0} layout="none">
          <OffthreadVideo src={staticFile(b.src)} trimBefore={Math.round(b.from * FPS)} trimAfter={Math.round(b.from * FPS) + clipFrames} muted style={{ width: '100%', height: '100%', display: 'block' }} />
        </Sequence>
      </div>
      {(b.clicks ?? []).map((c, i) => <Ring key={i} c={c} b={b} t={t} />)}
      {(b.clicks ?? []).map((c, i) => <Sequence key={'s' + i} from={Math.round(c.at * FPS)} durationInFrames={8} layout="none"><Audio src={staticFile('sfx-click.wav')} /></Sequence>)}
      {b.caption ? <SmallCaption text={b.caption} /> : null}
      <Wordmark />
    </AbsoluteFill>
  )
}

const Wordmark: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <div style={{ position: 'absolute', top: 40, left: 44, display: 'flex', alignItems: 'center', gap: 12, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)', border: dark ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(55,53,47,0.12)', borderRadius: 999, padding: '10px 18px 10px 12px' }}>
    <div style={{ width: 26, height: 26, borderRadius: 6, background: UI.accent, color: '#fff', fontFamily: 'Geist', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>as</div>
    <div style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 26, color: dark ? '#fff' : UI.ink }}>Artifact Share</div>
    <div style={{ fontFamily: 'Geist', fontWeight: 400, fontSize: 24, color: dark ? '#c9d1d9' : UI.muted }}>artifactshare.com</div>
  </div>
)

const pop = (frame: number, fps: number) => spring({ frame, fps, config: { damping: 14, stiffness: 160 } })

const SmallCaption: React.FC<{ text: string }> = ({ text }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const p = pop(f, fps)
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, display: 'flex', justifyContent: 'center', opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
      <div style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 52, lineHeight: 1.2, color: '#fff', background: UI.pill, padding: '14px 26px', borderRadius: UI.radius, maxWidth: 940, textAlign: 'center' }}>{text}</div>
    </div>
  )
}

const ResetCard: React.FC<{ r: Reset }> = ({ r }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const p = pop(f, fps)
  return (
    <AbsoluteFill style={{ background: UI.bg, alignItems: 'center', justifyContent: 'center' }}>
      {r.sfx ? <Audio src={staticFile(r.sfx)} /> : null}
      <div style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 104, whiteSpace: 'pre-line', color: UI.ink, textAlign: 'center', lineHeight: 1.1, opacity: p, transform: `scale(${0.9 + 0.1 * p})` }}>{r.text}</div>
    </AbsoluteFill>
  )
}

const TerminalCard: React.FC<{ t: Terminal }> = ({ t }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig()
  const sec = f / fps
  const typed = (text: string, start: number, cps: number) => text.slice(0, Math.max(0, Math.floor((sec - start) * cps)))
  const cmd = typed(t.command, 0.1, 40)
  const starts = [1.2, 2.1, 3.0]
  return (
    <AbsoluteFill style={{ background: '#1b1a17', padding: '120px 70px', justifyContent: 'center' }}>
      <Audio src={staticFile('sfx-click.wav')} startFrom={0} />
      <Wordmark dark />
      <div style={{ fontFamily: 'Menlo, monospace', fontSize: 34, color: '#c9b8ff', marginBottom: 36 }}><span style={{ color: '#8b93a7' }}>~/docs % </span>{cmd}<span style={{ opacity: Math.floor(sec * 2) % 2 ? 1 : 0 }}>▍</span></div>
      {t.lines.map((l, i) => {
        const vis = sec >= starts[i]!; const p = pop(Math.max(0, f - Math.round(starts[i]! * fps)), fps)
        return <div key={i} style={{ fontFamily: 'Menlo, monospace', fontSize: 38, lineHeight: 1.5, color: i === 1 ? '#fff' : '#c9d1d9', marginBottom: 22, opacity: vis ? p : 0, transform: `translateY(${(1 - p) * 14}px)`, wordBreak: 'break-word' }}>{l}</div>
      })}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, textAlign: 'center', fontFamily: 'Geist', fontWeight: 500, fontSize: 52, color: '#fff' }}>Edits the doc. Republishes.</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 62, textAlign: 'center', fontFamily: 'Geist', fontWeight: 400, fontSize: 30, color: '#a9a49a' }}>Claude Code · Codex · Cursor · any agent with a CLI</div>
    </AbsoluteFill>
  )
}

const Hook: React.FC<{ text: string; seconds: number }> = ({ text, seconds }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const p = Math.max(0.85, pop(f, fps))
  const drift = interpolate(f, [0, seconds * fps], [1.0, 1.08])
  return (
    <AbsoluteFill style={{ background: UI.bg, overflow: 'hidden' }}>
      {/* footage keeps moving behind the hook so the opening is not a still */}
      <div style={{ position: 'absolute', left: -200, top: -60, width: 1480, height: 833, transform: `scale(${drift})`, transformOrigin: '50% 50%', opacity: 0.45, filter: 'blur(3px)' }}>
        <OffthreadVideo src={staticFile('comment.mp4')} trimBefore={60} muted style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <div style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 92, lineHeight: 1.12, color: UI.ink, textAlign: 'center', whiteSpace: 'pre-line', opacity: p, transform: `translateY(${(1 - p) * 30}px)`, textShadow: '0 2px 24px rgba(246,247,251,0.9)' }}>{text}</div>
        <div style={{ fontFamily: 'Geist', fontWeight: 500, fontSize: 40, color: UI.accent, opacity: p, background: 'rgba(255,255,255,0.9)', padding: '8px 18px', borderRadius: UI.radius }}>Review AI-written docs at one URL</div>
      </div>
      <Wordmark />
    </AbsoluteFill>
  )
}

const EndCard: React.FC<{ tagline: string; url: string }> = ({ tagline, url }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const p = pop(f, fps); const p2 = pop(Math.max(0, f - 8), fps)
  return (
    <AbsoluteFill style={{ background: UI.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Wordmark />
      <Audio src={staticFile('sfx-success.wav')} />
      <div style={{ fontFamily: 'Geist', fontWeight: 600, fontSize: 84, color: UI.ink, textAlign: 'center', lineHeight: 1.12, maxWidth: 940, whiteSpace: 'pre-line', opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>{tagline}</div>
      <div style={{ marginTop: 48, opacity: p2, background: UI.accent, color: '#fff', fontFamily: 'Geist', fontWeight: 600, fontSize: 44, padding: '20px 44px', borderRadius: UI.radius }}>Try it free → {url}</div>
    </AbsoluteFill>
  )
}

export const LoopAdV2: React.FC<AdV2Props> = (p) => {
  let cursor = Math.round(p.hookSeconds * FPS)
  const total = adV2Duration(p)
  return (
    <AbsoluteFill style={{ background: UI.bg }}>
      <style>{`@font-face{font-family:Geist;font-weight:400;src:url(${staticFile('Geist-400.ttf')})}@font-face{font-family:Geist;font-weight:500;src:url(${staticFile('Geist-500.ttf')})}@font-face{font-family:Geist;font-weight:600;src:url(${staticFile('Geist-600.ttf')})}`}</style>
      {p.bed ? <Audio src={staticFile(p.bed)} volume={0.5} /> : null}
      <Sequence from={0} durationInFrames={Math.round(p.hookSeconds * FPS)} layout="none"><Hook text={p.hook} seconds={p.hookSeconds} /></Sequence>
      {p.scenes.map((s, i) => {
        const from = cursor; const dur = Math.round(sceneSeconds(s) * FPS); cursor += dur
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            {s.kind === 'beat' ? <BeatView b={s.beat} /> : s.kind === 'reset' ? <ResetCard r={s.reset} /> : <TerminalCard t={s.terminal} />}
          </Sequence>
        )
      })}
      <Sequence from={cursor} durationInFrames={total - cursor} layout="none"><EndCard tagline={p.endTagline} url={p.endUrl} /></Sequence>
    </AbsoluteFill>
  )
}
